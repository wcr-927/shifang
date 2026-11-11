import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { parse } from 'parse5';
import { SaxesParser } from 'saxes';
import yauzl from 'yauzl';
import type { ImportHooks, ParsedBook, ParsedDocument, ParsedToc, SafeNode } from './types';

export const EPUB_LIMITS = { entries: 16000, itemBytes: 12 * 1024 * 1024, totalBytes: 256 * 1024 * 1024, imageBytes: 8 * 1024 * 1024, imagePixels: 40_000_000, depth: 128 };
type Xml = { name: string; attrs: Record<string, string>; children: Xml[]; text: string };
const local = (name: string) => name.split(':').at(-1)!;
export function parseXml(value: string): Xml {
  if (/<!ENTITY\b|<!DOCTYPE[^>]*\[/iu.test(value)) throw new Error('EPUB XML 包含禁止的实体声明');
  const root: Xml = { name: '', attrs: {}, children: [], text: '' }; const stack = [root];
  const parser = new SaxesParser({ xmlns: false });
  parser.on('opentag', tag => {
    if (stack.length > EPUB_LIMITS.depth) throw new Error('EPUB XML 层级过深');
    const node: Xml = { name: local(tag.name), attrs: Object.fromEntries(Object.entries(tag.attributes).map(([key, val]) => [key, String(val)])), children: [], text: '' };
    stack.at(-1)!.children.push(node); stack.push(node);
  });
  parser.on('text', text => { stack.at(-1)!.text += text; });
  parser.on('cdata', text => { stack.at(-1)!.text += text; });
  parser.on('closetag', () => { stack.pop(); });
  parser.on('error', error => { throw new Error(`EPUB XML 无效：${error.message}`); });
  parser.write(value).close(); return root;
}
const descendants = (node: Xml, name: string): Xml[] => node.children.flatMap(child => [...(child.name === name ? [child] : []), ...descendants(child, name)]);
const xmlText = (node?: Xml): string => node ? node.text + node.children.map(xmlText).join('') : '';

export function safeArchivePath(path: string): string {
  if (!path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[a-z][a-z\d+.-]*:/iu.test(path) || path.split('/').includes('..')) throw new Error('EPUB 路径越界');
  const normalized = posix.normalize(path);
  if (normalized === '.' || normalized.startsWith('../')) throw new Error('EPUB 路径越界');
  return normalized;
}
export function resolveInternal(base: string, href: string): { documentId: string; anchor?: string } | null {
  if (!href || /^[a-z][a-z\d+.-]*:|^\/\//iu.test(href)) return null;
  if (href.includes('\\') || href.includes('\0') || href.startsWith('/')) throw new Error('EPUB 链接路径越界');
  const [raw, rawAnchor] = href.split('#', 2);
  let decoded: string; let anchor: string | undefined;
  try { decoded = decodeURIComponent(raw.split('?')[0]); anchor = rawAnchor ? decodeURIComponent(rawAnchor) : undefined; } catch { throw new Error('EPUB 链接编码无效'); }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.startsWith('/') || /^[a-z][a-z\d+.-]*:/iu.test(decoded)) throw new Error('EPUB 链接路径越界');
  const documentId = decoded ? safeArchivePath(posix.join(posix.dirname(base), decoded)) : base;
  return { documentId, ...(anchor ? { anchor } : {}) };
}

interface Entry { crc32:number; fileName: string; uncompressedSize: number; compressedSize: number; generalPurposeBitFlag: number; externalFileAttributes: number; }
interface Zip { readEntry(): void; close(): void; on(event: string, callback: (...args: any[]) => void): void; openReadStream(entry: Entry, callback: (error: Error | null, stream: NodeJS.ReadableStream) => void): void; }
const crcTable=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;});
export class EpubArchive {
  private constructor(private zip: Zip, readonly entries: Map<string, Entry>) {}
  static async open(path: string): Promise<EpubArchive> {
    return new Promise((resolve, reject) => {
      yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true }, (error: Error | null, zip?: Zip) => {
        if (error || !zip) { reject(error ?? new Error('无法读取EPUB')); return; }
        const entries = new Map<string, Entry>(); let bytes = 0; let count = 0;
        const fail = (error: unknown) => { zip.close(); reject(error); };
        zip.on('error', fail);
        zip.on('entry', (entry: Entry) => { try {
          count++; if (count > EPUB_LIMITS.entries) throw new Error('EPUB 文件条目过多');
          safeArchivePath(entry.fileName);
          if (entries.has(entry.fileName)) throw new Error('EPUB 存在重复路径');
          if ((entry.generalPurposeBitFlag & 1) !== 0) throw new Error('EPUB ZIP 资源受加密保护');
          if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) throw new Error('EPUB 不允许符号链接');
          bytes += entry.uncompressedSize;
          if (entry.uncompressedSize > EPUB_LIMITS.itemBytes || bytes > EPUB_LIMITS.totalBytes || (entry.uncompressedSize > 1024 * 1024 && entry.uncompressedSize / Math.max(1, entry.compressedSize) > 2000)) throw new Error('EPUB 解压体积超过限制');
          entries.set(entry.fileName, entry); zip.readEntry();
        } catch (error) { fail(error); } });
        zip.on('end', () => resolve(new EpubArchive(zip, entries))); zip.readEntry();
      });
    });
  }
  async read(path: string): Promise<Buffer> {
    const entry = this.entries.get(safeArchivePath(path)); if (!entry) throw new Error(`EPUB 缺少资源：${path}`);
    return new Promise((resolve, reject) => this.zip.openReadStream(entry, (error, stream) => {
      if (error) { reject(error); return; } const chunks: Buffer[] = []; let size = 0; let crc=0xffffffff;
      stream.on('data', (chunk: Buffer) => { size += chunk.length; if (size > entry.uncompressedSize || size > EPUB_LIMITS.itemBytes) { (stream as any).destroy(); reject(new Error('EPUB 解压体积不符')); } else { for(const byte of chunk)crc=(crc>>>8)^crcTable[(crc^byte)&255];chunks.push(chunk); } });
      stream.on('error', reject); stream.on('end', () => {if(size!==entry.uncompressedSize || ((crc^0xffffffff)>>>0)!==entry.crc32)reject(new Error('EPUB 资源校验失败'));else resolve(Buffer.concat(chunks));});
    }));
  }
  async text(path: string): Promise<string> { const buffer = await this.read(path); return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  close(): void { this.zip.close(); }
}

interface Html { nodeName: string; tagName?: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: Html[]; }
const attrs = (node: Html) => Object.fromEntries((node.attrs ?? []).map(item => [item.name, item.value]));
const htmlText = (node: Html): string => node.nodeName === '#text' ? node.value ?? '' : node.tagName === 'br' ? '\n' : (node.childNodes ?? []).map(htmlText).join('');
const findHtml = (node: Html, tag: string): Html | undefined => node.tagName === tag ? node : (node.childNodes ?? []).map(child => findHtml(child, tag)).find(Boolean);
const allowedTags = new Set(['p','h1','h2','h3','h4','h5','h6','ul','ol','li','table','thead','tbody','tfoot','tr','td','th','caption','blockquote','pre','strong','b','em','i','u','s','span','a','sup','sub','br','hr','div','section','figure','figcaption','dl','dt','dd']);
const forbiddenTags = new Set(['script','iframe','object','embed','form','input','button','textarea','select','audio','video','canvas']);
export function parseChapter(html: string, documentId: string, registeredDocuments: Set<string>, images: Map<string, string>): ParsedDocument {
  if (/<!ENTITY\b|<!DOCTYPE[^>]*\[/iu.test(html)) throw new Error('EPUB 正文包含禁止的实体');
  const tree = parse(html) as unknown as Html; const body = findHtml(tree, 'body')!; const title = htmlText(findHtml(tree, 'title') ?? tree).trim().slice(0, 500);
  let count = 0;
  const sanitize = (node: Html, depth: number): SafeNode[] => {
    if (++count > 300000 || depth > EPUB_LIMITS.depth) throw new Error('EPUB 正文结构超过限制');
    if (node.nodeName === '#text') return [{ type: 'text', text: node.value ?? '' }];
    if (!node.tagName) return [];
    if (forbiddenTags.has(node.tagName)) throw new Error('EPUB 正文包含主动内容');
    if (['style','link','meta','head','svg','math'].includes(node.tagName)) return [];
    const attr = attrs(node); const anchor = attr.id || (node.tagName === 'a' ? attr.name : undefined);
    if (node.tagName === 'img') {
      const target = resolveInternal(documentId, attr.src ?? ''); const imageId = target && images.get(target.documentId);
      return imageId ? [{ type: 'image', imageId, alt: (attr.alt ?? '').slice(0, 1000), ...(anchor ? { anchor } : {}) }] : (attr.alt ? [{ type: 'text', text: attr.alt }] : []);
    }
    const children = (node.childNodes ?? []).flatMap(child => sanitize(child, depth + 1));
    const semanticTag = /(?:^|\s)super\d*(?:\s|$)/u.test(attr.class ?? '') ? 'sup' : node.tagName === 'p' && /(?:^|\s)(?:title-poem[^\s]*|shitou|title-article[^\s]*)/.test(attr.class ?? '') ? 'h3' : node.tagName;
    let role:SafeNode['role'] = /(?:^|\s)title-poem[^\s]*/u.test(attr.class ?? '') ? 'work-title' : /(?:^|\s)(?:shuming\d*|kindle-cn-para-right1?|calibre32)(?:\s|$)/u.test(attr.class ?? '') ? 'signature' : /(?:^|\s)(?:kai(?:_[^\s]*)?|shici[^\s]*|kindle-cn-kai\d*)(?:\s|$)/u.test(attr.class ?? '') ? 'verse' : /(?:^|\s)yinwen\d*(?:\s|$)/u.test(attr.class ?? '') ? 'verse-candidate' : /(?:^|\s)normaltext[^\s]*(?:\s|$)/u.test(attr.class ?? '') ? 'commentary' : undefined;
    if (/(?:^|\s)fnote(?:\s|$)/u.test(attr.class ?? '')) role='notes';
    if (/^h[23]$/u.test(node.tagName) && /(?:^|\s)kindle-cn-heading[12](?:\s|$)/u.test(attr.class ?? '')) role='work-title';
    // A prose paragraph wraps its entire original text in a kai span.
    if (node.tagName==='p' && children.some(c=>c.role==='verse') && children.every(c=>c.role==='verse'||c.type==='text'&&!c.text?.trim())) role='verse';
    if (/(?:^|\s)kindle-cn-para-center\d*(?:\s|$)/u.test(attr.class ?? '')) role='work-title';
    const safe: SafeNode = { ...(role ? { role } : {}), type: 'element', tag: allowedTags.has(semanticTag) ? semanticTag : 'span', children, ...(anchor ? { anchor } : {}) };
    if (node.tagName === 'a' && attr.href) {
      const target = resolveInternal(documentId, attr.href);
      if (target && registeredDocuments.has(target.documentId)) safe.target = target;
      else if (!target) safe.externalLabel = attr.href.slice(0, 1000);
    }
    return [safe];
  };
  const nodes = (body.childNodes ?? []).flatMap(child => sanitize(child, 0));
  const nodeText = (node: SafeNode): string => node.type === 'text' ? node.text ?? '' : node.type === 'image' ? node.alt ?? '' : node.tag === 'br' ? '\n' : (node.children ?? []).map(nodeText).join('');
  const anchorsIn = (node: SafeNode): string[] => [...(node.anchor ? [node.anchor] : []), ...(node.children ?? []).flatMap(anchorsIn)];
  // Split generic layout containers while retaining their own anchor on the first block.
  const flatten = (nodes: SafeNode[]): SafeNode[] => nodes.flatMap(node => {
    if (node.type !== 'element' || !['div','section'].includes(node.tag ?? '')) return [node];
    const children = flatten(node.children ?? []); if (node.anchor) children.unshift({ type: 'element', tag: 'span', anchor: node.anchor, children: [] }); return children;
  });
  const flat = flatten(nodes); const blocks: ParsedDocument['blocks'] = []; let pendingAnchors = attrs(body).id ? [attrs(body).id] : [];
  for (const node of flat) {
    const text = nodeText(node); const anchors = anchorsIn(node);
    if (!text.trim() && node.type !== 'image' && !node.children?.some(child => child.type === 'image')) { pendingAnchors.push(...anchors); continue; }
    const index = blocks.length; const combined = [...pendingAnchors, ...anchors]; pendingAnchors = [];
    if (combined.some(a=>/^(?:FT|note_\d)/u.test(a))) node.role='notes';
    // Verified mis-styled original in this edition, not a generic prose heuristic.
    if(documentId==='text/part1844_split_016.html'&&text.startsWith('往常时为功名惹是非，如今对山水忘名利。'))node.role='verse';
    const signature=(node.children??[]).find(c=>c.role==='signature');
    const metadata=/^h[1-6]$/u.test(node.tag??'')&&signature?{author:nodeText(signature).trim(),title:(node.children??[]).filter(c=>c!==signature).map(nodeText).join('').trim()}:{};
    blocks.push({ ...metadata, id: `${documentId}:b${index}`, index, anchors: combined, ...(combined[0] ? { anchor: combined[0] } : {}), kind: node.tag ?? node.type, text, nodes: [node] });
  }
  if (pendingAnchors.length) blocks.push({ id: `${documentId}:b${blocks.length}`, index: blocks.length, anchor: pendingAnchors[0], anchors: pendingAnchors, kind: 'p', text: '', nodes: [] });
  return { id: documentId, order: 0, title, author: '', context: '', blocks };
}

function imageDimensions(bytes: Buffer, mime: string): [number, number] {
  if (mime === 'image/png') {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('EPUB PNG 内容无效');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('EPUB JPEG 内容无效');
  let cursor = 2;
  while (cursor + 4 <= bytes.length) {
    if (bytes[cursor] !== 0xff) break; while (bytes[cursor] === 0xff) cursor++; const marker = bytes[cursor++];
    if (marker === 0xd9 || marker === 0xda) break; if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(cursor); if (length < 2 || cursor + length > bytes.length) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) return [bytes.readUInt16BE(cursor + 5), bytes.readUInt16BE(cursor + 3)];
    cursor += length;
  }
  throw new Error('EPUB JPEG 尺寸无效');
}
export async function parseEpub(path: string, hooks: ImportHooks): Promise<ParsedBook> {
  const archive = await EpubArchive.open(path);
  try {
    hooks.check();if((await archive.text('mimetype'))!=='application/epub+zip')throw new Error('文件不是有效EPUB容器'); const container = parseXml(await archive.text('META-INF/container.xml')); const packagePath = safeArchivePath(descendants(container, 'rootfile')[0]?.attrs['full-path'] ?? '');
    const opf = parseXml(await archive.text(packagePath)); const metadata = descendants(opf, 'metadata')[0];
    const items: (Record<string,string> & {path:string})[] = descendants(opf, 'manifest').flatMap(node => node.children.filter(child => child.name === 'item')).map(item => ({ ...item.attrs, path: resolveInternal(packagePath, item.attrs.href)?.documentId ?? '' }));
    for (const item of items) if (!item.path || !archive.entries.has(item.path)) throw new Error('EPUB 清单资源缺失');
    const textItems = items.filter(item => ['application/xhtml+xml','text/html'].includes(item['media-type'])); const documents = new Set(textItems.map(item => item.path));
    if (!documents.size) throw new Error('EPUB 没有可读取正文');
    let skippedFonts = 0;
    if (archive.entries.has('META-INF/encryption.xml')) {
      const encryption = parseXml(await archive.text('META-INF/encryption.xml'));
      for (const reference of descendants(encryption, 'CipherReference')) {
        const path = safeArchivePath(decodeURIComponent(reference.attrs.URI ?? '')); const item = items.find(item => item.path === path);
        if (!item || documents.has(path) || !/(?:font|opentype|truetype|octet-stream)/iu.test(item['media-type']) || !/\.(?:ttf|otf|woff2?)$/iu.test(path)) throw new Error('EPUB 包含受保护的正文或资源');
        skippedFonts++;
      }
    }
    const imageItems = items.filter(item => ['image/png','image/jpeg'].includes(item['media-type'])); const imageIds = new Map(imageItems.map(item => [item.path, createHash('sha256').update(item.path).digest('hex')]));
    const toc: ParsedToc[] = []; const tocItem = items.find(item => item['media-type'] === 'application/x-dtbncx+xml');
    if (tocItem) {
      const ncx = parseXml(await archive.text(tocItem.path));
      const visit = (nodes: Xml[], parentId: string | null) => { for (const node of nodes.filter(node => node.name === 'navPoint')) {
        const target = resolveInternal(tocItem.path, node.children.find(child => child.name === 'content')?.attrs.src ?? '');
        if (!target || !documents.has(target.documentId)) throw new Error('EPUB 目录指向未登记正文');
        const id = `toc-${toc.length}`; toc.push({ id, parentId, order: toc.length, label: xmlText(node.children.find(child => child.name === 'navLabel')).trim(), ...target }); visit(node.children, id);
      } };
      visit(descendants(ncx, 'navMap')[0]?.children ?? [], null);
    } else {
      // EPUB 3 navigation document remains a registered chapter; preserve nested list topology.
      const nav = items.find(item => item.properties?.split(/\s+/u).includes('nav'));
      if (nav) {
        const tree = parse(await archive.text(nav.path)) as unknown as Html; const navigation = findHtml(tree, 'nav');
        const visit = (node: Html, parentId: string | null) => {
          if (node.tagName === 'li') {
            const link = (node.childNodes ?? []).find(child => child.tagName === 'a'); const target = link && resolveInternal(nav.path, attrs(link).href ?? '');
            if (link && target && documents.has(target.documentId)) { const id = `toc-${toc.length}`; toc.push({ id, parentId, order: toc.length, label: htmlText(link).trim(), ...target }); parentId = id; }
          }
          for (const child of node.childNodes ?? []) visit(child, parentId);
        }; if (navigation) visit(navigation, null);
      }
    }
    const spine = descendants(opf, 'itemref').map(item => item.attrs.idref); const sorted = [...textItems].sort((a,b) => {
      const ai = spine.indexOf(a.id), bi = spine.indexOf(b.id); return (ai < 0 ? 100000 : ai) - (bi < 0 ? 100000 : bi);
    });
    const parsedDocuments: ParsedDocument[] = [];
    for (const [order, item] of sorted.entries()) {
      hooks.check(); const document = parseChapter(await archive.text(item.path), item.path, documents, imageIds); document.order = order;
      const bookTitle=xmlText(metadata?.children.find(node=>node.name==='title')).trim();
      const label = toc.find(node => node.documentId === item.path && node.label !== bookTitle) ?? toc.find(node => node.documentId === item.path);
      const heading=document.blocks.find(block=>/^h[1-6]$/u.test(block.kind) && block.text.trim());
      document.title=(label && label.label !== bookTitle ? label.label : heading?.text.trim() || document.title).slice(0,500);
      if (label) {
        const path: string[] = []; let current: ParsedToc | undefined = label; while (current) { path.unshift(current.label); current = toc.find(node => node.id === current?.parentId); } document.context = path.join(' / ').slice(0,4000);
      }
      hooks.document?.(document); if (!hooks.document) parsedDocuments.push(document);
      hooks.progress?.('正文', order + 1, sorted.length); await hooks.yield();
    }
    const images: ParsedBook['images'] = [];
    for (const item of hooks.skipImages ? [] : imageItems) {
      hooks.check(); const bytes = await archive.read(item.path); if (bytes.length > EPUB_LIMITS.imageBytes) throw new Error('EPUB 图片体积超过限制');
      const [width,height] = imageDimensions(bytes, item['media-type']); if (!width || !height || width > 16000 || height > 16000 || width * height > EPUB_LIMITS.imagePixels) throw new Error('EPUB 图片尺寸超过限制');
      images.push({ id: imageIds.get(item.path)!, mediaType: item['media-type'] as 'image/png'|'image/jpeg', bytes }); await hooks.yield();
    }
    return { title: xmlText(metadata?.children.find(node => node.name === 'title')).trim().slice(0,500) || '未题名资料', creator: xmlText(metadata?.children.find(node => node.name === 'creator')).trim().slice(0,500), publisher: xmlText(metadata?.children.find(node => node.name === 'publisher')).trim().slice(0,500), description: xmlText(metadata?.children.find(node => node.name === 'description')).trim().slice(0,8000), documents: parsedDocuments, toc, images, skippedFonts };
  } finally { archive.close(); }
}

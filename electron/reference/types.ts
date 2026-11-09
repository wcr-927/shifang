/** Private importer/storage representations. Public responses are mapped in the library. */
export interface SafeNode {
  type: 'text' | 'element' | 'image';
  text?: string;
  tag?: string;
  role?: "work-title" | "signature" | "verse" | "verse-candidate" | "commentary" | "notes";
  anchor?: string;
  children?: SafeNode[];
  target?: { documentId: string; anchor?: string };
  externalLabel?: string;
  imageId?: string;
  alt?: string;
}
export interface ParsedBlock { id: string; index: number; anchor?: string; anchors: string[]; kind: string; title?: string; author?: string; text: string; nodes: SafeNode[]; }
export interface ParsedDocument { id: string; order: number; title: string; author: string; context: string; blocks: ParsedBlock[]; }
export interface ParsedToc { id: string; parentId: string | null; order: number; label: string; documentId: string; anchor?: string; }
export interface ParsedImage { id: string; mediaType: 'image/png' | 'image/jpeg'; bytes: Buffer; }
export interface ParsedBook { title: string; creator: string; publisher: string; description: string; documents: ParsedDocument[]; toc: ParsedToc[]; images: ParsedImage[]; skippedFonts: number; }
export interface ImportHooks { skipImages?: boolean; check: () => void; yield: () => Promise<void>; progress?: (stage: string, completed: number, total: number) => void; document?: (document: ParsedDocument) => void; }

import { PaperPopover } from "../components/common/PaperPopover";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { BackupDialog } from '../components/works/BackupDialog';
import { LibraryDialog } from '../components/works/LibraryDialog';
import { LibraryNewWork } from '../components/works/LibraryNewWork';
import { ManuscriptStamp } from '../components/manuscript/ManuscriptUI';
import { desktopApi, getDesktopErrorMessage } from '../services/desktopApi';
import type { WorkFilters } from '../features/works/workFilters';
import { freeCategoryLabels, workTypeLabel, type WorkRoom } from '../shared/work';
import type { QueryWorksRequest, WorkCursor, WorkSummary } from '../shared/workSummary';
import type { LibraryOverview } from '../shared/collections';

export const emptyWorkFilters:WorkFilters={status:'all',genre:'all',room:'all',tag:'',query:''};
export interface LibraryViewState{filters:WorkFilters;scrollTop:number;loadedPages?:number;density?:'comfortable'|'compact';scope?:string;categoryGroup?:NonNullable<QueryWorksRequest>['categoryGroup'];searchOpen?:boolean;selected?:string|null}
export const WORK_PAGE_SIZE=24;
export function summaryQuery(filters:WorkFilters):QueryWorksRequest{
 const free=Object.keys(freeCategoryLabels).includes(filters.genre);
 return{includeArchived:false,limit:WORK_PAGE_SIZE,query:filters.query??'',...(filters.status!=='all'?{status:filters.status,includeArchived:filters.status==='archived'}:{}),...(filters.room&&filters.room!=='all'?{room:filters.room}:{}),...(filters.genre!=='all'?free?{genre:'free',category:filters.genre as keyof typeof freeCategoryLabels}:{genre:filters.genre as 'ci'|'wujue'|'qijue'|'wulv'|'qilv'}:{}),...(filters.tag?{tag:filters.tag}:{})};
}
function publicationError(cause:unknown):string{
 const message=cause instanceof Error?cause.message:'';
 const notices=['没有可导出的作品。','请先关闭当前导出预览。','文集超过100篇，请拆分后导出。','本次内容过多，请拆分文集后导出。','作品不存在','文集不存在'];
 return notices.find(notice=>message.endsWith(notice))??'导出暂时未能打开，请重试。';
}
const genreGroups={regulated:'近体诗',ci:'词',ancient:'古体诗',modern:'现代诗',prose:'古文'};
type Dialog='create-collection'|'rename'|'remove'|'move'|null;
export function WorksPage({onOpenWork,viewState}:{viewState?:MutableRefObject<LibraryViewState>;onOpenWork:(id:string)=>void;onCreateWork:(room?:WorkRoom)=>void}):JSX.Element{
 const local=useRef<LibraryViewState>({filters:{...emptyWorkFilters},scrollTop:0,loadedPages:1}),memory=viewState??local;
 const [filters,setFilterState]=useState(memory.current.filters),[scope,setScopeState]=useState(memory.current.scope??'all'),[categoryGroup,setCategoryGroup]=useState(memory.current.categoryGroup);
 const [searchOpen,setSearchOpen]=useState(memory.current.searchOpen??false),[newOpen,setNewOpen]=useState(false),[backupOpen,setBackupOpen]=useState(false);
 const [works,setWorks]=useState<WorkSummary[]>([]),[overview,setOverview]=useState<LibraryOverview|null>(null),[total,setTotal]=useState(0),[cursor,setCursor]=useState<WorkCursor|null>(null);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[error,setError]=useState(''),[operationError,setOperationError]=useState(''),[busy,setBusy]=useState(false),[moreBusy,setMoreBusy]=useState(false);
 const [selected,setSelected]=useState<string|null>(memory.current.selected??null),[menuAnchor,setMenuAnchor]=useState<HTMLElement|null>(null),[dialog,setDialog]=useState<Dialog>(null),[name,setName]=useState(''),[dialogError,setDialogError]=useState('');
 const list=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null),generation=useRef(0),mounted=useRef(false);
 const side=useRef<HTMLElement>(null);
 const [collectionMenu,setCollectionMenu]=useState<HTMLElement|null>(null);
 const filterPanel=useRef<HTMLElement>(null);
 useEffect(()=>{
  if(!searchOpen)return;
  const close=(event:MouseEvent)=>{const target=event.target;if(!(target instanceof Node)||filterPanel.current?.contains(target)||(target instanceof window.Element&&target.closest('button,a,input,textarea,select,[role="dialog"],.paper-popover')))return;setSearchOpen(false);memory.current.searchOpen=false;};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSearchOpen(false);memory.current.searchOpen=false;}};
  document.addEventListener('click',close,true);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('click',close,true);document.removeEventListener('keydown',escape);};
 },[searchOpen,memory]);
 useLayoutEffect(()=>{
  if(!searchOpen)return;
  const measure=()=>filterPanel.current?.querySelectorAll<HTMLElement>('.library-filter-line>div').forEach(row=>{const button=row.querySelector<HTMLElement>('button[aria-pressed=true]');if(!button)return;const r=row.getBoundingClientRect(),b=button.getBoundingClientRect();row.style.setProperty('--filter-marker-x',`${b.left-r.left+b.width/2-7}px`);row.style.setProperty('--filter-marker-y',`${b.bottom-r.top+3}px`);});
  measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);if(filterPanel.current)observer?.observe(filterPanel.current);return()=>observer?.disconnect();
 },[searchOpen,categoryGroup,filters.status,scope]);

 useLayoutEffect(()=>{const root=side.current,box=root?.querySelector<HTMLElement>('.library-collections');if(!root||!box)return;const measure=()=>root.style.setProperty('--collection-gutter',`${Math.max(0,box.offsetWidth-box.clientWidth)}px`);measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(box);return()=>observer?.disconnect();},[]);
 const collections=overview?.collections??[],collection=collections.find(c=>c.id===scope),chosen=works.find(w=>w.id===selected);
 const request:QueryWorksRequest={...summaryQuery(filters),...(categoryGroup?{categoryGroup}:{}),...(scope==='none'?{collectionId:null}:collection?{collectionId:scope}:!['all','none','archived'].includes(scope)?{collectionId:scope}:{}),...(scope==='archived'?{status:'archived',includeArchived:true}:{})};
 const requestKey=JSON.stringify(request);
 const load=useCallback(async()=>{const token=++generation.current;setStatus('loading');setError('');setMoreBusy(false);try{
  const pages=memory.current.loadedPages??1;let next:WorkCursor|null=null,items:WorkSummary[]=[],count=0,loaded=0;
  for(let i=0;i<pages;i++){const result=await desktopApi.works.query({...JSON.parse(requestKey),...(next?{cursor:next}:{})});if(token!==generation.current)return;items.push(...result.items);next=result.nextCursor;count=result.total;loaded++;if(!next)break;}
  const stats=await desktopApi.works.collectionOverview();if(token!==generation.current)return;
  setOverview(stats);setWorks(items);setTotal(count);setCursor(next);memory.current.loadedPages=loaded;setStatus('ready');
 }catch(cause){if(token===generation.current){setError(getDesktopErrorMessage(cause,'作品暂时无法取阅，请重试。'));setStatus('error');}}},[requestKey,memory]);
 const latestLoad=useRef(load);latestLoad.current=load;
 useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;generation.current++}},[load]);
 useLayoutEffect(()=>{if(status==='ready'&&list.current)list.current.scrollTop=memory.current.scrollTop;},[works,status,memory]);
 useEffect(()=>{if(searchOpen)search.current?.focus()},[searchOpen]);
 function remember(){memory.current={...memory.current,filters,scope,categoryGroup,searchOpen,selected,scrollTop:list.current?.scrollTop??0};}
 function resetPosition(){setCollectionMenu(null);setMenuAnchor(null);generation.current++;memory.current={...memory.current,scrollTop:0,loadedPages:1};setSelected(null);setOperationError('');}
 function filter(next:WorkFilters){resetPosition();memory.current.filters=next;setFilterState(next);}
 function selectScope(value:string){if(busy)return;resetPosition();memory.current.scope=value;setScopeState(value);}
 function open(id:string){if(busy||moreBusy)return;remember();memory.current.selected=id;setSelected(id);onOpenWork(id);}
 async function more(){if(!cursor||moreBusy||busy)return;const token=++generation.current;setMoreBusy(true);setOperationError('');try{const result=await desktopApi.works.query({...request,cursor});if(token!==generation.current)return;remember();setWorks(previous=>[...previous,...result.items.filter(i=>!previous.some(p=>p.id===i.id))]);setCursor(result.nextCursor);memory.current.loadedPages=(memory.current.loadedPages??1)+1;}catch(cause){if(token===generation.current)setOperationError(getDesktopErrorMessage(cause,'更多作品未能加载，请重试。'))}finally{if(token===generation.current)setMoreBusy(false)}}
 function showDialog(value:Dialog){(collectionMenu??menuAnchor)?.focus();setCollectionMenu(null);setMenuAnchor(null);setDialogError('');setName(value==='rename'?collection?.name??'':'');setDialog(value)}
 async function operate(job:()=>Promise<unknown>,close=false){if(busy)return;setMenuAnchor(null);setBusy(true);setOperationError('');setDialogError('');try{await job();if(!mounted.current)return;if(close)setDialog(null);await latestLoad.current();}catch(cause){const message=getDesktopErrorMessage(cause,'操作未完成，请重试。');if(dialog)setDialogError(message);else setOperationError(message);}finally{if(mounted.current)setBusy(false)}}
 async function submitName(){await operate(async()=>{if(dialog==='create-collection')await desktopApi.works.createCollection(name);else await desktopApi.works.renameCollection(scope,name);},true)}
 const heading=scope==='all'?'我的作品':scope==='none'?'未归集':scope==='archived'?'已归档':collection?.name??'文集';
 const scopeButton=(id:string,label:string,count:number)=><button className="library-scope" type="button" key={id} aria-pressed={scope===id} disabled={busy} onClick={()=>selectScope(id)}><span>{label}</span><span>{count}</span></button>;
 return <section className="works-page library-paper" data-manuscript-ui aria-busy={status==='loading'||moreBusy}>

 <div className="library-sheet"><aside ref={side} className="library-sidebar"><div>{scopeButton('all','全部作品',overview?.all??total)}{scopeButton('none','未归集',overview?.uncollected??0)}</div><div className="library-collection-heading"><span>文集</span><button aria-label="新建文集" onClick={()=>showDialog('create-collection')}>+</button></div><div className="library-collections">{collections.map(c=>scopeButton(c.id,c.name,c.count))}</div><div className="library-archive">{scopeButton('archived','已归档',overview?.archived??0)}</div></aside>
 <main className="library-main"><header className="library-heading"><div><h1>{heading}</h1><span>{total} 篇</span></div><div className="library-heading-actions"><ManuscriptStamp data-library-search-toggle aria-expanded={searchOpen} onClick={()=>{setSearchOpen(!searchOpen);memory.current.searchOpen=!searchOpen}}>查找</ManuscriptStamp><ManuscriptStamp onClick={()=>setNewOpen(true)}>新作</ManuscriptStamp>{collection?<button className="library-collection-menu" aria-label="文集操作" aria-expanded={!!collectionMenu} onClick={e=>{setMenuAnchor(null);setCollectionMenu(collectionMenu?null:e.currentTarget)}}>···</button>:null}</div></header>
 {collection&&collectionMenu?<PaperPopover anchor={collectionMenu} label="文集操作" onClose={()=>setCollectionMenu(null)}><button disabled={busy||collection.count===0} onClick={()=>{setCollectionMenu(null);setOperationError('');void desktopApi.works.openPublication({collectionId:collection.id}).catch(e=>setOperationError(publicationError(e)))}}>导出文集</button><button disabled={busy} onClick={()=>showDialog('rename')}>重命名</button><button disabled={busy} onClick={()=>showDialog('remove')}>删除文集</button></PaperPopover>:null}
 <section ref={filterPanel} className="library-filters" hidden={!searchOpen} aria-label="查找作品"><input ref={search} aria-label="查找作品题名" placeholder="题名" value={filters.query??''} maxLength={200} onChange={e=>filter({...filters,query:e.target.value})}/><div className="library-filter-line"><span>文体</span><div>{[['','全部'],...Object.entries(genreGroups)].map(([id,label])=><button key={id} aria-pressed={(categoryGroup??'')===id} onClick={()=>{resetPosition();setCategoryGroup(id as typeof categoryGroup||undefined);memory.current.categoryGroup=id as typeof categoryGroup||undefined;const next={...filters,genre:'all' as const,room:'all' as const};memory.current.filters=next;setFilterState(next);}}>{label}</button>)}<span className="library-filter-indicator" aria-hidden="true"/></div></div>{scope!=='archived'?<div className="library-filter-line"><span>状态</span><div>{([['all','全部'],['draft','草稿'],['completed','已完成']] as const).map(([id,label])=><button key={id} aria-pressed={filters.status===id} onClick={()=>filter({...filters,status:id})}>{label}</button>)}<span className="library-filter-indicator" aria-hidden="true"/></div></div>:null}</section>
 {chosen&&menuAnchor?<PaperPopover anchor={menuAnchor} onClose={()=>setMenuAnchor(null)} label="作品操作"><button onClick={()=>open(chosen.id)}>打开</button><button onClick={()=>{setMenuAnchor(null);setOperationError('');void desktopApi.works.openPublication({workId:chosen.id}).catch(e=>setOperationError(publicationError(e)))}}>导出</button><button disabled={busy} onClick={()=>showDialog('move')}>归入文集</button>{collection&&!categoryGroup&&!filters.query&&filters.status==='all'&&filters.genre==='all'&&(!filters.room||filters.room==='all')&&!filters.tag?<><button disabled={busy||works[0]?.id===chosen.id} onClick={()=>void operate(()=>desktopApi.works.reorderCollectionWork(chosen.id,'up'))}>上移</button><button disabled={busy||!cursor&&works.at(-1)?.id===chosen.id} onClick={()=>void operate(()=>desktopApi.works.reorderCollectionWork(chosen.id,'down'))}>下移</button></>:null}<button disabled={busy} onClick={()=>void operate(()=>chosen.status==='archived'?desktopApi.works.unarchive(chosen.id):desktopApi.works.archive(chosen.id))}>{chosen.status==='archived'?'取消归档':'归档'}</button></PaperPopover>:null}
 {operationError?<p role="alert">{operationError}</p>:null}{status==='error'?<p role="alert">{error}<button onClick={()=>void load()}>重试</button></p>:null}
 <div ref={list} className="library-work-list" onScroll={e=>{if(status==='ready')memory.current.scrollTop=e.currentTarget.scrollTop}}>
 {status==='loading'?<p className="library-empty" role="status">正在取阅…</p>:status==='ready'&&!works.length?<p className="library-empty">{filters.query||categoryGroup||filters.status!=='all'?'没有相合的作品':'暂无作品'}</p>:null}
 {status==='ready'?works.map(work=><div key={work.id} className={`library-work-row${selected===work.id?' is-selected':''}`}><button className="library-work-open" type="button" aria-label={`打开：${work.title||'未题'}`} disabled={busy} onClick={()=>{if(searchOpen)open(work.id);else{setSelected(work.id);memory.current.selected=work.id;setMenuAnchor(null);}}} onDoubleClick={()=>{if(!searchOpen)open(work.id)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();open(work.id)}}}><span className="library-work-copy"><span className="library-work-title">{work.title||'未题'}{work.status==='draft'?<i aria-label="草稿"/>:null}</span><span className="library-work-excerpt">{work.preview}</span></span><span className="library-work-type">{work.category==='fu'||work.category==='prose'?'古文':workTypeLabel(work)}</span></button><button className="library-row-menu" aria-label={`操作：${work.title||'未题'}`} aria-expanded={selected===work.id&&!!menuAnchor} disabled={busy} onClick={e=>{setSelected(work.id);memory.current.selected=work.id;setMenuAnchor(menuAnchor===e.currentTarget?null:e.currentTarget)}}>···</button></div>):null}
 {status==='ready'&&cursor?<button className="library-load-more" disabled={moreBusy||busy} onClick={()=>void more()}>{moreBusy?'正在取阅…':'加载更多'}</button>:null}</div>
 </main></div>
 {dialog?<LibraryDialog title={dialog==='create-collection'?'新建文集':dialog==='rename'?'重命名':dialog==='move'?'归入文集':'删除文集'} busy={busy} onClose={()=>setDialog(null)}>
 {dialog==='create-collection'||dialog==='rename'?<form onSubmit={e=>{e.preventDefault();void submitName()}}><input className="library-short-input" aria-label="文集题名" value={name} maxLength={80} onChange={e=>setName(e.target.value)} disabled={busy}/>{dialogError?<p role="alert">{dialogError}</p>:null}<footer><button type="button" disabled={busy} onClick={()=>setDialog(null)}>取消</button><ManuscriptStamp type="submit" disabled={busy||!name.trim()}>{dialog==='create-collection'?'创建':'保存'}</ManuscriptStamp></footer></form>:dialog==='move'?<><div className="library-choice-list">{[{id:null,name:'未归集'},...collections].map(c=><button key={c.id??'none'} disabled={busy} aria-pressed={(chosen?.collectionId??null)===c.id} onClick={()=>chosen&&void operate(()=>desktopApi.works.moveToCollection(chosen.id,c.id),true)}>{c.name}<span className="library-choice-dot"/></button>)}</div>{dialogError?<p role="alert">{dialogError}</p>:null}</>:<><p>删除“{collection?.name}”后，作品会保留并移至“未归集”。</p>{dialogError?<p role="alert">{dialogError}</p>:null}<footer><button disabled={busy} onClick={()=>setDialog(null)}>取消</button><ManuscriptStamp disabled={busy} onClick={()=>void operate(async()=>{await desktopApi.works.removeCollection(scope);memory.current.scope='all';setScopeState('all');},true)}>删除文集</ManuscriptStamp></footer></>}
 </LibraryDialog>:null}
 {newOpen?<LibraryNewWork collectionId={collection?.id??null} onClose={()=>setNewOpen(false)} onCreated={id=>{setNewOpen(false);memory.current={filters:{...emptyWorkFilters},scope:collection?.id??(scope==='none'?'none':'all'),scrollTop:0,loadedPages:1};onOpenWork(id)}}/>:null}
 {backupOpen?<BackupDialog onClose={()=>setBackupOpen(false)} onRestored={()=>{setBackupOpen(false);memory.current={filters:{...emptyWorkFilters},scrollTop:0,loadedPages:1};setScopeState('all');setFilterState({...emptyWorkFilters});void load()}}/>:null}
 </section>;
}

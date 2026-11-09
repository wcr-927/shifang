import { useEffect, useState } from 'react';
import { desktopApi, getDesktopErrorMessage } from '../../services/desktopApi';
import type { ReferenceTocNode, ReferenceTocPage } from '../../shared/reference';
export function OriginalDirectory({sourceId,rootId,onOpen}:{sourceId:string;rootId:string|null;onOpen:(node:ReferenceTocNode)=>void}){
 const [pages,setPages]=useState<Record<string,ReferenceTocPage>>({}),[expanded,setExpanded]=useState(new Set<string>()),[error,setError]=useState('');
 async function load(id:string,offset=0){try{const page=await desktopApi.reference.toc({sourceId,parentId:id==='root'?rootId:id,mode:'original',offset,limit:128});setPages(p=>({...p,[id]:{...page,nodes:offset?[...(p[id]?.nodes??[]),...page.nodes]:page.nodes}}));setError('');}catch(e){setError(getDesktopErrorMessage(e,'目录未能读取'));}}
 useEffect(()=>{void load('root');},[]);
 function branch(id:string):JSX.Element{return <ul>{pages[id]?.nodes.map(n=><li key={n.id}><button onClick={()=>{if(n.hasChildren){setExpanded(p=>{const s=new Set(p);if(s.has(n.id))s.delete(n.id);else s.add(n.id);return s;});if(!pages[n.id])void load(n.id);}else onOpen(n);}}>{n.label}</button>{n.hasChildren?<button className="reading-quiet" onClick={()=>onOpen(n)}>正文</button>:null}{expanded.has(n.id)?branch(n.id):null}</li>)}{pages[id]?.nextOffset!=null?<li><button onClick={()=>void load(id,pages[id].nextOffset!)}>更多篇目</button></li>:null}</ul>;}
 return <div className="reading-original-directory">{error?<p role="alert">{error}<button onClick={()=>void load('root')}>重试</button></p>:null}{branch('root')}</div>;
}

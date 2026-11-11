import ciMetadata from '../ci/metadata.json';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { SourceViewState } from '../features/works/useSourceView';
import { desktopApi } from '../services/desktopApi';
import { homePoems, HOME_POEM_SOURCE } from '../shared/homePoems';
import type { WorkSummary } from '../shared/workSummary';
import { workDisplayTitle } from '../features/works/workDisplayTitle';
import { recentReading, type ReadingLaunch } from '../features/reference/readingLaunch';
import { navigate } from '../app/routes';
import {currentPoem,loadDeck,moveDeck,saveDeck} from '../features/reference/homeDeck';
export function HomePage({onOpenWork,onCreateWork,motion=true,onRead=()=>navigate({kind:'reference'})}:{onOpenWork:(id:string)=>void;onCreateWork:()=>void;viewState?:MutableRefObject<SourceViewState>;motion?:boolean;onRead?:(target:Omit<ReadingLaunch,'revision'>)=>void}){
 const [work,setWork]=useState<WorkSummary|null>(null),[recent]=useState(recentReading),[state,setState]=useState(()=>loadDeck(homePoems.length)),[changing,setChanging]=useState(false),[direction,setDirection]=useState<'previous'|'next'|null>(null),[away,setAway]=useState(document.hidden),[error,setError]=useState(''),[retry,setRetry]=useState(0),[emptyCiTitle,setEmptyCiTitle]=useState('');
 const timer=useRef<ReturnType<typeof setTimeout>>(),busy=useRef(false),keyboard=useRef(false),pointer=useRef<'previous'|'next'|null>(null);const poem=homePoems[currentPoem(state)]??homePoems[0];
 useEffect(()=>{let stale=false;setError('');void desktopApi.works.query({limit:1,status:'draft'}).then(async p=>{if(stale)return;const w=p.items[0]??null;setWork(w);if(w?.genre==='ci'&&!w.title.trim()&&!w.preview.trim()){const full=await desktopApi.works.get(w.id);if(!stale)setEmptyCiTitle(ciMetadata.forms.find(f=>f.id===full?.ci?.formId)?.name??'词')}}).catch(()=>{if(!stale)setError('最近诗稿暂不可用')});const visible=()=>setAway(document.hidden);document.addEventListener('visibilitychange',visible);return()=>{stale=true;clearTimeout(timer.current);document.removeEventListener('visibilitychange',visible)}},[retry]);
 const readRequest=useRef(0);
 useEffect(()=>()=>{readRequest.current++},[]);
 async function readPoem(){
  const request=++readRequest.current;
  const target=await desktopApi.reference.recommendationTarget(poem.id).catch(()=>null);
  if(request===readRequest.current)onRead(target??{bookId:HOME_POEM_SOURCE,nodeId:poem.id,title:poem.title});
 }
 function change(back:boolean){
  if(busy.current||back&&state.cursor===-state.previous.length)return;
  ++readRequest.current;busy.current=true;setChanging(true);
  timer.current=setTimeout(()=>{
   const next=saveDeck(moveDeck(state,back));setState(next);setChanging(false);busy.current=false;
   if(next.cursor===-next.previous.length&&pointer.current==='previous')setDirection(null);
  },matchMedia('(prefers-reduced-motion: reduce)').matches?0:280);
 }
 const switchButton=(kind:'previous'|'next',label:string)=><button disabled={kind==='previous'&&state.cursor===-state.previous.length} className={kind} aria-label={kind==='previous'?'回看上一首诗词':'换一首推荐诗词'} onPointerEnter={()=>{pointer.current=kind;keyboard.current=false;setDirection(kind)}} onPointerMove={()=>{pointer.current=kind;setDirection(kind)}} onPointerLeave={()=>{pointer.current=null;setDirection(null)}} onPointerDown={()=>{keyboard.current=false}} onFocus={e=>{if(keyboard.current||e.currentTarget.matches(':focus-visible')&&pointer.current===null)setDirection(kind)}} onBlur={()=>setDirection(null)} onClick={()=>change(kind==='previous')}>{label}</button>;
 return <section className={`home-scene${!motion||away?' is-still':''}`} data-manuscript-ui><div className="home-landscape" aria-hidden="true"/><div className="home-wash" aria-hidden="true"/><div className="home-atmosphere" aria-hidden="true"><i className="home-mist back"/><i className="home-mist back companion"/><i className="home-mist"/><i className="home-mist companion"/></div><article className={`home-poem${changing?' changing':''}`}><div className="home-poem-content" aria-live="polite"><h1><button aria-label={`阅读全文：${poem.title}`} onClick={()=>void readPoem()}>{poem.title}</button></h1><p className="home-byline">{poem.dynasty} · {poem.author}{poem.excerpt?<span>节选</span>:null}</p><div className="home-verses">{(poem.excerpt??poem.lines).map((line,i)=><p key={i}>{line}</p>)}</div></div><div className="home-poem-switch" data-direction={direction??undefined} onKeyDown={e=>{if(['Tab','Enter',' ','ArrowLeft','ArrowRight'].includes(e.key))keyboard.current=true}} onPointerLeave={()=>{pointer.current=null;setDirection(null)}}>{switchButton('previous','前篇')}<span aria-hidden="true" className="home-switch-line"/>{switchButton('next','再赏')}</div></article><footer className="home-continuations">{work?<div><span>诗稿</span><button onClick={()=>onOpenWork(work.id)}>{emptyCiTitle?`未题 · ${emptyCiTitle}`:workDisplayTitle(work)}</button></div>:<div>{error?<><span role="status">{error}</span><button onClick={()=>setRetry(n=>n+1)}>重试</button></>:<button onClick={onCreateWork}>开始写作</button>}</div>}{recent?<div><span>在读</span><button onClick={()=>onRead(recent)}>{recent.title}</button></div>:<div><button onClick={()=>navigate({kind:'reference'})}>添一本书</button></div>}</footer></section>;
}

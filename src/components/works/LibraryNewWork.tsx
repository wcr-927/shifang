import { useEffect, useState } from 'react';
import { LibraryDialog } from './LibraryDialog';
import { ManuscriptStamp } from '../manuscript/ManuscriptUI';
import { desktopApi, getDesktopErrorMessage } from '../../services/desktopApi';
import type { CiForm } from '../../ci/catalogue';
import type { CreateWorkRequest } from '../../shared/ipc';
import type { WorkGenre } from '../../shared/work';
const types={regulated:'近体诗',ci:'词',ancient:'古体诗',modern:'现代诗',prose:'古文'};
const genres:Record<WorkGenre,string>={wujue:'五言绝句',qijue:'七言绝句',wulv:'五言律诗',qilv:'七言律诗'};
export function LibraryNewWork({collectionId,onClose,onCreated}:{collectionId:string|null;onClose:()=>void;onCreated:(id:string)=>void}){
 const [title,setTitle]=useState(''),[type,setType]=useState<keyof typeof types>('regulated'),[genre,setGenre]=useState<WorkGenre>('qijue');
 const [forms,setForms]=useState<CiForm[]>([]),[formId,setFormId]=useState(''),[rhymeVersion,setRhymeVersion]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ruleError,setRuleError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(type!=='ci')return;let active=true;setRuleError('');void import('../../ci/catalogue').then(m=>{if(active){setForms(m.ciForms);setFormId(old=>m.ciForm(old)?old:m.ciForms[0]?.id??'');setRhymeVersion(m.ciRuleData.dictionary.version);setRuleError(m.ciRuleError)}},()=>{if(active)setRuleError('词谱未能读取，请重试。')});return()=>{active=false}},[type,retry]);
 const form=forms.find(f=>f.id===formId);
 async function create(){if(busy)return;setBusy(true);setError('');try{
  const request:CreateWorkRequest={title:title.trim()||undefined,collectionId,genre:type==='regulated'?genre:type==='ci'?'ci':'free',room:type==='ci'?'ci':type==='modern'?'song':'poetry',category:type==='regulated'||type==='ci'?'unclassified':type};
  if(type==='ci'){if(!form)throw new Error('请先选择可用词谱');request.ci={formId:form.id,version:form.version,rhymeVersion,choices:[]};}
  const work=await desktopApi.works.create(request);onCreated(work.id);
 }catch(cause){setError(getDesktopErrorMessage(cause,'作品未能创建，请重试。'));setBusy(false)}}
 return <LibraryDialog title="新作" busy={busy} onClose={onClose}><form onSubmit={e=>{e.preventDefault();void create()}}><label className="library-field-label" htmlFor="library-new-title">题名</label><input id="library-new-title" className="library-short-input" placeholder="未题" maxLength={200} disabled={busy} value={title} onChange={e=>setTitle(e.target.value)}/><div className="library-field-label">文体</div><div className="library-choices">{Object.entries(types).map(([id,label])=><button type="button" key={id} disabled={busy} aria-pressed={type===id} onClick={()=>setType(id as keyof typeof types)}>{label}</button>)}</div>
 {type==='regulated'?<div className="library-choices library-subchoices">{Object.entries(genres).map(([id,label])=><button type="button" key={id} disabled={busy} aria-pressed={genre===id} onClick={()=>setGenre(id as WorkGenre)}>{label}</button>)}</div>:null}
 {type==='ci'?<><details className="library-form-picker"><summary>{form?`${form.name} · ${form.author}体`:'选择词牌'}</summary><div className="library-choice-list">{forms.map(f=><button type="button" key={f.id} disabled={busy} aria-pressed={formId===f.id} onClick={e=>{setFormId(f.id);e.currentTarget.closest('details')?.removeAttribute('open')}}>{f.name}<small>{f.author}体</small></button>)}</div></details>{ruleError?<p role="alert">{ruleError}<button type="button" onClick={()=>setRetry(n=>n+1)}>重试</button></p>:null}</>:null}
 {error?<p role="alert">{error}</p>:null}<footer><button type="button" disabled={busy} onClick={onClose}>取消</button><ManuscriptStamp type="submit" disabled={busy||type==='ci'&&!form}>{busy?'创建中':'创建'}</ManuscriptStamp></footer></form></LibraryDialog>;
}

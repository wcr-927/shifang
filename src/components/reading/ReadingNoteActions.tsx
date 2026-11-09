import { useState } from 'react';
import { PaperPopover } from '../common/PaperPopover';
export function ReadingNoteActions({hasNote,onDelete}:{hasNote:boolean;onDelete:(kind:'note'|'excerpt')=>Promise<boolean>}){
 const [anchor,setAnchor]=useState<HTMLElement|null>(null),[confirm,setConfirm]=useState<'note'|'excerpt'|null>(null),[busy,setBusy]=useState(false);
 const close=()=>{if(!busy){setAnchor(null);setConfirm(null);}};
 return <><button className="reading-note-more" aria-label="摘记操作" aria-expanded={!!anchor} onClick={e=>{setAnchor(anchor?null:e.currentTarget);setConfirm(null)}}>···</button>{anchor?<PaperPopover anchor={anchor} label="摘记操作" onClose={close}>{confirm?<><p className="reading-delete-scope">{confirm==='note'?'只删除笔记，保留摘录。':'删除摘录及附带笔记。'}</p><button disabled={busy} onClick={async()=>{setBusy(true);try{if(await onDelete(confirm)){setAnchor(null);setConfirm(null);}}finally{setBusy(false);}}}>确认删除</button><button disabled={busy} onClick={()=>setConfirm(null)}>取消</button></>:<><button disabled={!hasNote} onClick={()=>setConfirm('note')}>删除笔记</button><button onClick={()=>setConfirm('excerpt')}>删除摘录</button></>}</PaperPopover>:null}</>;
}

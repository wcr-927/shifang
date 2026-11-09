import { useRef, useState } from 'react';
import { useRetainedScroll } from '../features/reference/useRetainedScroll';
import type { ReadingLaunch } from '../features/reference/readingLaunch';
import { PaperReadingWorkspace } from '../components/reading/PaperReadingWorkspace';
import { NotesOverview } from '../components/reading/NotesOverview';
import { navigate } from '../app/routes';
export function ReferencePage({active=true,mode='reading',launch=null}:{active?:boolean;mode?:'reading'|'notes';launch?:ReadingLaunch|null}):JSX.Element{
 const [noteLaunch,setNoteLaunch]=useState<ReadingLaunch|null>(null);
 const notes=mode==='notes',visited=useRef(false);if(notes)visited.current=true;
 const retainScroll=useRetainedScroll(active+':'+notes);
 return <section data-manuscript-ui className="reference-page reading-workspace" onScrollCapture={retainScroll} hidden={!active} style={{display:active?undefined:'none'}}><div className="reading-view" hidden={notes} style={{display:notes?'none':undefined}}><PaperReadingWorkspace active={active&&!notes} launch={noteLaunch&&(!launch||noteLaunch.revision>launch.revision)?noteLaunch:launch}/></div>{visited.current?<NotesOverview active={active&&notes} onBack={()=>navigate({kind:'reference'})} onOpenSource={note=>{setNoteLaunch({bookId:note.sourceId,sourceId:note.sourceId,title:note.bookTitle,...(note.nodeId.startsWith('chapter:')?{documentId:note.nodeId.slice(8)}:{nodeId:note.nodeId}),returnNotes:true,revision:Date.now()});navigate({kind:'reference'})}}/>:null}</section>;
}

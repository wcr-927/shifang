import { useLayoutEffect, useRef } from 'react';
import { Schema, Slice, Fragment } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { history, undo, redo } from 'prosemirror-history';
import { registerCloseGuard } from '../../services/closeCoordinator';
const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'text*',group:'block',whitespace:'pre',parseDOM:[{tag:'p',preserveWhitespace:'full'}],toDOM:()=>['p',0]},text:{group:'inline'}}});
const decode=(body:string)=>schema.node('doc',null,body.split('\n').map(line=>schema.node('paragraph',null,line?schema.text(line):undefined)));
const encode=(state:EditorState)=>{const lines:string[]=[];state.doc.forEach(n=>lines.push(n.textContent));return lines.join('\n')};
export function AncientEditor({body,identity,onChange,onCharacter}:{body:string;identity:string;onChange:(text:string)=>void;onCharacter:(character:string)=>void}){
 const root=useRef<HTMLDivElement>(null),view=useRef<EditorView>(),latest=useRef({body,onChange,onCharacter});latest.current={body,onChange,onCharacter};
 const composing=useRef(false);
 useLayoutEffect(()=>{
  const v=new EditorView(root.current!,{state:EditorState.create({doc:decode(latest.current.body),plugins:[history()]}),attributes:{class:'ancient-body',role:'textbox','aria-label':'作品正文','aria-multiline':'true',spellcheck:'false'},decorations(state){const marks:Decoration[]=[];state.doc.forEach((node,pos)=>{if(Array.from(node.textContent).length>8||!node.textContent)marks.push(Decoration.node(pos,pos+node.nodeSize,{class:'is-long'}));});return DecorationSet.create(state.doc,marks);},
   dispatchTransaction(tr){const next=v.state.apply(tr);v.updateState(next);if(tr.docChanged&&!composing.current)latest.current.onChange(encode(next));if((tr.selectionSet||tr.docChanged)&&next.selection.empty){const p=next.selection.$head,text=p.parent.textContent,offset=Math.min(p.parentOffset,Math.max(0,text.length-1));const char=p.parentOffset>=text.length?Array.from(text).at(-1):String.fromCodePoint(text.codePointAt(offset)??0);latest.current.onCharacter(char&&/\p{Script=Han}/u.test(char)?char:'');}},
   handleKeyDown(v,e){if(e.isComposing||composing.current)return false;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z')return(e.shiftKey?redo:undo)(v.state,v.dispatch);
    if(e.key==='Enter'){let tr=v.state.tr.deleteSelection();tr=tr.split(tr.selection.from);v.dispatch(tr.scrollIntoView());return true;}
    const {selection}=v.state;if(!selection.empty&&(e.key==='Backspace'||e.key==='Delete')){v.dispatch(v.state.tr.deleteSelection().scrollIntoView());return true;}
    const p=selection.$head;
    if(e.key==='Backspace'&&p.parentOffset===0&&p.index(0)>0){v.dispatch(v.state.tr.join(p.before()).scrollIntoView());return true;}
    if(e.key==='Delete'&&p.parentOffset===p.parent.content.size&&p.index(0)<v.state.doc.childCount-1){v.dispatch(v.state.tr.join(p.after()).scrollIntoView());return true;}
    return false;
   },
   clipboardTextParser(text){return new Slice(Fragment.fromArray(text.replace(/\r\n?/g,'\n').split('\n').map(line=>schema.node('paragraph',null,line?schema.text(line):undefined))),1,1);},
   clipboardTextSerializer(slice){return slice.content.textBetween(0,slice.content.size,'\n');},
   handleDOMEvents:{compositionstart(){composing.current=true;return false},compositionend(){setTimeout(()=>{if(!v.isDestroyed){composing.current=false;latest.current.onChange(encode(v.state));}},0);return false}},
  });view.current=v;const off=registerCloseGuard(()=>composing.current?'请先完成或取消正在输入的文字。':undefined);return()=>{off();v.destroy();view.current=undefined;composing.current=false};
 },[identity]);
 useLayoutEffect(()=>{const v=view.current;if(!v||composing.current||encode(v.state)===body)return;const doc=decode(body),pos=Math.min(v.state.selection.from,doc.content.size-1);v.updateState(EditorState.create({doc,selection:TextSelection.create(doc,Math.max(1,pos)),plugins:[history()]}));},[body]);
 return <div ref={root} className="ancient-editor"/>;
}

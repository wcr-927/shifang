import { LibraryDialog } from "../works/LibraryDialog";
import { ManuscriptStamp } from "../manuscript/ManuscriptUI";
import { VERSE_GAP } from '../../shared/verseGap';
import { createPortal } from "react-dom";
import { useEditorDialogFocus } from "./useEditorDialogFocus";
import { registerCloseGuard } from "../../services/closeCoordinator";
import { useLayoutEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet, type NodeView } from 'prosemirror-view';

import { history, closeHistory } from 'prosemirror-history';
import type { ToneMarker } from '../../features/editor/toneMarkers';
import { verseDoc, verseBody, pointAt, posAt, verseSelection, replaceVerseTransaction } from '../../features/editor/verseEditorSchema';
import { handleVerseKey, deleteSelected, selectedVerseText, replaceSelected } from '../../features/editor/verseEditorCommands';
import type { VersePoint, VerseSelection } from '../../features/editor/verseDocument';
export interface VerseSlot {
    width: number;
    fontSize: number;
    markers: ToneMarker[];
    breakBefore?: boolean;
    stanza?: string;
    rhymeLabel?: string;
    punctuation?: string;
}
export interface VerseEditorHandle {
    focusAt: (point: VersePoint, selectCharacter?: boolean) => void;
    captureSelection: () => () => void;
}
interface Props {
    body: string;
    slots: VerseSlot[];
    mode: 'ci' | 'metre';
    identity: string;
    onChange: (body: string) => void;
    onSelection?: (point: VersePoint, collapsed: boolean) => void;
    onHover?: (point: VersePoint | undefined) => void;
    onRhyme?: (line: number) => void;
}
export const VerseEditor = forwardRef<VerseEditorHandle, Props>(function VerseEditor(props, forwarded) {
    const host = useRef<HTMLDivElement>(null), viewRef = useRef<EditorView>(), latest = useRef(props), dragging = useRef(false), pendingExternal = useRef<string>();
    latest.current = props;
    const [rejected,setRejected]=useState<{text:string;selection:VerseSelection;body:string}|null>(null);
    const [paste, setPaste] = useState<{
        text: string;
        selection: VerseSelection;
        body: string;
        preview: string[];
        restore: () => void;
    } | null>(null);
    const refreshed = useRef(new Set<() => void>()), composition = useRef<{
        id: number;
        original: EditorState;
        cross: boolean;
    }>(), compositionId = useRef(100000);
    const capture = () => { const v = viewRef.current; if (!v)
        return () => { }; const saved = verseSelection(v.state), scrolls: {
        element: HTMLElement;
        top: number;
        left: number;
    }[] = []; for (let e: HTMLElement | null = v.dom; e; e = e.parentElement)
        scrolls.push({ element: e, top: e.scrollTop, left: e.scrollLeft }); return () => { if (!v.isDestroyed) {
        v.focus();
        v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, posAt(v.state.doc, saved.anchor), posAt(v.state.doc, saved.head))));
        for (const { element, top, left } of scrolls) {
            element.scrollTop = top;
            element.scrollLeft = left;
        }
    } }; };
    useImperativeHandle(forwarded, () => ({ focusAt(point, selectCharacter = false) { const v = viewRef.current; if (v) {
            v.focus();
            const start = posAt(v.state.doc, point), text = v.state.doc.child(Math.min(point.line, v.state.doc.childCount - 1)).textContent, character = String.fromCodePoint(text.codePointAt(point.offset) ?? 0), end = selectCharacter && point.offset < text.length ? start + character.length : start;
            v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, start, end)).setMeta("explicitVerseSelection",true).scrollIntoView());
        } }, captureSelection: capture }), []);
    useLayoutEffect(() => {
        if (!host.current)
            return;
        const refresh = () => { for (const update of refreshed.current)
            update(); };
        let hoverTimer: ReturnType<typeof setTimeout> | undefined;
        let hoveredKey = "";
        let returnTimer: ReturnType<typeof setTimeout>|undefined;
        let clickPoint:VersePoint|undefined;
        let pinnedClick:VersePoint|undefined;
        let clickStart:{x:number;y:number}|undefined;
        let pointer: { x: number; y: number } | undefined;
        const clearHover = () => {
            clearTimeout(returnTimer);clearTimeout(hoverTimer); hoverTimer = undefined;
            globalThis.CSS?.highlights?.delete("verse-hover");
            if (hoveredKey) { hoveredKey = ""; latest.current.onHover?.(undefined); }
        };
        const delayReturn=()=>{clearTimeout(returnTimer);returnTimer=setTimeout(()=>{if(hoveredKey){hoveredKey='';latest.current.onHover?.(undefined)}},350)};
        const hitCharacter=(view:EditorView,x:number,y:number,includeGaps=false)=>{
            const hit=view.posAtCoords({left:x,top:y});if(!hit)return;
            const point=pointAt(view.state.doc,hit.pos);let offset=0;
            for(const character of view.state.doc.child(point.line).textContent){
                const from=posAt(view.state.doc,{line:point.line,offset}),to=from+character.length;
                const a=view.coordsAtPos(from),b=view.coordsAtPos(to,-1);
                if((/\p{Script=Han}/u.test(character)||includeGaps&&character===VERSE_GAP)&&x>=a.left&&x<=b.left&&y>=a.top&&y<=a.bottom)return {line:point.line,offset};
                offset+=character.length;
            }
        };
        const capacities=()=>latest.current.slots.map(s=>Math.round(s.width/(s.fontSize+2)));
        const decorations = (state: EditorState) => { const items: Decoration[] = []; state.doc.forEach((_, offset, index) => { const slot = latest.current.slots[index]; if (slot?.breakBefore || slot?.stanza) {
            items.push(Decoration.widget(offset, () => { const e = document.createElement('div'); e.className = 'verse-break'; e.contentEditable = 'false'; e.setAttribute('aria-hidden', 'true'); if (slot.stanza) {
                e.classList.add('verse-stanza-break');
                const label = document.createElement('span');
                label.textContent = slot.stanza;
                e.append(label);
            } return e; }, { side: -1, key: `break-${index}-${slot.stanza ?? ''}` }));
        } }); return DecorationSet.create(state.doc, items); };
        const view = new EditorView(host.current, { state: EditorState.create({ doc: verseDoc(latest.current.body, latest.current.slots.length,capacities()), plugins: [history()] }), attributes: { class: `verse-editor verse-editor-${props.mode}`, role: 'textbox', 'aria-label': '诗词正文', 'aria-multiline': 'true', spellcheck: 'false' }, decorations,
            nodeViews: { verse(node, view, getPos) {
                    let current = node;
                    const dom = document.createElement('div'), source = document.createElement('span'), marks = document.createElement('div'), empty = document.createElement('div'), end = document.createElement('div');
                    dom.className = 'verse-node';
                    source.className = 'verse-text';
                    source.dataset.verseSource = 'true';
                    source.setAttribute('aria-label', `第${node.attrs.line + 1}句`);
                    dom.dataset.verseLine = String(node.attrs.line);
                    marks.className = 'verse-markers';
                    empty.className = 'verse-empty';
                    end.className = 'verse-end';
                    for (const e of [marks, empty, end]) {
                        e.contentEditable = 'false';
                        e.setAttribute('aria-hidden', 'true');
                    }
                    dom.append(source, marks, empty, end);
                    const update = () => {
                        const index = current.attrs.line, slot = latest.current.slots[index] ?? { width: 250, fontSize: 24, markers: [] };
                        dom.style.setProperty('--verse-font', `${slot.fontSize}px`);
                        dom.style.setProperty('--verse-width', `${slot.width}px`);
                        dom.style.setProperty('--verse-cell', `${slot.fontSize + 2}px`);
                        dom.dataset.empty = String(!current.textContent);
                        dom.classList.toggle('verse-overflow', !latest.current.slots[index]);
                        empty.textContent = '';
                        const text=current.textContent;let offset=0;
                        const addDot=(left:number)=>{const dot=document.createElement('span');dot.textContent='·';dot.style.left=`${left}px`;empty.append(dot)};
                        for(const character of text){if(character===VERSE_GAP){try{const pos=getPos();if(pos!==undefined){const a=view.coordsAtPos(pos+1+offset),b=view.coordsAtPos(pos+1+offset+1,-1);addDot((a.left+b.left)/2-source.getBoundingClientRect().left)}}catch{}}offset+=character.length;}
                        const count=Array.from(text).filter(c=>c===VERSE_GAP||/\p{Script=Han}/u.test(c)).length;
                        for(let i=count;i<Math.round(slot.width/(slot.fontSize+2));i++)addDot((i+.5)*(slot.fontSize+2));
                        end.textContent = '';
                        const punct = document.createElement('span');
                        punct.textContent = slot.punctuation && !/[，。！？；、,.!?;]\s*$/u.test(current.textContent) ? slot.punctuation : '';
                        punct.addEventListener('mousedown', event => { event.preventDefault(); const pos = getPos(); if (pos !== undefined) {
                            view.focus();
                            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1 + current.content.size)));
                        } });
                        end.append(punct);
                        if (slot.rhymeLabel) {
                            const button = document.createElement('button');
                            button.type = 'button';
                            button.textContent = slot.rhymeLabel;
                            button.setAttribute('aria-label', `第${index + 1}句${slot.rhymeLabel}`);
                            button.addEventListener('mousedown', e => e.preventDefault());
                            button.addEventListener('click', () => latest.current.onRhyme?.(index));
                            end.append(button);
                            end.removeAttribute('aria-hidden');
                        }
                        marks.textContent = '';
                        const rootRect = source.getBoundingClientRect(), position = getPos();
                        slot.markers.forEach((m, i) => { const span = document.createElement('span'); span.className = `tone-marker tone-marker-${m.state}`; span.textContent = m.expected; span.title = m.message; let left = (i + .5) * (slot.fontSize + 2); if (position !== undefined && m.end > m.start && m.end <= current.content.size) {
                            try {
                                const a = view.coordsAtPos(position + 1 + m.start, 1), b = view.coordsAtPos(position + 1 + m.end, -1);
                                left = (a.left + b.left) / 2 - rootRect.left;
                            }
                            catch { }
                        } span.style.left = `${left}px`; if (m.expected.length > 1)
                            span.classList.add('verse-wide-mark'); marks.append(span); });
                    };
                    refreshed.current.add(update);
                    queueMicrotask(update);
                    return { dom, contentDOM: source, update(next) { if (next.type !== current.type || next.attrs.line !== current.attrs.line)
                            return false; current = next; requestAnimationFrame(update); return true; }, ignoreMutation(record) { return record.type !== 'selection' && !source.contains(record.target); }, stopEvent(event) { return end.contains(event.target as Node); }, destroy() { refreshed.current.delete(update); } } satisfies NodeView;
                } },
            dispatchTransaction(tr) {
                if(tr.docChanged||tr.getMeta("explicitVerseSelection"))pinnedClick=undefined;
                const blocked=tr.getMeta('rejectedInput');if(blocked){setRejected({...blocked,body:verseBody(view.state.doc)});return;}
                if (composition.current && tr.docChanged)
                    tr.setMeta('composition', composition.current.id);
                if (tr.docChanged) {
                    let valid = true;
                    tr.doc.forEach((n, _p, i) => { if (n.type.name !== 'verse' || n.attrs.line !== i)
                        valid = false; });
                    if (!valid || tr.doc.childCount < latest.current.slots.length) {
                        view.updateState(view.state);
                        return;
                    }
                }
                const next = view.state.apply(tr);
                view.updateState(next);
                clearHover();
                if (tr.docChanged && !composition.current)
                    latest.current.onChange(verseBody(next.doc));
                if (!dragging.current && (tr.selectionSet || tr.docChanged))
                    latest.current.onSelection?.(next.selection.empty&&pinnedClick?pinnedClick:pointAt(next.doc, next.selection.head), next.selection.empty);
                requestAnimationFrame(refresh);
            },
            handleKeyDown(view, event) { pinnedClick=undefined;clearHover(); return handleVerseKey(view,event); },
            handleTextInput(view, from, to, text) { if(composition.current||view.composing)return false;view.dispatch(replaceVerseTransaction(view.state, { anchor: pointAt(view.state.doc, from), head: pointAt(view.state.doc, to) }, text)); return true; },
            handleDOMEvents: {
                beforeinput(view, event) { pinnedClick=undefined;clearHover(); const e = event as InputEvent; if (e.isComposing || view.composing || composition.current)
                    return false; if (e.inputType === 'insertText' && e.data !== null) {
                    e.preventDefault();
                    replaceSelected(view, e.data);
                    return true;
                } if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') {
                    e.preventDefault();
                    deleteSelected(view, e.inputType === 'deleteContentBackward');
                    return true;
                } return false; },
                copy(view, event) { const e = event as ClipboardEvent; if (view.state.selection.empty)
                    return false; e.preventDefault(); e.clipboardData?.setData('text/plain', selectedVerseText(view)); return true; },
                cut(view, event) { const e = event as ClipboardEvent; if (view.state.selection.empty || view.composing)
                    return false; e.preventDefault(); e.clipboardData?.setData('text/plain', selectedVerseText(view)); replaceSelected(view, '', true); return true; },
                paste(view, event) { if (view.composing)
                    return false; const e = event as ClipboardEvent, text = e.clipboardData?.getData('text/plain'); if (text === undefined)
                    return false; e.preventDefault(); if (/[\r\n]/u.test(text)) {
                    const selection = verseSelection(view.state), tr = replaceVerseTransaction(view.state, selection, text);
                    if(tr.getMeta('rejectedInput')){setRejected({text,selection,body:verseBody(view.state.doc)});return true;}
                    setPaste({ text, selection, body: verseBody(view.state.doc), preview: tr.doc.content.content.map(n => n.textContent), restore: capture() });
                }
                else
                    replaceSelected(view, text, true); return true; },
                mousedown(view,event) {const e=event as MouseEvent;
                    if(e.button===0&&!e.shiftKey){const gap=hitCharacter(view,e.clientX,e.clientY,true);if(gap&&view.state.doc.child(gap.line).textContent[gap.offset]===VERSE_GAP){e.preventDefault();pinnedClick=undefined;clearHover();view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,posAt(view.state.doc,gap))));return true;}}
                    const target=e.target as Element,source=target.closest('.verse-node')?.querySelector('.verse-text');
                    if(source&&e.button===0&&!e.shiftKey){const line=Number(source.parentElement!.getAttribute('data-verse-line')),text=view.state.doc.child(line).textContent,box=source.getBoundingClientRect(),slot=latest.current.slots[line];
                        if(slot&&e.clientY>=box.top&&e.clientY<=box.bottom){const index=Math.floor((e.clientX-box.left)/(slot.fontSize+2)),chars=Array.from(text);
                            if(index>=0&&index<Math.round(slot.width/(slot.fontSize+2))&&(chars[index]===VERSE_GAP||chars[index]===undefined)&&!/[，。！？；、,.!?;]/u.test(text)){
                                e.preventDefault();clearHover();view.focus();let tr=view.state.tr;
                                if(index>chars.length)tr=tr.insertText(VERSE_GAP.repeat(index-chars.length),posAt(view.state.doc,{line,offset:text.length}));
                                tr.setSelection(TextSelection.create(tr.doc,posAt(tr.doc,{line,offset:chars.slice(0,index).join('').length+Math.max(0,index-chars.length)})));view.dispatch(tr);return true;
                            }
                        }
                    }
                    clickPoint=hitCharacter(view,e.clientX,e.clientY);pinnedClick=clickPoint;clickStart={x:e.clientX,y:e.clientY};dragging.current=true;clearHover();return false;},
                mouseup(view,event) {const e=event as MouseEvent;const click=clickPoint&&clickStart&&Math.hypot(e.clientX-clickStart.x,e.clientY-clickStart.y)<4;dragging.current=false;pinnedClick=click&&view.state.selection.empty?clickPoint:undefined;latest.current.onSelection?.(click&&view.state.selection.empty?clickPoint!:pointAt(view.state.doc,view.state.selection.head),view.state.selection.empty);clickPoint=undefined;return false;},
                mousemove(view,event) {
                    const e=event as MouseEvent;if(pointer?.x===e.clientX&&pointer?.y===e.clientY)return false;
                    pointer={x:e.clientX,y:e.clientY};clearTimeout(hoverTimer);globalThis.CSS?.highlights?.delete('verse-hover');
                    if(dragging.current||e.buttons||view.composing||composition.current||!view.state.selection.empty){clearHover();return false;}
                    const point=hitCharacter(view,e.clientX,e.clientY);
                    if(!point){delayReturn();return false;}
                    clearTimeout(returnTimer);
                    hoverTimer=setTimeout(()=>{if(view.isDestroyed||dragging.current||view.composing||composition.current||!view.state.selection.empty)return;
                        const from=posAt(view.state.doc,point),character=String.fromCodePoint(view.state.doc.child(point.line).textContent.codePointAt(point.offset)!);
                        const start=view.domAtPos(from),end=view.domAtPos(from+character.length),range=document.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);
                        if(typeof Highlight!=='undefined')CSS.highlights.set('verse-hover',new Highlight(range));
                        hoveredKey=point.line+':'+point.offset;latest.current.onHover?.(point);
                    },200);return false;
                },
                mouseleave(){pointer=undefined;clearTimeout(hoverTimer);globalThis.CSS?.highlights?.delete('verse-hover');delayReturn();return false;},
                blur() { clearHover();return false; },
                compositionstart(view) {
                    pinnedClick=undefined;clearHover();
                    const selection = verseSelection(view.state), cross = selection.anchor.line !== selection.head.line;
                    composition.current = { id: ++compositionId.current, original: view.state, cross };
                    if (cross)
                        view.dispatch(closeHistory(replaceVerseTransaction(view.state, selection, '')));
                    return false;
                },
                compositionend(view,event){const session=composition.current,input=(event as CompositionEvent).data;setTimeout(()=>{
                    if(view.isDestroyed||composition.current!==session||!session)return;
                    view.updateState(session.original);composition.current=undefined;
                    if(input)view.dispatch(closeHistory(replaceVerseTransaction(session.original,verseSelection(session.original),input)));
                    latest.current.onChange(verseBody(view.state.doc));refresh();
                },30);return false;},
            },
        });
        const unregisterClose = registerCloseGuard(() => composition.current ? '请先完成或取消正在输入的文字，再关闭窗口。' : undefined);
        viewRef.current = view;
        Object.assign(view.dom, { verseCaptureSelection: capture });
        const released = () => { dragging.current = false; };
        document.addEventListener('mouseup', released);
        const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => requestAnimationFrame(refresh));
        resize?.observe(view.dom);
        void document.fonts?.ready.then(refresh);
        return () => { clearHover();unregisterClose(); document.removeEventListener('mouseup', released); resize?.disconnect(); view.destroy(); refreshed.current.clear(); viewRef.current = undefined; };
    }, [props.identity]);
    useLayoutEffect(() => { const view = viewRef.current; if (!view)
        return; const current = verseBody(view.state.doc); if (props.body !== current || view.state.doc.childCount < props.slots.length) {
        if (view.composing || composition.current) {
            pendingExternal.current = props.body;
            return;
        }
        const next = verseDoc(props.body, props.slots.length,props.slots.map(s=>Math.round(s.width/(s.fontSize+2)))), selection = verseSelection(view.state);
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, next.content).setDocAttribute('sourceLineCount', next.attrs.sourceLineCount).setDocAttribute('capacities',next.attrs.capacities).setMeta('addToHistory', false);
        tr.setSelection(TextSelection.create(tr.doc, posAt(tr.doc, selection.anchor), posAt(tr.doc, selection.head)));
        view.updateState(view.state.apply(tr));
    } view.updateState(view.state); for (const update of refreshed.current)
        update(); }, [props.body, props.slots]);
    return <>{rejected?createPortal(<VerseInputRecovery text={rejected.text} onClose={()=>setRejected(null)} onApply={text=>{const v=viewRef.current;if(v&&verseBody(v.state.doc)===rejected.body){const tr=replaceVerseTransaction(v.state,rejected.selection,text);if(tr.getMeta('rejectedInput'))return false;setRejected(null);v.dispatch(closeHistory(tr));requestAnimationFrame(()=>v.focus());return true}return false}}/>,document.body):null}<div ref={host} className={`verse-editor-host verse-editor-host-${props.mode}`}/>{paste ? createPortal(<VersePasteDialog preview={paste.preview} onCancel={() => { const restore = paste.restore; setPaste(null); requestAnimationFrame(restore); }} onConfirm={() => { const v = viewRef.current; if (v && verseBody(v.state.doc) === paste.body) {
        v.dispatch(closeHistory(replaceVerseTransaction(v.state, paste.selection, paste.text)));
        setPaste(null);
        requestAnimationFrame(() => v.focus());
    } }}/>, document.body) : null}</>;
});
function VersePasteDialog({ preview, onCancel, onConfirm }: {
    preview: string[];
    onCancel: () => void;
    onConfirm: () => void;
}) { const ref = useRef<HTMLElement>(null); useEditorDialogFocus(ref, onCancel, false); return <div className="verse-paste-backdrop dialog-backdrop"><section ref={ref} className="paste-confirm-dialog" role="dialog" aria-modal="true" aria-label="确认多行粘贴" tabIndex={-1}><h2>确认多行粘贴</h2><pre>{preview.join('\n')}</pre><footer><button onClick={onCancel}>取消</button><button onClick={onConfirm}>确认插入</button></footer></section></div>; }

function VerseInputRecovery({text,onClose,onApply}:{text:string;onClose:()=>void;onApply:(text:string)=>boolean}){
 const [value,setValue]=useState(text),[failed,setFailed]=useState(false);
 return <LibraryDialog title="空位不足" className="verse-recovery-dialog" onClose={onClose}>
 <textarea rows={1} aria-label="待填文字" value={value} onChange={e=>{setValue(e.target.value);setFailed(false)}}/>
 {failed?<p role="alert">文字仍超出空位。</p>:null}
 <footer><ManuscriptStamp onClick={()=>setFailed(!onApply(value))}>填入</ManuscriptStamp></footer>
 </LibraryDialog>;
}

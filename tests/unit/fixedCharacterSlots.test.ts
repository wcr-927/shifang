import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EditorState,TextSelection} from 'prosemirror-state';
import {history,undo,redo} from 'prosemirror-history';
import {replaceFixedVerseSelection} from '../../src/features/editor/verseDocument';
import {verseDoc,verseBody,replaceVerseTransaction,posAt} from '../../src/features/editor/verseEditorSchema';
import {VERSE_GAP as G} from '../../src/shared/verseGap';
import {ciForms} from '../../src/ci/catalogue';
import {analyzeCi,rhymeVersion} from '../../src/ci/analyze';
import {ciToneMarkers,metreToneMarkers} from '../../src/features/editor/toneMarkers';
import {editorLineCharacters} from '../../src/poetry/analysis/editorCoordinates';
const range=(a:number,b=a)=>({anchor:{line:0,offset:a},head:{line:0,offset:b}});
test('delete leaves a slot, filling never moves or overwrites occupied suffix',()=>{
 const removed=replaceFixedVerseSelection(['白日依山尽'],range(2,3),'',[5]);assert.deepEqual(removed.lines,[`白日${G}山尽`]);
 assert.deepEqual(replaceFixedVerseSelection(removed.lines,range(2),'傍',[5]).lines,['白日傍山尽']);
 assert.equal(replaceFixedVerseSelection(removed.lines,range(2),'青山',[5]).rejected,true);
 assert.equal(replaceFixedVerseSelection(['白日依山尽'],range(2),'傍',[5]).rejected,true);
});
test('cross-line deletion, supplementary Han and reverse selection retain positions',()=>{
 const next=replaceFixedVerseSelection(['甲𠀀乙丙','丁戊己'],{anchor:{line:1,offset:2},head:{line:0,offset:1}},'春',[4,3]);
 assert.deepEqual(next.lines,[`甲春${G}${G}`,`${G}${G}己`]);
 assert.equal(replaceFixedVerseSelection([''],range(0),'白日依山尽多',[5]).rejected,true);
});
test('fixed slots survive serialization, undo and redo as one operation',()=>{
 let state=EditorState.create({doc:verseDoc('白日依山尽',1,[5]),plugins:[history()]});
 state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,posAt(state.doc,{line:0,offset:2}),posAt(state.doc,{line:0,offset:3}))));
 state=state.apply(replaceVerseTransaction(state,range(2,3),''));assert.equal(verseBody(state.doc),`白日${G}山尽`);
 assert.equal(verseBody(verseDoc(verseBody(state.doc),1,[5])),`白日${G}山尽`);
 assert.ok(undo(state,tr=>state=state.apply(tr)));assert.equal(verseBody(state.doc),'白日依山尽');assert.ok(redo(state,tr=>state=state.apply(tr)));assert.equal(verseBody(state.doc),`白日${G}山尽`);
});
test('tone positions retain the gap and show it as empty, not a wrong pronunciation',()=>{
 assert.equal(editorLineCharacters(`白日${G}山尽`)[3].character,'山');
 const m=metreToneMarkers(`白日${G}山尽`,null,'仄仄平平仄');assert.equal(m[2].state,'empty');assert.equal(m[3].start,3);
 const form=ciForms[0],body=G+form.lines[0].example.slice(1),analysis=analyzeCi(body,form,{formId:form.id,version:form.version,rhymeVersion,choices:[]});
 assert.equal(ciToneMarkers(body,form.lines[0].pattern,analysis,0)[0].state,'empty');
 assert.ok(analysis.issues.some(i=>i.kind==='incomplete'&&i.offset===0));assert.equal(analysis.issues.some(i=>i.kind==='uncovered'&&i.offset===0),false);
});
test('punctuation does not consume a metrical slot or become a grey dot',()=>{
 assert.deepEqual(replaceFixedVerseSelection([''],range(0),'白日依山尽。',[5]).lines,['白日依山尽。']);
 assert.deepEqual(replaceFixedVerseSelection(['白日依山尽。'],range(2,3),'',[5]).lines,[`白日${G}山尽。`]);
});
test('metre analysis keeps subsequent tone indexes and reports incomplete without a phantom pending reading',async()=>{
 const {readFileSync}=await import('node:fs');const {analyzePoem}=await import('../../src/poetry/analysis/poemAnalyzer');
 const data=(name:string)=>JSON.parse(readFileSync(`src/rules/${name}.json`,'utf8'));
 const lines=[`白日${G}山尽`,'黄河入海流','欲穷千里目','更上一层楼'];
 const result=analyzePoem(lines.join('\n'),data('metre'),data('pingze'),data('reading_rules'),{templateId:'wujue',editorLines:lines});
 assert.equal(result.lines[0].characters[3].character,'山');assert.equal(result.lines[0].characters[2].readingConfirmation,'none');
 assert.equal(result.issues.some(i=>i.code==='READING_UNRESOLVED'&&i.lineIndex===0&&i.characterIndex===2),false);
 assert.equal(result.status,'incomplete');
});

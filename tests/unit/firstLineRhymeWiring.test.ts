import assert from 'node:assert/strict';
import {test} from 'node:test';
import {analyzePoemRequestSchema} from '../../src/shared/ipc.ts';
import {referenceFootStatus,resolveRhymeReference} from '../../src/features/editor/rhymeReference.ts';

test('missing mode remains strict and request accepts only explicit supported modes',()=>{
 const request={text:'',templateId:'wujue',requestId:'mode-test'};
 const missing=analyzePoemRequestSchema.parse(request);
 assert.equal(missing.firstLineRhyme,undefined);
 assert.equal(analyzePoemRequestSchema.parse({...request,firstLineRhyme:'sourced-neighbor'}).firstLineRhyme,'sourced-neighbor');
 assert.equal(analyzePoemRequestSchema.safeParse({...request,firstLineRhyme:'relaxed'}).success,false);
});
test('confirmed borrowing only matches the evidenced main group without altering real candidates',()=>{
 const actual=['ping-2dong'];
 assert.equal(referenceFootStatus('ping-1dong',actual),'mismatch');
 assert.equal(referenceFootStatus('ping-1dong',actual,'ping-1dong'),'match');
 assert.equal(referenceFootStatus('ping-3jiang',actual,'ping-1dong'),'mismatch');
 assert.deepEqual(actual,['ping-2dong']);
});

test('confirmed borrowing redirects remembered automatic references while preserving manual choices',()=>{
 const reference={segmentId:'poem',system:'pingshui' as const,groupId:'first',mode:'automatic' as const};
 const evidence=[{segmentId:'poem',system:'pingshui' as const,groupIds:['main'],lineIndexes:[0,1,3],borrowMainGroupId:'main'}];
 const available=new Set(['first','main']);
 const state={version:1 as const,references:[reference],ancientSegments:[]};
 assert.equal(resolveRhymeReference(state,evidence,[],available).active[0].groupId,'main');
 assert.equal(resolveRhymeReference({...state,references:[{...reference,mode:'manual'}]},evidence,[],available).active[0].groupId,'first');
 assert.equal(resolveRhymeReference(state,[{...evidence[0],borrowMainGroupId:undefined}],[],available).active[0].groupId,'first');
 assert.equal(state.references[0].groupId,'first');
});

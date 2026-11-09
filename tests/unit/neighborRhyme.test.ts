import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeFirstLineNeighborRhyme, SOURCED_NEIGHBOR_RHYME_PAIRS } from '../../src/poetry/analysis/neighborRhyme.ts';
import type { RhymeFootAnalysis } from '../../src/poetry/analysis/poemAnalyzer.ts';
const foot = (lineIndex: number, group: string | null, candidates: string[] = []): RhymeFootAnalysis => ({ lineIndex, character: '风', toneStatus: 'match', rhymeStatus: 'compatible', selectedGroupId: group, candidateGroupIds: group ? [group] : candidates });
const sample = () => [foot(0, 'ping-01dong'), foot(1, 'ping-02dong'), foot(3, 'ping-02dong')];
test('every sourced directed pair can be confirmed with consistent body feet', () => {
  for (const pair of SOURCED_NEIGHBOR_RHYME_PAIRS) {
    const result = analyzeFirstLineNeighborRhyme([foot(0,pair.first),foot(1,pair.main),foot(3,pair.main)], [0,1,3]);
    assert.equal(result?.status, 'confirmed');
    assert.equal(result?.firstGroupId, pair.first);
  }
});
test('rejects body conflict, unknown body, non-neighbor, absent first rhyme and insufficient body', () => {
  for (const feet of [[foot(0,'ping-01dong'),foot(1,'ping-02dong'),foot(3,'ping-03jiang')], [foot(0,'ping-01dong'),foot(1,'ping-02dong'),foot(3,null)], [foot(0,'ping-07yang'),foot(1,'ping-02dong'),foot(3,'ping-02dong')]]) assert.equal(analyzeFirstLineNeighborRhyme(feet,[0,1,3]),undefined);
  assert.equal(analyzeFirstLineNeighborRhyme(sample(),[1,3]),undefined);
  assert.equal(analyzeFirstLineNeighborRhyme(sample(),[0,1]),undefined);
});
test('unknown first tone cannot pass; unresolved group remains possible', () => {
  const feet=sample(); feet[0].toneStatus='unknown';
  assert.equal(analyzeFirstLineNeighborRhyme(feet,[0,1,3]),undefined);
  feet[0]=foot(0,null,['ping-01dong']);
  assert.equal(analyzeFirstLineNeighborRhyme(feet,[0,1,3])?.status,'possible');
  feet[0]=foot(0,null);
  assert.equal(analyzeFirstLineNeighborRhyme(feet,[0,1,3]),undefined);
});

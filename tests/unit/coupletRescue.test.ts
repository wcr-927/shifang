import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analyzePoem } from '../../src/poetry/analysis/poemAnalyzer.ts';
const load = (name: string) => JSON.parse(readFileSync(`src/rules/${name}.json`, 'utf8'));
const metre = load('metre'), pingze = load('pingze'), rules = load('reading_rules');
const run = (text: string, templateId = 'wulv', variantId = 'pingqi-first-unrhymed') => analyzePoem(text, metre, pingze, rules, { templateId, variantId, overrides: text.split(/[，。]/).flatMap((line, lineIndex) => Array.from(line).flatMap((character, characterIndex) => { const candidateId = ({ 烧: "烧:ping-02xiao", 不: "不:ru-05wu", 吹: "吹:ping-04zhi" } as Record<string, string>)[character]; return candidateId ? [{lineIndex, characterIndex, character, candidateId}] : []; })) });
test('source example 野火烧不尽 is rescued by 春风吹又生', () => {
  const result = run('离离原上草，一岁一枯荣。野火烧不尽，春风吹又生。远芳侵古道，晴翠接荒城。又送王孙去，萋萋满别情。');
  assert.equal(result.lines[2].metreAdjustment?.status, 'confirmed');
  assert.equal(result.lines[3].metreAdjustment?.rule, 'couplet-rescue');
  assert.equal(result.lines[2].characters[3].expectedTone, 'ze');
  assert.equal(result.lines[3].characters[2].expectedTone, 'ping');
});
test('source five-ze core and combined self rescue are admitted', () => {
  for (const text of ['夜夜夜夜夜，春春春夜春', '夜夜夜夜夜，夜春春夜春']) {
    const result = run(text, 'wujue', 'zeqi-first-unrhymed');
    assert.equal(result.lines[0].metreAdjustment?.status, 'confirmed');
    assert.equal(result.lines[0].characters[0].isFlexible, true);
    assert.equal(result.lines[0].characters[2].isFlexible, true);
    assert.equal(result.lines[1].characters[0].isFlexible, true);
    assert.equal(result.lines[0].characters[3].isFlexible, false);
    assert.equal(result.lines[1].characters[2].isFlexible, false);
  }
});
test('seven-character source pattern allows combined rescue', () => {
  const result = run('一身报国有万死，双鬓向人无再青', 'qijue', 'pingqi-first-unrhymed');
  assert.equal(result.lines[0].metreAdjustment?.status, 'confirmed');
  assert.equal(result.lines[1].metreAdjustment?.combinedSelfRescue, true);
});
test('missing compensation, wrong second tone, wrong foot do not confirm', () => {
  for (const text of ['野火烧不尽，春风夜又生', '野火烧不尽，春夜吹又生', '野火烧不尽，春风吹又夜']) {
    const result = run(text, 'wujue', 'zeqi-first-unrhymed');
    assert.notEqual(result.lines[0].metreAdjustment?.status, 'confirmed');
    assert.ok(result.issues.some(i => i.code === 'TONE_MISMATCH'));
  }
});
test('ambiguous and missing readings cannot certify or choose readings', () => {
  for (const character of ['长', '龘']) {
    const result = run(`夜夜春夜夜，春春${character}夜春`, 'wujue', 'zeqi-first-unrhymed');
    assert.equal(result.lines[0].metreAdjustment?.status, 'possible');
    assert.ok(result.issues.some(i => i.code === 'RULE_PRECONDITION_UNRESOLVED'));
    assert.notEqual(result.lines[1].characters[2].readingConfirmation, 'selected');
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeCase, analyzeFixture, regularLines } from "../helpers/analysisFixture.ts";

test("R1 scope: valid analyzed skeleton reports the unclosed excluded UTF-16 range", () => {
  const source = "夜夜春春夜（这里还有正文";
  const result = analyzeFixture([source, ...regularLines.slice(1)]);
  assert.equal(result.status, "valid", "status describes analyzed local checks");
  assert.equal(result.scope.complete, false);
  assert.deepEqual(result.scope.warnings, [{ code: "UNCLOSED_ANNOTATION", coordinateSpace: "editor-line", lineIndex: 0, start: 5, end: source.length, text: source.slice(5) }]);
  assert.deepEqual(result.normalizedLines.map(l => l.text), regularLines);
  assert.equal(result.issues.some(i => i.code === "RHYME_GROUP" || i.code === "TONE_MISMATCH"), false);
});
for (const [name, source, start] of [["Chinese", "𠮷春（注【未完", 3], ["English", "春𠮷(note", 3], ["nested inner", "春（注【未完】", 1]] as const) {
  test(`R1 scope: ${name} partial line keeps raw offsets and excluded text`, () => {
    const result = analyzeFixture([source, "", "", ""]);
    const warning = result.scope.warnings[0];
    assert.equal(warning.start, start); assert.equal(warning.end, source.length);
    assert.equal(warning.text, source.slice(start)); assert.equal(warning.lineIndex, 0);
    assert.equal(result.status, "incomplete");
  });
}
test("R1 scope: closed and nested annotations do not report unclosed ranges", () => {
  for (const source of ["夜夜（注）春春夜", "夜夜(注【内注】)春春夜", "夜夜[注]春春夜"]) {
    const result = analyzeFixture([source, ...regularLines.slice(1)]);
    assert.equal(result.scope.complete, true); assert.deepEqual(result.scope.warnings, []);
    assert.equal(result.lines[0].text, regularLines[0]);
  }
});
test("R1 scope: an unclosed annotation in one fixed slot cannot suppress warnings from later slots", () => {
  const result = analyzeFixture([regularLines[0] + "（未完", regularLines[1] + "🙂", ...regularLines.slice(2)]);
  assert.deepEqual(result.scope.warnings.map(w => w.lineIndex), [0]);
  assert.ok(result.issues.some(i => i.code === "UNSUPPORTED_INPUT" && i.message.includes("🙂")));
  assert.equal(result.lines[1].text, regularLines[1]);
});
test("R1 scope: free-text ranges use raw text offsets, not compacted line indices", () => {
  const text = "夜夜春春夜，\r\n春春夜夜春。\r\n𠮷（注未完";
  const result = analyzeFixture([text], { editorLines: undefined });
  const warning = result.scope.warnings[0];
  assert.equal(warning.coordinateSpace, "source-text"); assert.equal(warning.lineIndex, undefined);
  assert.equal(warning.start, text.indexOf("（")); assert.equal(warning.end, text.length);
  assert.equal(warning.text, text.slice(text.indexOf("（")));
});
for (const id of ["ALG-R01", "ALG-R02"]) {
  test(`R1 rhyme: ${id} exposes disjoint whole-set candidates without asserting confirmed conflict`, () => {
    const result = analyzeCase(id);
    assert.equal(result.rhyme.evidence.feasibility, "no-common");
    assert.ok(result.rhyme.evidence.comparedLineIndexes.length >= 2);
    assert.deepEqual(result.rhyme.commonGroupIds, []);
    assert.equal(result.rhyme.evidence.confirmedGroupStatus, "insufficient");
    assert.equal(result.rhyme.status, "ambiguous");
    assert.equal(result.issues.some(i => i.code === "RHYME_GROUP"), false);
    assert.ok(result.issues.some(i => i.code === "RHYME_CANDIDATES_DISJOINT"));
  });
}
test("R1 rhyme: feasible candidates never auto-select unconfirmed meaning", () => {
  const result = analyzeCase("ALG-R04");
  assert.equal(result.rhyme.evidence.feasibility, "common");
  assert.equal(result.rhyme.status, "ambiguous");
  assert.ok(result.rhyme.evidence.unconfirmedReadingLineIndexes.length);
  assert.equal(result.lines[1].characters[4].reading.selectedCandidate, null);
});
test("R1 rhyme: multiple meanings in one group confirm group but not reading", () => {
  const result = analyzeCase("ALG-R03");
  assert.equal(result.rhyme.evidence.confirmedGroupStatus, "compatible");
  assert.equal(result.rhyme.status, "compatible");
  assert.ok(result.rhyme.evidence.unconfirmedReadingLineIndexes.length);
});
for (const id of ["ALG-R06", "ALG-R07", "ALG-R08"]) {
  test(`R1 rhyme: ${id} missing unknown or tone evidence does not create an empty-set conflict`, () => {
    const result = analyzeCase(id);
    assert.equal(result.rhyme.evidence.feasibility, "insufficient");
    assert.ok(result.rhyme.evidence.unavailableLineIndexes.length);
    assert.equal(result.issues.some(i => i.code === "RHYME_CANDIDATES_DISJOINT" || i.code === "RHYME_GROUP"), false);
    if (id === "ALG-R08") assert.ok(result.issues.some(i => i.code === "RHYME_TONE"));
  });
}
test("R1 rhyme: confirmed conflict survives missing and unknown feet in an incomplete lushi", () => {
  const result = analyzeCase("ALG-R05");
  assert.equal(result.status, "incomplete"); assert.equal(result.rhyme.status, "mismatch");
  assert.equal(result.rhyme.evidence.confirmedGroupStatus, "conflict");
  assert.ok(result.rhyme.evidence.confirmedConflictLineIndexes.length >= 2);
  assert.ok(result.rhyme.evidence.unavailableLineIndexes.length);
});
test("R1 rhyme: effective user selection is respected and not broadened to manufacture a common group", () => {
  const lines = [regularLines[0], "春春夜夜甲", regularLines[2], "夜夜夜春丙"];
  const without = analyzeFixture(lines);
  const choice = { lineIndex: 1, characterIndex: 4, character: "甲", candidateId: "甲:audit-0", sourceText: lines[1], sourceOffset: 4 };
  const result = analyzeFixture(lines, { overrides: [choice] });
  assert.equal(result.lines[1].characters[4].reading.selectedCandidate?.id, choice.candidateId);
  assert.deepEqual(result.lines[1].characters[4].reading.candidates.map(c => c.id), [choice.candidateId]);
  assert.ok(without.rhyme.commonGroupIds.length >= result.rhyme.commonGroupIds.length);
});
test("R1 rhyme: unknown foot does not erase no-common evidence among other known candidates", async () => {
  const { fixture } = await import("../helpers/analysisFixture.ts");
  const c = fixture.cases.find((c: any) => c.case_id === "ALG-R02");
  const lines = [...c.slots]; lines[7] = "夜夜夜春𠮷";
  const result = analyzeFixture(lines, { templateId: c.template, variantId: c.variant });
  assert.equal(result.rhyme.status, "unknown");
  assert.equal(result.rhyme.evidence.feasibility, "no-common");
  assert.deepEqual(result.rhyme.evidence.comparedLineIndexes, [1, 3, 5]);
  assert.deepEqual(result.rhyme.evidence.unavailableLineIndexes, [7]);
  assert.equal(result.rhyme.evidence.confirmedGroupStatus, "insufficient");
  assert.ok(result.issues.some(i => i.code === "RHYME_CANDIDATES_DISJOINT"));
});

test("R2 flexible rule position can be decided without inventing a unique reading", () => {
  const result = analyzeFixture(["癸夜春春夜", ...regularLines.slice(1)]);
  const character = result.lines[0].characters[0];
  assert.equal(character.status, "match");
  assert.deepEqual(character.actualTones, ["ping", "ze"]);
  assert.equal(character.reading.status, "ambiguous");
  assert.equal(character.reading.selectedCandidate, null);
  assert.equal(character.readingConfirmation, "optional");
  assert.equal(result.status, "valid");
  assert.equal(result.issues.some(i => i.code === "READING_UNRESOLVED"), false);
});
test("R2 fixed positions retain uncertain mismatch and unknown truth conditions", () => {
  for (const [text, expected] of [["夜癸春春夜", "uncertain"], ["夜春春春夜", "mismatch"], ["夜𠮷春春夜", "unknown"]] as const) {
    const result = analyzeFixture([text, ...regularLines.slice(1)]);
    assert.equal(result.lines[0].characters[1].status, expected);
    assert.notEqual(result.status, "valid");
  }
});
test("R2 flexible local match does not remove confirmed or possible structural risks", () => {
  const definite = analyzeFixture([regularLines[0], "夜春夜夜春", ...regularLines.slice(2)]);
  assert.equal(definite.lines[1].characters[0].status, "match");
  assert.ok(definite.issues.some(i => i.code === "ISOLATED_PING"));
  const possible = analyzeFixture([regularLines[0], "癸春夜夜春", ...regularLines.slice(2)]);
  assert.equal(possible.lines[1].characters[0].status, "match");
  assert.equal(possible.lines[1].characters[0].readingConfirmation, "required");
  assert.ok(possible.issues.some(i => i.code === "POSSIBLE_ISOLATED_PING"));
  const tail = analyzeFixture([...regularLines.slice(0, 3), "夜夜癸春春"]);
  assert.ok(tail.issues.some(i => i.code === "POSSIBLE_TRIPLE_PING_TAIL"));
  assert.equal(tail.lines[3].characters[2].readingConfirmation, "required");
});
test("R2 optional meaning confirmation never releases ambiguous rhyme or R1 disjoint evidence", () => {
  const ambiguous = analyzeCase("ALG-R04");
  assert.equal(ambiguous.lines[1].characters[4].readingConfirmation, "required");
  assert.equal(ambiguous.rhyme.status, "ambiguous");
  const sameGroup = analyzeCase("ALG-R03");
  assert.equal(sameGroup.lines[1].characters[4].readingConfirmation, "optional");
  assert.equal(sameGroup.lines[1].characters[4].reading.status, "ambiguous");
  const disjoint = analyzeCase("ALG-R01");
  assert.equal(disjoint.rhyme.evidence.feasibility, "no-common");
  assert.ok(disjoint.issues.some(i => i.code === "RHYME_CANDIDATES_DISJOINT"));
});

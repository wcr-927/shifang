import assert from "node:assert/strict";
import { test } from "node:test";
import { assertWorkProfile, categoryOf, roomOf, workRecordSchema } from "../../src/shared/work.ts";

const record = { id: "123e4567-e89b-12d3-a456-426614174000", collectionId: null, title: "", body: "  𠀀\n\n尾行  \n", notes: "\t附记  ",
  status: "draft", location: "", rhymeGroupId: null, tags: [], createdAt: "旧传输时间", updatedAt: "旧传输时间" };

test("genre union retains legacy poetry defaults and unknown ci form/choice metadata, with required ci state", () => {
  for (const genre of ["wujue", "qijue", "wulv", "qilv", "free"]) {
    const parsed = workRecordSchema.parse({ ...record, genre });
    assert.equal(roomOf(parsed), "poetry"); assert.equal(categoryOf(parsed), "unclassified"); assert.equal(parsed.body, record.body);
  }
  const ci = { formId: "unknown-old-form", version: "old-rule", rhymeVersion: "old-rhyme", choices: [{ line: 18, offset: 90, source: "旧原文", character: "𠀀", candidate: "旧候选" }] };
  const parsed = workRecordSchema.parse({ ...record, genre: "ci", room: "ci", ci });
  assert.deepEqual(parsed.ci, ci); assert.equal(parsed.notes, record.notes);
  assert.equal(workRecordSchema.safeParse({ ...record, genre: "ci", room: "ci" }).success, false);
  // Read transport stays compatible with optional old fields; write adapters
  // and backup validation retain their existing genre/state restrictions.
  assert.deepEqual(workRecordSchema.parse({ ...record, genre: "free", ci }).ci, ci);
});

test("profile validation expresses all legal room/genre/category combinations and rejects mismatches", () => {
  for (const genre of ["wujue", "qijue", "wulv", "qilv"] as const) assert.doesNotThrow(() => assertWorkProfile({ genre, room: "poetry", category: "unclassified" }));
  for (const category of ["unclassified", "ancient", "prose", "fu"] as const) assert.doesNotThrow(() => assertWorkProfile({ genre: "free", room: "poetry", category }));
  assert.doesNotThrow(() => assertWorkProfile({ genre: "free", room: "song" }));
  assert.doesNotThrow(() => assertWorkProfile({ genre: "ci", room: "ci" }));
  for (const profile of [{genre:"free",room:"ci"}, {genre:"ci",room:"poetry"}, {genre:"wujue",room:"song"}, {genre:"free",room:"poetry",category:"modern"}, {genre:"free",room:"song",category:"ancient"}] as const) {
    assert.throws(() => assertWorkProfile(profile), /房间、创作方式与文体不相符/);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { rankRhymeCharacters } from "../../src/poetry/reference/rhymeUsage.ts";
import { hasRhymeUsage, rhymeUsageBundleSchema, validateRhymeUsageBundle, type RhymeUsageBundle } from "../../src/shared/rhymeUsage.ts";
import { referenceGroupSchema } from "../../src/shared/reference.ts";

// Synthetic evidence is intentionally confined to this fixture.
const usage: RhymeUsageBundle = {
  version: "fixture", sourceIds: ["synthetic-fixture"],
  coverage: [{ system: "pingshui", groupId: "ping-15shan" }],
  entries: [
    { system: "pingshui", groupId: "ping-15shan", character: "山", rank: 1, sourceIds: ["synthetic-fixture"] },
    { system: "pingshui", groupId: "ping-15shan", character: "间", rank: 1, sourceIds: ["synthetic-fixture"] },
    { system: "pingshui", groupId: "ping-15shan", character: "闲", rank: 2, sourceIds: ["synthetic-fixture"] },
  ],
};
const scope = { system: "pingshui", groupId: "ping-15shan" } as const;

test("common order preserves the complete original set, ties and input", () => {
  const chars = Object.freeze(["删", "间", "闲", "山", "关"]);
  const before = structuredClone(usage);
  assert.deepEqual(rankRhymeCharacters(chars, usage, { ...scope, view: "common-first" }), ["间", "山", "闲", "删", "关"]);
  assert.deepEqual(rankRhymeCharacters(chars, usage, { ...scope, view: "all" }), chars);
  assert.deepEqual(rankRhymeCharacters(chars, usage, { ...scope, view: "common-only" }), ["间", "山", "闲"]);
  assert.deepEqual(chars, ["删", "间", "闲", "山", "关"]);
  assert.deepEqual(usage, before);
});

test("uncovered scope falls back without borrowing another system or group", () => {
  for (const other of [{ system: "cilin", groupId: "ping-15shan" }, { system: "pingshui", groupId: "ping-01dong" }] as const) {
    assert.equal(hasRhymeUsage(usage, other), false);
    assert.deepEqual(rankRhymeCharacters(["山", "删"], usage, { ...other, view: "common-first" }), ["山", "删"]);
    assert.deepEqual(rankRhymeCharacters(["山", "删"], usage, { ...other, view: "common-only" }), []);
  }
  const empty: RhymeUsageBundle = { ...usage, entries: [] };
  assert.equal(hasRhymeUsage(empty, scope), true);
  assert.deepEqual(rankRhymeCharacters(["删"], empty, { ...scope, view: "common-only" }), []);
});

test("usage contract rejects broken evidence and validates original table foreign keys", () => {
  const groups = [{ ...scope, characters: ["山", "间", "闲"] }];
  assert.deepEqual(validateRhymeUsageBundle(usage, groups), usage);
  assert.throws(() => validateRhymeUsageBundle(usage, []), /Unknown usage group/);
  assert.throws(() => validateRhymeUsageBundle(usage, [{ ...scope, characters: ["山"] }]), /absent from its original group/);
  const invalid = [
    { ...usage, sourceIds: ["synthetic-fixture", "synthetic-fixture"] },
    { ...usage, coverage: [...usage.coverage, ...usage.coverage] },
    { ...usage, coverage: [] },
    { ...usage, entries: [...usage.entries, usage.entries[0]] },
    ...[{ sourceIds: [] }, { sourceIds: ["unknown"] }, { rank: 0 }, { rank: 1.5 }, { character: "\ud800" }, { character: "山删" }]
      .map(change => ({ ...usage, entries: [{ ...usage.entries[0], ...change }] })),
  ];
  for (const value of invalid) assert.equal(rhymeUsageBundleSchema.safeParse(value).success, false);
  assert.equal(rhymeUsageBundleSchema.safeParse({ ...usage, entries: [{ ...usage.entries[0], character: "𣘼" }] }).success, true);
  assert.equal(referenceGroupSchema.parse({ system: "pingshui", id: scope.groupId }).view, "all");
  assert.equal(referenceGroupSchema.safeParse({ system: "pingshui", id: scope.groupId, view: "recommended" }).success, false);
});

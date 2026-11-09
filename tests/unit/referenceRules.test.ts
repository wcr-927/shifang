import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ReferenceRuleService } from "../../electron/services/ReferenceRuleService.ts";
import { RuleService } from "../../electron/services/RuleService.ts";
import type { RhymeUsageBundle } from "../../src/shared/rhymeUsage.ts";

const ruleDirectory = join(process.cwd(), "src/rules");
const ciDirectory = join(process.cwd(), "src/ci");
const ruleService = new RuleService(ruleDirectory);
const service = new ReferenceRuleService(ruleService, ciDirectory);

test("usage ordering happens before 48/64/128 pagination and cannot change original readings", () => {
  const temporary = mkdtempSync(join(tmpdir(), "reference-usage-"));
  try {
    const group = service.groups({ system: "pingshui" })[0];
    const original: string[] = [];
    for (let offset: number | null = 0; offset !== null;) {
      const page = service.group({ system: "pingshui", id: group.id, offset, limit: 128 });
      original.push(...page.items.map(item => item.character)); offset = page.nextOffset;
    }
    const common = original.slice(-130).reverse();
    const usage: RhymeUsageBundle = { version: "synthetic-fixture", sourceIds: ["synthetic-fixture"],
      coverage: [{ system: "pingshui", groupId: group.id }],
      entries: common.map((character, rank) => ({ system: "pingshui", groupId: group.id, character, rank: rank + 1, sourceIds: ["synthetic-fixture"] })),
    };
    const path = join(temporary, "usage.json");
    writeFileSync(path, JSON.stringify(usage));
    const ranked = new ReferenceRuleService(ruleService, ciDirectory, path);
    const before = service.lookup({ system: "pingshui", character: common[0] });
    for (const limit of [48, 64, 128]) for (const view of ["all", "common-first", "common-only"] as const) {
      const characters: string[] = [];
      for (let offset: number | null = 0; offset !== null;) {
        const page = ranked.group({ system: "pingshui", id: group.id, view, offset, limit });
        assert.equal(page.view, view); assert.equal(page.usageAvailable, true);
        assert.equal(page.usageVersion, usage.version); assert.equal(page.group.count, original.length);
        assert.equal(page.filteredCount, view === "common-only" ? common.length : original.length);
        characters.push(...page.items.map(item => item.character)); offset = page.nextOffset;
      }
      assert.deepEqual(characters, view === "all" ? original : view === "common-only" ? common : [...common, ...original.filter(character => !common.includes(character))]);
      assert.equal(new Set(characters).size, characters.length);
    }
    assert.deepEqual(ranked.lookup({ system: "pingshui", character: common[0] }), before);
    assert.deepEqual(ranked.groups({ system: "pingshui" }), service.groups({ system: "pingshui" }));
    assert.deepEqual(ranked.group({ system: "pingshui", id: group.id, view: "common-only", offset: common.length }).items, []);
    assert.equal(ranked.group({ system: "pingshui", id: group.id, view: "common-only", offset: common.length }).nextOffset, null);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test("missing and damaged usage degrade safely and distinguish uncovered from covered empty", () => {
  const temporary = mkdtempSync(join(tmpdir(), "reference-usage-errors-"));
  try {
    const group = service.groups({ system: "pingshui" })[0];
    const original = service.group({ system: "pingshui", id: group.id });
    const usage: RhymeUsageBundle = { version: "synthetic-fixture", sourceIds: [], entries: [], coverage: [{ system: "pingshui", groupId: group.id }] };
    const path = join(temporary, "usage.json");
    const cases = [null, "{damaged", JSON.stringify({ ...usage, version: null }), JSON.stringify({ ...usage, sourceIds: ["fixture"], entries: [{ system: "pingshui", groupId: group.id, character: "𠀀", rank: 1, sourceIds: ["fixture"] }] })];
    for (const content of cases) {
      const usagePath = content === null ? join(temporary, "missing.json") : path;
      if (content !== null) writeFileSync(path, content);
      const damaged = new ReferenceRuleService(ruleService, ciDirectory, usagePath);
      const all = damaged.group({ system: "pingshui", id: group.id });
      const priority = damaged.group({ system: "pingshui", id: group.id, view: "common-first" });
      const only = damaged.group({ system: "pingshui", id: group.id, view: "common-only" });
      assert.deepEqual(all.items, original.items); assert.deepEqual(priority.items, original.items);
      assert.equal(only.usageAvailable, false); assert.equal(only.filteredCount, 0);
      assert.deepEqual(only.items, []); assert.equal(only.nextOffset, null); assert.equal(only.group.count, group.count);
      assert.deepEqual(damaged.lookup({ system: "pingshui", character: "一" }), service.lookup({ system: "pingshui", character: "一" }));
      assert.equal(damaged.patterns({ kind: "metre" }).length, 16);
    }
    writeFileSync(path, JSON.stringify(usage));
    const empty = new ReferenceRuleService(ruleService, ciDirectory, path).group({ system: "pingshui", id: group.id, view: "common-only" });
    assert.equal(empty.usageAvailable, true); assert.equal(empty.filteredCount, 0); assert.equal(empty.group.count, group.count);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test("default usage loading follows the supplied resource directories instead of cwd", () => {
  const temporary = mkdtempSync(join(tmpdir(), "reference-usage-resources-"));
  try {
    const group = service.groups({ system: "pingshui" })[0];
    mkdirSync(join(temporary, "src/rules"), { recursive: true });
    writeFileSync(join(temporary, "src/rules/rhyme_usage.json"), JSON.stringify({
      version: "packaged-fixture", sourceIds: [], entries: [], coverage: [{ system: "pingshui", groupId: group.id }],
    }));
    const resourceService = new ReferenceRuleService(ruleService, join(temporary, "src/ci"));
    const page = resourceService.group({ system: "pingshui", id: group.id, view: "common-only" });
    assert.equal(page.usageVersion, "packaged-fixture"); assert.equal(page.usageAvailable, true);
    assert.equal(page.filteredCount, 0); assert.equal(page.group.count, group.count);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

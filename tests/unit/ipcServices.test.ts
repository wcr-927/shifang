import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AnalysisService } from "../../electron/services/AnalysisService.ts";
import { RuleService } from "../../electron/services/RuleService.ts";

const ruleService = new RuleService(`${process.cwd()}/src/rules`);
const analysisService = new AnalysisService(ruleService);

test("RuleService validates and caches the rule bundle", () => {
  const first = ruleService.load();
  const second = ruleService.load();
  assert.strictEqual(first, second);
  assert.equal(first.rhyme.groups.length, 106);
  assert.equal(first.metre.templates.length, 4);
  assert.equal(first.datasetVersions.pingze, "sample-1");
});

test("AnalysisService returns a request id and dataset versions", () => {
  const result = analysisService.analyze({
    requestId: "test-request-1",
    text: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
    templateId: "wujue",
    variantId: "zeqi-first-unrhymed",
    overrides: [
      { lineIndex: 3, characterIndex: 0, character: "更", candidateId: "更:qu-24jing" },
    ],
  });
  assert.equal(result.requestId, "test-request-1");
  assert.equal(result.datasetVersions.metre, "sample-1");
  assert.equal(result.status, "valid");
});

test("AnalysisService does not silently accept an invalid template", () => {
  assert.throws(
    () =>
      analysisService.analyze({
        requestId: "bad-template",
        text: "春",
        templateId: "bad-template" as "wujue",
        overrides: [],
      }),
    /unknown metre template/,
  );
});

test("RuleService exposes a deterministic failure when a rules directory is missing", () => {
  const broken = new RuleService(`${process.cwd()}/missing-rules-fixture`);
  assert.throws(() => broken.load(), /ENOENT|rhyme\.json/);
});

test("RuleService rejects missing, blank and non-string dataset versions without caching a broken bundle", () => {
  const directory = mkdtempSync(join(tmpdir(), "shifang-rule-versions-"));
  try {
    cpSync(`${process.cwd()}/src/rules`, directory, { recursive: true });
    for (const filename of ["rhyme.json", "pingze.json", "metre.json", "reading_rules.json"]) {
      const path = join(directory, filename);
      const original = readFileSync(path, "utf8");
      const rules = JSON.parse(original);
      const service = new RuleService(directory);
      for (const version of [undefined, " ", 1]) {
        rules.datasetVersion = version;
        writeFileSync(path, JSON.stringify(rules));
        assert.throws(() => service.load(), /datasetVersion is required/);
      }
      writeFileSync(path, original);
      assert.equal(service.load().datasetVersions.pingze, "sample-1");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { DatabaseConnection } from "../../electron/database/connection.ts";
import { WorkRepository } from "../../electron/database/repositories/WorkRepository.ts";

function createRepository() {
  const directory = mkdtempSync(join(tmpdir(), "shifang-work-") );
  const databasePath = join(directory, "test.sqlite");
  const connection = new DatabaseConnection(databasePath, `${process.cwd()}/electron/database/migrations`);
  return { directory, databasePath, connection, repository: new WorkRepository(connection.db) };
}

test("migrates database and persists a work across repository reopen", () => {
  const first = createRepository();
  const collection = first.repository.createCollection("春日诗稿");
  const created = first.repository.createWork({
    title: "春望",
    body: "国破山河在",
    genre: "wulv",
    collectionId: collection.id,
    tags: ["春", "旅思", "春"],
  });
  assert.equal(created.status, "draft");
  assert.deepEqual(created.tags, ["旅思", "春"]);
  first.repository.saveAnalysisState({
    workId: created.id,
    templateId: "wulv",
    variantId: "zeqi-first-unrhymed",
    readingOverrides: [{ lineIndex: 0, characterIndex: 0, character: "国", candidateId: "国:ru-13zhi" }],
    ruleDatasetVersions: { metre: "1.0.0", pingze: "2.0.0" },
  });
  first.repository.saveVersion(created.id, "manual_save");
  first.connection.close();

  const second = new DatabaseConnection(first.databasePath, `${process.cwd()}/electron/database/migrations`);
  const reopened = new WorkRepository(second.db);
  const restored = reopened.getWork(created.id);
  assert.equal(restored?.title, "春望");
  assert.equal(restored?.collectionId, collection.id);
  assert.deepEqual(restored?.tags, ["旅思", "春"]);
  assert.deepEqual(reopened.getAnalysisState(created.id)?.readingOverrides, [
    { lineIndex: 0, characterIndex: 0, character: "国", candidateId: "国:ru-13zhi" },
  ]);
  assert.equal((second.db.prepare("SELECT COUNT(*) AS count FROM work_versions WHERE work_id = ?").get(created.id) as { count: number }).count, 2);
  second.close();
  rmSync(first.directory, { recursive: true, force: true });
});

test("updates tags transactionally and archives without deleting the work", () => {
  const fixture = createRepository();
  const work = fixture.repository.createWork({ genre: "qijue", tags: ["初稿"] });
  const updated = fixture.repository.updateWork(work.id, {
    title: "秋句",
    body: "秋风入小楼",
    status: "completed",
    tags: ["秋", "完成"],
  });
  assert.equal(updated.status, "completed");
  assert.deepEqual(updated.tags, ["完成", "秋"]);
  const archived = fixture.repository.archiveWork(work.id);
  assert.equal(archived.status, "archived");
  assert.equal(fixture.repository.listWorks().length, 0);
  assert.equal(fixture.repository.listWorks(true).length, 1);
  fixture.connection.close();
  rmSync(fixture.directory, { recursive: true, force: true });
});

test("rejects updates and analysis state for missing works", () => {
  const fixture = createRepository();
  assert.throws(() => fixture.repository.updateWork("missing", { title: "失效" }), /work not found/);
  assert.throws(
    () =>
      fixture.repository.saveAnalysisState({
        workId: "missing",
        templateId: "wujue",
        variantId: null,
        readingOverrides: [],
        ruleDatasetVersions: {},
      }),
    /work not found/,
  );
  fixture.connection.close();
  rmSync(fixture.directory, { recursive: true, force: true });
});

test("saves content and analysis state atomically as one editor snapshot", () => {
  const fixture = createRepository();
  const created = fixture.repository.createWork({ genre: "qijue" });
  const saved = fixture.repository.saveEditorState({
    workId: created.id,
    title: "春日",
    body: "春风入夜",
    genre: "qijue",
    status: "completed",
    collectionId: null,
    location: "江南",
    notes: "",
    rhymeGroupId: null,
    tags: ["春"],
    templateId: "qijue",
    variantId: "pingqi-first-rhymed",
    readingOverrides: [{ lineIndex: 0, characterIndex: 0, character: "长", candidateId: "长:ping-07yang" }],
    ruleDatasetVersions: { metre: "1.0.0", pingze: "2.0.0" },
  });
  assert.equal(saved.work.title, "春日");
  assert.equal(saved.work.status, "completed");
  assert.equal(saved.analysisState.variantId, "pingqi-first-rhymed");
  assert.deepEqual(fixture.repository.getAnalysisState(created.id)?.readingOverrides, [
    { lineIndex: 0, characterIndex: 0, character: "长", candidateId: "长:ping-07yang" },
  ]);
  fixture.connection.close();
  rmSync(fixture.directory, { recursive: true, force: true });
});

test("rolls back both content and analysis state when editor transaction violates a constraint", () => {
  const fixture = createRepository();
  const created = fixture.repository.createWork({ genre: "wujue", body: "旧正文" });
  assert.throws(() => fixture.repository.saveEditorState({
    workId: created.id,
    title: "新标题",
    body: "新正文",
    genre: "wujue",
    status: "not-a-status" as "draft",
    collectionId: null,
    location: "",
    notes: "",
    rhymeGroupId: null,
    tags: ["新标签"],
    templateId: "wujue",
    variantId: null,
    readingOverrides: [{ lineIndex: 0, characterIndex: 0, character: "长", candidateId: "长:ping-07yang" }],
    ruleDatasetVersions: { pingze: "2.0.0" },
  }), /CHECK constraint failed/);
  const restored = fixture.repository.getWork(created.id);
  assert.equal(restored?.title, "");
  assert.equal(restored?.body, "旧正文");
  assert.deepEqual(restored?.tags, []);
  assert.equal(fixture.repository.getAnalysisState(created.id), null);
  fixture.connection.close();
  rmSync(fixture.directory, { recursive: true, force: true });
});

test("database failures leave create, update and archive state unchanged", () => {
  const fixture = createRepository();
  assert.throws(() => fixture.repository.createWork({ genre: "wujue", collectionId: "123e4567-e89b-12d3-a456-426614174099" }), /FOREIGN KEY constraint failed/);
  const created = fixture.repository.createWork({ genre: "wujue", title: "原题", body: "原文" });
  assert.throws(() => fixture.repository.updateWork(created.id, { status: "invalid" as "draft" }), /CHECK constraint failed/);
  assert.equal(fixture.repository.getWork(created.id)?.title, "原题");
  assert.throws(() => fixture.repository.archiveWork("123e4567-e89b-12d3-a456-426614174099"), /work not found/);
  assert.equal(fixture.repository.getWork(created.id)?.status, "draft");
  fixture.connection.close();
  rmSync(fixture.directory, { recursive: true, force: true });
});

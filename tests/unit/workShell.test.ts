import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRoute, routeHash } from "../../src/app/routes.ts";
import type { WorkRecord } from "../../src/shared/work.ts";

const work = (overrides: Partial<WorkRecord> = {}): WorkRecord => ({
  id: "123e4567-e89b-12d3-a456-426614174000",
  collectionId: null,
  title: "春望",
  body: "国破山河在",
  genre: "wulv",
  status: "draft",
  location: "",
  notes: "",
  rhymeGroupId: null,
  tags: ["春", "旅思"],
  createdAt: "2026-08-31T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z",
  ...overrides,
});

test("parses and serializes supported application routes", () => {
  assert.deepEqual(parseRoute("#/"), { kind: "home" });
  assert.deepEqual(parseRoute("#/works"), { kind: "works" });
  assert.deepEqual(parseRoute("#/notes"),{kind:"notes"});
  assert.deepEqual(parseRoute("#/spaces/ci"),{kind:"works",room:"ci"});
  assert.deepEqual(parseRoute("#/reference"), { kind: "reference" });
  assert.deepEqual(parseRoute("#/works/123e4567-e89b-12d3-a456-426614174000"), {
    kind: "work",
    workId: "123e4567-e89b-12d3-a456-426614174000",
  });
  assert.equal(routeHash({ kind: "work", workId: "a/b" }), "#/works/a%2Fb");
});

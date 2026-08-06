// app/_lib/views-filters/contract-tests.ts
//
// Storage-agnostic behavioral contract for FilterStore / ViewStore.
// Run this SAME suite against every adapter (file-based now, Postgres/Neo4j
// later). An adapter isn't "done" until it passes this unchanged.
//
// Deliberately framework-agnostic (plain async functions + node:assert) so
// it can be invoked directly, or wrapped by Jest/Vitest/whatever the project
// settles on later — nothing here assumes a particular test runner.

import assert from "node:assert/strict";
import type { FilterCriteria, FilterStore, ViewStore } from "./types";

const sampleCriteria: FilterCriteria = {
  categories: ["cat-a"],
  linkTypes: ["fund"],
  linkStrengths: [1, 2],
  influenceLevels: [3, 4, 5],
  interestLevels: [0, 1, 2, 3],
};

const revisedCriteria: FilterCriteria = {
  ...sampleCriteria,
  categories: ["cat-a", "cat-b"],
};

export async function runFilterStoreContractTests(
  store: FilterStore,
  label: string
): Promise<void> {
  const results: string[] = [];
  const ok = (name: string) => results.push(`  ✓ ${name}`);

  const projectId = `test-project-${Date.now()}`;

  // create
  const created = await store.create(
    projectId,
    "High Influence Funders",
    sampleCriteria,
    "tester"
  );
  assert.equal(created.label, "High Influence Funders");
  assert.equal(created.description, undefined);
  assert.equal(created.history.length, 1);
  assert.equal(created.history[0].to, null);
  ok("create() returns a NamedFilter with a single open history entry");

  // get
  const fetched = await store.get(created.id);
  assert.ok(fetched, "get() should find the just-created filter");
  assert.equal(fetched!.currentFilterValueId, created.currentFilterValueId);
  ok("get() resolves a filter by id");

  // list
  const listed = await store.list(projectId);
  assert.ok(listed.some((f) => f.id === created.id));
  ok("list() includes the created filter");

  // resolve (track mode, current value)
  const resolvedInitial = await store.resolve({
    mode: "track",
    namedFilterId: created.id,
  });
  assert.deepEqual(resolvedInitial, sampleCriteria);
  ok("resolve() in track mode returns the current criteria");

  // updateCriteria — must close the old history entry and open a new one
  const updated = await store.updateCriteria(created.id, revisedCriteria, "tester");
  assert.equal(updated.history.length, 2);
  assert.notEqual(updated.history[0].to, null);
  assert.equal(updated.history[1].to, null);
  assert.notEqual(updated.currentFilterValueId, created.currentFilterValueId);
  ok("updateCriteria() appends history and repoints currentFilterValueId");

  // resolve after update should reflect new criteria
  const resolvedAfterUpdate = await store.resolve({
    mode: "track",
    namedFilterId: created.id,
  });
  assert.deepEqual(resolvedAfterUpdate, revisedCriteria);
  ok("resolve() in track mode reflects updated criteria");

  // resolve with pin mode should still return the OLD criteria
  const oldValueId = updated.history[0].filterValueId;
  const resolvedPinned = await store.resolve({
    mode: "pin",
    namedFilterId: created.id,
    pinnedFilterValueId: oldValueId,
  });
  assert.deepEqual(resolvedPinned, sampleCriteria);
  ok("resolve() in pin mode returns the historical criteria, unaffected by later updates");

  // rename — must NOT create a new history entry
  const historyLengthBeforeRename = updated.history.length;
  const renamed = await store.rename(created.id, "Renamed Filter", "a new description");
  assert.equal(renamed.label, "Renamed Filter");
  assert.equal(renamed.description, "a new description");
  assert.equal(renamed.history.length, historyLengthBeforeRename);
  ok("rename() updates label/description without touching history");

  // softDelete — record persists but is excluded from list()
  await store.softDelete(created.id);
  const afterDelete = await store.get(created.id);
  assert.ok(afterDelete, "get() should still resolve a soft-deleted filter");
  assert.ok(afterDelete!.deletedAt);
  const listedAfterDelete = await store.list(projectId);
  assert.ok(!listedAfterDelete.some((f) => f.id === created.id));
  ok("softDelete() hides from list() but remains resolvable via get()");

  console.log(`FilterStore contract [${label}]:\n${results.join("\n")}`);
}

export async function runViewStoreContractTests(
  store: ViewStore,
  filterStore: FilterStore,
  label: string
): Promise<void> {
  const results: string[] = [];
  const ok = (name: string) => results.push(`  ✓ ${name}`);

  const datasetId = `test-dataset-${Date.now()}`;
  const projectId = `test-project-${Date.now()}`;

  // A View's filterRef should always point at a real, previously-created
  // NamedFilter — synthetic/nonexistent ids aren't a case the running app
  // ever produces, and some adapters (Postgres, via a FK constraint) will
  // rightly reject one. So the suite creates a real filter here rather
  // than using a placeholder string.
  const backingFilter = await filterStore.create(
    projectId,
    "Backing Filter For View Tests",
    sampleCriteria,
    "tester"
  );

  // create with layout only, no filter — must be representable
  const layoutOnly = await store.create(
    datasetId,
    projectId,
    "Manually Arranged",
    "tester",
    [{ nodeId: 1, x: 10, y: 20 }]
  );
  assert.ok(layoutOnly.layout);
  assert.equal(layoutOnly.filterRef, undefined);
  ok("create() supports layout-only Views (no filterRef)");

  // create with filter only, no layout
  const filterOnly = await store.create(
    datasetId,
    projectId,
    "Filtered Only",
    "tester",
    undefined,
    { mode: "track", namedFilterId: backingFilter.id }
  );
  assert.equal(filterOnly.layout, undefined);
  assert.ok(filterOnly.filterRef);
  ok("create() supports filter-only Views (no layout)");

  // get
  const fetched = await store.get(layoutOnly.id);
  assert.ok(fetched);
  ok("get() resolves a View by id");

  // list
  const listed = await store.list(datasetId);
  assert.equal(listed.length, 2);
  ok("list() returns all Views for a dataset");

  // update — clearing filterRef explicitly (null) must remove it
  const updated = await store.update(filterOnly.id, { filterRef: null });
  assert.equal(updated.filterRef, undefined);
  assert.notEqual(updated.updatedAt, filterOnly.updatedAt);
  ok("update() can clear filterRef and bumps updatedAt");

  // delete — hard delete, should be gone entirely
  await store.delete(layoutOnly.id);
  const afterDelete = await store.get(layoutOnly.id);
  assert.equal(afterDelete, null);
  ok("delete() removes the View entirely (hard delete)");

  console.log(`ViewStore contract [${label}]:\n${results.join("\n")}`);
}

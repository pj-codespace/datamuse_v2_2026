// app/_lib/views-filters/postgres-store.ts
//
// Postgres adapter, satisfying the exact FilterStore / ViewStore contracts
// defined in ./types.ts — the same contracts the file adapter implements.
// Run contract-tests.ts against this (see run-contract-tests.postgres.ts)
// to confirm it behaves identically before treating it as a drop-in swap.

import { eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "./db";
import { namedFilters, filterValues, filterHistory, views } from "./schema";
import type {
  FilterCriteria,
  FilterRef,
  FilterStore,
  NamedFilter,
  View,
  ViewStore,
} from "./types";

// ── Filters ──────────────────────────────────────────────────────────────

async function assembleNamedFilter(
  filterId: string
): Promise<NamedFilter | null> {
  const [row] = await db.select().from(namedFilters).where(eq(namedFilters.id, filterId));
  if (!row) return null;

  const historyRows = await db
    .select()
    .from(filterHistory)
    .where(eq(filterHistory.namedFilterId, filterId))
    .orderBy(filterHistory.from);

  return {
    id: row.id,
    projectId: row.projectId,
    label: row.label,
    description: row.description ?? undefined,
    currentFilterValueId: row.currentFilterValueId,
    history: historyRows.map((h) => ({
      filterValueId: h.filterValueId,
      from: h.from.toISOString(),
      to: h.to ? h.to.toISOString() : null,
    })),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : undefined,
  };
}

export const postgresFilterStore: FilterStore = {
  async get(namedFilterId) {
    return assembleNamedFilter(namedFilterId);
  },

  async list(projectId) {
    const rows = await db
      .select()
      .from(namedFilters)
      .where(and(eq(namedFilters.projectId, projectId), isNull(namedFilters.deletedAt)));

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const historyRows = await db
      .select()
      .from(filterHistory)
      .where(inArray(filterHistory.namedFilterId, ids))
      .orderBy(filterHistory.from);

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      label: row.label,
      description: row.description ?? undefined,
      currentFilterValueId: row.currentFilterValueId,
      history: historyRows
        .filter((h) => h.namedFilterId === row.id)
        .map((h) => ({
          filterValueId: h.filterValueId,
          from: h.from.toISOString(),
          to: h.to ? h.to.toISOString() : null,
        })),
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : undefined,
    }));
  },

  async create(projectId, label, criteria, createdBy, description) {
    const namedFilterId = await db.transaction(async (tx) => {
      const [value] = await tx
        .insert(filterValues)
        .values({ criteria, createdBy })
        .returning({ id: filterValues.id });

      const [filter] = await tx
        .insert(namedFilters)
        .values({
          projectId,
          label,
          description,
          currentFilterValueId: value.id,
          createdBy,
        })
        .returning({ id: namedFilters.id });

      await tx.insert(filterHistory).values({
        namedFilterId: filter.id,
        filterValueId: value.id,
        from: new Date(),
        to: null,
      });

      return filter.id;
    });

    const created = await assembleNamedFilter(namedFilterId);
    if (!created) throw new Error("Failed to create filter");
    return created;
  },

  async updateCriteria(namedFilterId, criteria, updatedBy) {
    await db.transaction(async (tx) => {
      const now = new Date();

      const [newValue] = await tx
        .insert(filterValues)
        .values({ criteria, createdBy: updatedBy })
        .returning({ id: filterValues.id });

      // Close the currently-open history entry, then open the new one.
      await tx
        .update(filterHistory)
        .set({ to: now })
        .where(and(eq(filterHistory.namedFilterId, namedFilterId), isNull(filterHistory.to)));

      await tx.insert(filterHistory).values({
        namedFilterId,
        filterValueId: newValue.id,
        from: now,
        to: null,
      });

      await tx
        .update(namedFilters)
        .set({ currentFilterValueId: newValue.id })
        .where(eq(namedFilters.id, namedFilterId));
    });

    const updated = await assembleNamedFilter(namedFilterId);
    if (!updated) throw new Error(`NamedFilter ${namedFilterId} not found`);
    return updated;
  },

  async rename(namedFilterId, label, description) {
    const updateSet: Partial<{ label: string; description: string | null }> = {};
    if (label !== undefined) updateSet.label = label;
    if (description !== undefined) updateSet.description = description;

    if (Object.keys(updateSet).length > 0) {
      await db.update(namedFilters).set(updateSet).where(eq(namedFilters.id, namedFilterId));
    }

    const renamed = await assembleNamedFilter(namedFilterId);
    if (!renamed) throw new Error(`NamedFilter ${namedFilterId} not found`);
    return renamed;
  },

  async softDelete(namedFilterId) {
    await db
      .update(namedFilters)
      .set({ deletedAt: new Date() })
      .where(eq(namedFilters.id, namedFilterId));
  },

  async resolve(filterRef: FilterRef): Promise<FilterCriteria | null> {
    let valueId: string | undefined;

    if (filterRef.mode === "pin" && filterRef.pinnedFilterValueId) {
      valueId = filterRef.pinnedFilterValueId;
    } else {
      const [filter] = await db
        .select({ currentFilterValueId: namedFilters.currentFilterValueId })
        .from(namedFilters)
        .where(eq(namedFilters.id, filterRef.namedFilterId));
      valueId = filter?.currentFilterValueId;
    }

    if (!valueId) return null;

    const [value] = await db
      .select({ criteria: filterValues.criteria })
      .from(filterValues)
      .where(eq(filterValues.id, valueId));

    return (value?.criteria as FilterCriteria) ?? null;
  },
};

// ── Views ────────────────────────────────────────────────────────────────

function toDomainView(row: typeof views.$inferSelect): View {
  const filterRef: FilterRef | undefined = row.filterRefMode
    ? {
        mode: row.filterRefMode as "track" | "pin",
        namedFilterId: row.filterRefNamedFilterId!,
        pinnedFilterValueId: row.filterRefPinnedValueId ?? undefined,
      }
    : undefined;

  return {
    id: row.id,
    datasetId: row.datasetId,
    projectId: row.projectId,
    label: row.label,
    layout: (row.layout as View["layout"]) ?? undefined,
    filterRef,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const postgresViewStore: ViewStore = {
  async get(viewId) {
    const [row] = await db.select().from(views).where(eq(views.id, viewId));
    return row ? toDomainView(row) : null;
  },

  async list(datasetId) {
    const rows = await db.select().from(views).where(eq(views.datasetId, datasetId));
    return rows.map(toDomainView);
  },

  async create(datasetId, projectId, label, createdBy, layout, filterRef) {
    const [row] = await db
      .insert(views)
      .values({
        datasetId,
        projectId,
        label,
        createdBy,
        layout,
        filterRefMode: filterRef?.mode,
        filterRefNamedFilterId: filterRef?.namedFilterId,
        filterRefPinnedValueId: filterRef?.pinnedFilterValueId,
      })
      .returning();

    return toDomainView(row);
  },

  async update(viewId, updates) {
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };

    if (Object.prototype.hasOwnProperty.call(updates, "label")) {
      updateSet.label = updates.label;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "layout")) {
      updateSet.layout = updates.layout;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "filterRef")) {
      // Explicit null clears the filter; this branch only runs when the
      // caller actually passed the key (see hasOwnProperty check above),
      // so an omitted filterRef correctly leaves these columns untouched.
      updateSet.filterRefMode = updates.filterRef?.mode ?? null;
      updateSet.filterRefNamedFilterId = updates.filterRef?.namedFilterId ?? null;
      updateSet.filterRefPinnedValueId = updates.filterRef?.pinnedFilterValueId ?? null;
    }

    const [row] = await db
      .update(views)
      .set(updateSet)
      .where(eq(views.id, viewId))
      .returning();

    if (!row) throw new Error(`View ${viewId} not found`);
    return toDomainView(row);
  },

  async delete(viewId) {
    await db.delete(views).where(eq(views.id, viewId));
  },
};

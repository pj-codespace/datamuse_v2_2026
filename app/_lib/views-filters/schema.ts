// app/_lib/views-filters/schema.ts
//
// Drizzle table definitions — the Postgres-side mirror of the domain types
// in ./types.ts. Column names are snake_case per SQL convention; Drizzle
// maps them to the camelCase fields used everywhere else in the app.

import { pgTable, text, timestamp, jsonb, uuid, boolean } from "drizzle-orm/pg-core";

// ── Filters ──────────────────────────────────────────────────────────────

export const filterValues = pgTable("filter_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Stored as a single jsonb blob rather than five separate columns —
  // FilterCriteria is always read/written as one unit, never queried by
  // its individual fields (e.g. "find all filters with category X" isn't
  // a use case), so normalizing it into columns would add migration
  // overhead for no real query benefit.
  criteria: jsonb("criteria").notNull(), // FilterCriteria
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const namedFilters = pgTable("named_filters", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: text("project_id").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  currentFilterValueId: uuid("current_filter_value_id")
    .notNull()
    .references(() => filterValues.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // null = active
});

// One row per history entry, rather than a jsonb array on named_filters —
// this is the one place we DO want relational shape: it makes "close out
// the previous entry, insert a new one" a plain two-statement transaction
// instead of a read-modify-write on a JSON blob, and keeps the append-only
// guarantee enforceable at the schema level (no UPDATE path needed except
// closing `to`).
export const filterHistory = pgTable("filter_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  namedFilterId: uuid("named_filter_id")
    .notNull()
    .references(() => namedFilters.id),
  filterValueId: uuid("filter_value_id")
    .notNull()
    .references(() => filterValues.id),
  from: timestamp("from", { withTimezone: true }).notNull(),
  to: timestamp("to", { withTimezone: true }), // null = currently active
});

// ── Views ────────────────────────────────────────────────────────────────

export const views = pgTable("views", {
  id: uuid("id").primaryKey().defaultRandom(),
  datasetId: text("dataset_id").notNull(),
  projectId: text("project_id").notNull(),
  label: text("label").notNull(),
  // layout is read/written as one whole array per save (per NetworkGraph's
  // "rebuild layout from scratch on filter change" behavior noted in the
  // project summary) — jsonb again, same reasoning as filter criteria.
  layout: jsonb("layout"), // LayoutEntry[] | null
  filterRefMode: text("filter_ref_mode"), // "track" | "pin" | null
  filterRefNamedFilterId: uuid("filter_ref_named_filter_id").references(() => namedFilters.id),
  filterRefPinnedValueId: uuid("filter_ref_pinned_value_id").references(() => filterValues.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

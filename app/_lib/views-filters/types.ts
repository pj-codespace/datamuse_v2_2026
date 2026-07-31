// app/_lib/views-filters/types.ts
//
// Domain schema for NamedFilter / FilterValue / View.
// Storage-agnostic: these shapes are the contract every adapter (file-based,
// Postgres, Neo4j, ...) must produce and consume. Nothing here should imply
// how a given backend persists it.

// ── Filter criteria (the actual "rule") ─────────────────────────────────────

export interface FilterCriteria {
  categories: string[]; // Category ids from project.settings.categories
  linkTypes: string[]; // LinkType ids from project.settings.linkTypes
  linkStrengths: number[]; // values from project.settings.linkStrengths
  influenceLevels: number[]; // values from project.settings.influenceLevels
  interestLevels: number[]; // values from project.settings.interestLevels
}

// ── FilterValue (immutable) ─────────────────────────────────────────────────

export interface FilterValue extends FilterCriteria {
  id: string;
  createdAt: string; // ISO 8601
  createdBy: string;
}

// ── NamedFilter (the stable, user-facing pointer) ───────────────────────────

export interface FilterHistoryEntry {
  filterValueId: string;
  from: string; // ISO 8601 — when this value became current
  to: string | null; // ISO 8601 — when superseded, null if still current
}

export interface NamedFilter {
  id: string;
  projectId: string;
  label: string; // required
  description?: string; // optional
  currentFilterValueId: string; // pointer to the current FilterValue
  history: FilterHistoryEntry[]; // append-only
  createdAt: string;
  createdBy: string;
  deletedAt?: string; // soft-delete marker; absent = active
}

// ── FilterRef (how a View points at a Filter) ───────────────────────────────

export type FilterRefMode = "track" | "pin";

export interface FilterRef {
  mode: FilterRefMode;
  namedFilterId: string;
  // Only meaningful (and only present) when mode === "pin".
  pinnedFilterValueId?: string;
}

// ── View ─────────────────────────────────────────────────────────────────

export interface LayoutEntry {
  nodeId: number;
  x: number;
  y: number;
  pinned?: boolean;
}

export interface View {
  id: string;
  datasetId: string;
  projectId: string;
  label: string;
  // Both optional and independent: a View may have layout only,
  // filter only, both, or (rarely useful) neither.
  layout?: LayoutEntry[];
  filterRef?: FilterRef;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

// ── Store contracts (storage-agnostic) ──────────────────────────────────────
//
// Every adapter (file-based now, Postgres/Neo4j/etc. later) implements these
// two interfaces exactly. Callers never know which backend is underneath.

export interface FilterStore {
  get(namedFilterId: string): Promise<NamedFilter | null>;
  list(projectId: string): Promise<NamedFilter[]>; // excludes soft-deleted
  create(
    projectId: string,
    label: string,
    criteria: FilterCriteria,
    createdBy: string,
    description?: string
  ): Promise<NamedFilter>;
  // Mints a new FilterValue, appends to history, repoints currentFilterValueId.
  // Must be atomic.
  updateCriteria(
    namedFilterId: string,
    criteria: FilterCriteria,
    updatedBy: string
  ): Promise<NamedFilter>;
  // Mutates label/description directly — no new FilterValue, no history entry.
  rename(
    namedFilterId: string,
    label?: string,
    description?: string
  ): Promise<NamedFilter>;
  // Sets deletedAt; does not remove the record (Views may still reference it).
  softDelete(namedFilterId: string): Promise<void>;
  // Resolves a FilterRef down to the effective criteria it currently means.
  resolve(filterRef: FilterRef): Promise<FilterCriteria | null>;
}

export interface ViewStore {
  get(viewId: string): Promise<View | null>;
  list(datasetId: string): Promise<View[]>;
  create(
    datasetId: string,
    projectId: string,
    label: string,
    createdBy: string,
    layout?: LayoutEntry[],
    filterRef?: FilterRef
  ): Promise<View>;
  update(
    viewId: string,
    updates: { label?: string; layout?: LayoutEntry[]; filterRef?: FilterRef | null }
  ): Promise<View>;
  delete(viewId: string): Promise<void>;
}

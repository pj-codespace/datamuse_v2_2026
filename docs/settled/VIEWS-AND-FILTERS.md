# Views, Filters & Audit Trail — Schema Design

**Status: designed, not yet implemented.** This captures the architecture decided so far so implementation can start from an agreed model instead of re-litigating it.

## Data hierarchy

Not a strict tree — a small graph. The one cross-reference that breaks strict nesting is the Filter, which a View references but which actually lives at the Project level.

```
Project
 ├── settings (categories, linkTypes, strengths, etc.) ── referenced by ↴
 ├── named Filters (pointers to immutable filter-values) ←───────────────┐
 ├── Dataset A (raw)                                                    │
 │     └── View(s): layout (own) + filter (pointer up to Project) ──────┘
 ├── Dataset B (raw)
 │     └── View(s): same pattern
 └── Canonical Dataset (reconciled, optional)
       └── View(s): same pattern
```

- A Project can have **multiple raw datasets**, optionally reconciled (automated + human) into one canonical dataset.
- A **View** = manual layout (dragged/pinned node positions) + active filters.
- **Layout is dataset-scoped and never shared** across datasets — entity identities may differ between unreconciled datasets.
- **Filters are project-scoped**, not dataset-scoped — reusable across many datasets (envisioned use case: 500+ survey-response datasets).
- Views can live on **any** dataset — raw or canonical — not just the canonical one.

## Entity shapes (backend-agnostic)

```
Dataset
  id
  projectId
  kind: "raw" | "canonical"
  reconciledFrom: [datasetId, ...]   # only if canonical

FilterValue (immutable — never mutated after creation)
  id
  projectId
  criteria: { categories[], linkTypes[], influenceRange, interestRange }
  createdAt, createdBy

NamedFilter (the "pointer")
  id
  projectId
  label
  currentFilterValueId  → FilterValue
  history: [{ filterValueId, from, to }]   # append-only

View
  id
  datasetId             # scopes the layout
  projectId
  layout: { nodeId: {x, y, pinned} }[]
  filterRef:
    mode: "track" | "pin"
    namedFilterId: → NamedFilter
    pinnedFilterValueId: → FilterValue   # only if mode === "pin"
  createdAt, createdBy, updatedAt
```

## Rules to enforce in application logic (not guaranteed by any DB)

- Editing a `NamedFilter` never mutates `currentFilterValueId` in place. It creates a new `FilterValue`, appends `{old, new}` to `history`, then repoints `currentFilterValueId`. This write must be atomic and append-only regardless of backend.
- `View.layout` only references `nodeId`s that exist in `View.datasetId` — no cross-dataset layout reuse.
- Deleting/archiving a `Dataset` must never delete `NamedFilter` / `FilterValue` records — other datasets' Views may still reference them.

## Audit trail — minimum viable shape

Every mutation to `NamedFilter`, `Dataset` (reconciliation events), and eventually CRUD on nodes/links should append `{who, when, what, previousValueRef}` to an append-only log, rather than relying solely on each entity's own `history` array once things scale. Keep this decision independent of the Firestore-vs-Postgres choice below.

## Mapping onto a backend

- **Firestore**: `filterValues` (immutable docs), `namedFilters` (mutable pointer + history subcollection), `views` (per dataset), top-level `auditLog` collection. Firestore has no native referential integrity or enforced immutability — the rules above must be enforced in app code / security rules / Cloud Functions.
- **Postgres (or similar relational)**: same shape with real foreign keys, and a trigger-based audit table instead of app-enforced discipline.

## Open question

Does the audit trail need strong relational guarantees (provably-never-mutated filter values), or is an append-only convention enforced by app code sufficient? This determines whether Firestore+Cloud Functions is adequate or a relational DB is the safer default.

## Explicitly NOT decided yet

- Sticky/pinned nodes + stop/start simulation — deferred pending a user briefing; do not assume it folds into this schema without confirmation.
- Whether reconciliation orphans or carries forward raw-dataset Views when a canonical dataset is created.

---
title: Views & Filters — Amendments (Session Follow-up)
description: Addendum to VIEWS-AND-FILTERS.md capturing schema amendments and CRUD scope agreed in a follow-up session.
---

# Views & Filters — Amendments (Session Follow-up)

**Status:** amends `settled/VIEWS-AND-FILTERS.md`. Read that document first — this is a delta on top of it, not a replacement.

## 1. `NamedFilter.description` added

The original schema only defined `label` on `NamedFilter`. Decided: a filter needs a name **and/or** description for reliable reference, especially at the envisioned scale (500+ survey-response datasets, filters reused across contexts that aren't obvious from the name alone).

```
NamedFilter
  id
  projectId
  label
  description?        // NEW — optional
  currentFilterValueId → FilterValue
  history: [{ filterValueId, from, to }]
```

`label` and `description` are identity fields on the stable wrapper, not versioned criteria — renaming/redescribing a filter does **not** mint a new `FilterValue` or append to `history`. Only a change to the actual criteria does that.

## 2. `View.filterRef` made optional (not a "none" sentinel)

The original schema implied `filterRef` was always present on a `View`. Decided: a View can legitimately have **layout only**, with no filter applied at all — this needed to be representable cleanly.

Two options were considered:

- **Sentinel approach** (rejected): keep `filterRef` always present, add a `mode: "none"` value with `namedFilterId`/`pinnedFilterValueId` set to `null`. Works, but requires validating an extra invariant (that the null fields really are null) and adds a branch everywhere `filterRef` is read.
- **Optional field approach** (chosen): `filterRef` is simply absent when no filter is applied.

```
View
  id
  datasetId
  projectId
  layout?: { nodeId: {x, y, pinned} }[]
  filterRef?: {
    mode: "track" | "pin"
    namedFilterId: → NamedFilter
    pinnedFilterValueId?: → FilterValue   // only if mode === "pin"
  }
  createdAt, createdBy, updatedAt
```

This mirrors the nested-optionality pattern already used for `pinnedFilterValueId` (present only when `mode === "pin"`), rather than introducing a new convention. It also maps cleanly onto both backends under consideration:

- **Firestore** — an omitted field stores nothing; no extra query branch needed beyond a standard `== null` check.
- **Postgres** — collapses to a nullable FK column (`named_filter_id UUID NULL`), the idiomatic way to express "no reference."

Confirms and formalizes the four legitimate View shapes discussed earlier: no layout/no filter, layout only, filter only, or both.

## 3. CRUD scope agreed

**Build order:** Filter CRUD first, then View CRUD — Views can't be meaningfully tested until at least one real `NamedFilter` exists to reference.

### Filters (`NamedFilter` + `FilterValue`) — project-scoped

| Op | Behavior |
|---|---|
| Create | Build criteria via `FilterPanel.tsx` → mint one `FilterValue` + one `NamedFilter` pointing at it; `history: []`; `label` required, `description` optional |
| Read | List all `NamedFilter`s for a project; resolve a `namedFilterId` (+ optional `pinnedFilterValueId`) to effective criteria |
| Update | Two distinct operations: (a) edit criteria → mint new `FilterValue`, append to `history`, repoint `currentFilterValueId`, atomic; (b) rename/redescribe → mutate `label`/`description` directly, no new `FilterValue` |
| Delete | Soft-delete only — other Views may hold a `pinnedFilterValueId` or a tracking `namedFilterId` against it |

### Views — dataset-scoped

| Op | Behavior |
|---|---|
| Create | Capture current `layout` (if any) and current `filterRef` (if any) at save time; both optional |
| Read | List Views per dataset; resolve `filterRef` the same way as Filter reads |
| Update | Re-save layout and/or filterRef under the same View id; bump `updatedAt`; audit-logging each save is a scale decision, not a correctness one |
| Delete | Hard delete is fine — nothing else references a View by id |

## Explicitly not decided in this session

- Whether renaming a `NamedFilter` should itself be audit-logged at the append-only log level (vs. just being a plain mutation) — flagged, not resolved.
- Everything already listed as "not decided yet" in the base `VIEWS-AND-FILTERS.md` document still stands (sticky/pinned nodes, reconciliation orphaning behavior for raw-dataset Views).

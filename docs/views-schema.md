---
title: Views/Audit Trails Schema
---

## Dataset
  id
  projectId
  kind: "raw" | "canonical"
  sourceFile / reconciledFrom: [datasetId, ...]  (if canonical)

## FilterValue (immutable)
  id
  projectId
  criteria: { categories[], linkTypes[], influenceRange, interestRange }
  createdAt, createdBy
  # never mutated after creation

## NamedFilter (the "pointer")
  id
  projectId
  label
  currentFilterValueId  → FilterValue
  history: [{ filterValueId, from, to }]   ← append-only audit log

## View
  id
  datasetId            ← scopes the layout
  projectId             ← redundant but useful for queries
  layout: { nodeId: {x, y, pinned} }[]
  filterRef:
    mode: "track" | "pin"
    namedFilterId: → NamedFilter
    pinnedFilterValueId: → FilterValue (only if mode === "pin")
  createdAt, createdBy, updatedAt

---

**Key relationships enforced in app logic, not the DB:**

Editing a NamedFilter never mutates currentFilterValueId in place — it creates a new FilterValue, appends {old, new} to history, then repoints currentFilterValueId. This is the one write pattern that must be atomic and append-only, regardless of backend.
View.layout only ever references nodeIds that exist in View.datasetId — no cross-dataset layout reuse, by design.
Deleting/archiving a Dataset should never delete NamedFilter/FilterValue records, since other datasets' Views may still reference them.

**Audit trail minimum viable shape:** every mutation to NamedFilter, Dataset (reconciliation events), and eventually CRUD on nodes/links should append {who, when, what, previousValueRef} to an append-only log collection, rather than relying on the entity's own history array once things scale — keeps the schema decision (Firestore vs Postgres) separate from the audit requirement itself.

This maps onto Firestore as: filterValues (immutable docs), namedFilters (mutable pointer + history array or subcollection), views (per dataset), and a top-level auditLog collection. Onto Postgres it's the same shape with real foreign keys and a trigger-based audit table instead of app-enforced discipline.
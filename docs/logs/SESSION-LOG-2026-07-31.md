---
title: Session Log — Filter CRUD, Storage Adapter Design, Save/Load UI
description: Summary of decisions and code produced in the 2026-07-31 session on Views & Filters.
---

# Session Log — 2026-07-31

**Scope:** picked up from `settled/VIEWS-AND-FILTERS.md`, resolved two open schema questions, scoped CRUD, designed a storage-agnostic adapter architecture, built and proved out a file-based implementation, and wired real Filter save/load into the UI end-to-end.

---

## 1. Schema amendments

Already captured in `settled/VIEWS-AND-FILTERS-AMENDMENTS.md` from earlier in this session:

- `NamedFilter.description?` added (optional, alongside required `label`).
- `View.filterRef?` made optional at the top level — absent means no filter applied, rather than a populated object with a `mode: "none"` sentinel. Chosen for consistency with the existing `pinnedFilterValueId?` nested-optionality pattern, and because it maps more cleanly onto both Postgres (nullable FK) and Firestore (omitted field) than a sentinel value would.

## 2. CRUD scope agreed

**Filters** (`NamedFilter` + `FilterValue`, project-scoped): Create mints a `FilterValue` + `NamedFilter`; Read covers list-by-project and resolve-by-ref; Update splits into two distinct operations — editing criteria (mints a new `FilterValue`, appends history, atomic pointer repoint) vs. renaming (mutates `label`/`description` directly, no new history); Delete is soft-delete only, since Views may reference a filter by id or by a pinned historical value.

**Views** (dataset-scoped): standard CRUD; Delete is a hard delete since nothing else references a View by id.

Build order: Filters before Views, since Views can't be meaningfully tested without a real `NamedFilter` to reference.

## 3. Storage adapter architecture

Discussed the cost of file-based CRUD vs. building directly against a cloud DB, given eventual candidates include Postgres, Firestore, **and Neo4j** (a graph DB fits the actor-network domain directly, but its driver uses a stateful Bolt/TCP connection rather than HTTP, which sits awkwardly with Next.js's serverless/edge execution model — flagged as a real cost, not just a preference, with Postgres/Neon recommended as the first adapter for that reason).

Landed on a **storage-agnostic repository pattern**: `FilterStore` / `ViewStore` interfaces define every operation at the domain level (`get`, `list`, `create`, `updateCriteria`, `rename`, `softDelete`, `resolve` / `update`, `delete`) with no method implying *how* a backend answers it. IDs are opaque strings throughout. The atomic "mint new `FilterValue` + repoint pointer" operation is each adapter's own internal responsibility (temp-file+rename for files; a DB transaction for Postgres; a single Cypher query for Neo4j) — never visible to callers.

**Robustness mechanism:** a single, storage-agnostic **contract test suite** (`contract-tests.ts`) is written once against the interfaces and run unchanged against every adapter. An adapter isn't considered done until it passes the shared suite — this is what actually proves two backends behave identically, not just the interface existing.

## 4. File-based adapter — built and verified

Implemented `fileFilterStore` / `fileViewStore` satisfying the contracts, storing JSON under a project-root `data/` folder (kept separate from `public/data/`, which remains reserved for read-only network-dataset fixtures per the existing project convention). Atomic writes via temp-file + `fs.rename()`. `DATA_ROOT` is overridable via `VIEWS_FILTERS_DATA_ROOT` env var so tests never touch real app data.

Ran the full 15-assertion contract suite against it — all passing, including the two subtlest cases: a `pin`-mode resolve stays frozen after a later `updateCriteria()` call, and `update()` correctly distinguishes an explicit `null` (clear the field) from an omitted key (leave it alone).

## 5. Filter save/load UI — wired end to end

Added a "Saved Filters" section to `FilterPanel.tsx`: load a saved filter into the live graph, save the current selection as new, update a loaded filter's criteria, delete (soft) a saved filter. Backed by new API routes (`app/api/filters/`, `app/api/filters/[id]/`, `app/api/filters/[id]/resolve/`) since the file store uses Node's `fs` and can't be imported into client components directly.

**Translation layer** (`client.ts`) added between the ephemeral, Set-based `FilterState` (used live by `NetworkGraph.tsx`) and the persisted, array-based `FilterCriteria`. Noted as a flagged assumption: influence/interest ranges are stored as 2-element `[min, max]` arrays, lossless only because the UI currently produces contiguous ranges — would need revisiting if non-contiguous multi-select is ever added. `linkStrengths` isn't exposed in the filter UI yet, so it round-trips as an empty ("no constraint") array.

### Bugs found and fixed along the way

1. **Missing `projectId` prop chain.** `FilterPanel` needed a project id to scope filters, and the original code guessed at `project.id` — but `NetworkWorkspace` never actually received that string from anywhere; it only comes from the dynamic route's `params.projectId`. Fixed by threading an explicit `projectId: string` prop through `page.tsx → NetworkWorkspace → ToolSidePanel → FilterPanel`, decoupled from whatever shape `ProjectMeta` turns out to have.
2. **Next.js 15+/16 async route params.** The `[id]`-based API routes (`app/api/filters/[id]/route.ts`, `.../resolve/route.ts`) were written with the old synchronous `{ params: { id: string } }` shape. Since Next 15, route handler params are `Promise`-based — same pattern already visible in `page.tsx`'s `params: Promise<{ projectId: string }>`. The mismatch meant `params.id` was `undefined` at runtime (no error, just silently wrong), so every load/update/delete by id resolved to "not found." Fixed by awaiting `params` in all three handlers.

## Files touched this session

**New:**
- `app/_lib/views-filters/types.ts` — domain schema + store interfaces
- `app/_lib/views-filters/file-store.ts` — file-based adapter
- `app/_lib/views-filters/contract-tests.ts` — shared behavioral test suite
- `app/_lib/views-filters/run-contract-tests.file.ts` — disposable test harness for the file adapter
- `app/_lib/views-filters/client.ts` — FilterState⇄FilterCriteria translation + API fetch helpers
- `app/api/filters/route.ts`, `app/api/filters/[id]/route.ts`, `app/api/filters/[id]/resolve/route.ts`
- `docs/settled/VIEWS-AND-FILTERS-AMENDMENTS.md`

**Modified:**
- `app/_components/layout/FilterPanel.tsx` — Saved Filters section added
- `app/_components/layout/ToolSidePanel.tsx` — `projectId` prop threaded through
- `app/_components/layout/NetworkWorkspace.tsx` — `projectId` prop added and threaded through
- `app/(visualizations)/network/[projectId]/page.tsx` — passes `projectId` to `NetworkWorkspace`

## Open items / next steps

- **View (layout + filter together) save/load** — not yet wireable. `NetworkGraph`'s imperative handle needs `getNodePositions()` / `setNodePositions()` added before layout can be captured or restored; currently only `zoomIn/zoomOut/resetZoom/clearSelection/selectNode` exist.
- **Postgres adapter** — next backend to build, validated against the same `contract-tests.ts` suite unchanged.
- Whether renaming a `NamedFilter` should be audit-logged at the append-only log level, vs. remaining a plain mutation — flagged previously, still undecided.
- Everything already listed as open in the base `VIEWS-AND-FILTERS.md` and its amendments doc still stands (sticky/pinned nodes, reconciliation-orphaning behavior for raw-dataset Views).

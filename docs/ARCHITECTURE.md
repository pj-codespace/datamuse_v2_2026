---
title: Architecture
---

# Architecture

**Stack:** Next.js 16 (App Router, TypeScript), D3.js (force simulation + SVG rendering), Tailwind CSS, pnpm. Persistence: Drizzle ORM over Postgres (Neon) — the active backend for Filters/Views as of this writing; a file-based adapter from early development still exists but is no longer wired into any route.

## Folder structure

```bash
app/
  page.tsx                          → root dashboard: lists projects, links to /network/[id]
  (visualizations)/
    network/
      [projectId]/page.tsx          → per-project network page (dynamic route); passes projectId
                                       through explicitly to NetworkWorkspace
  _lib/
    data/
      types.ts                      → NetworkDataset, NetworkNode, NetworkLink, ProjectMeta, etc.
      network-data.ts               → getNetworkData(id), getProjectSummaries()
      projects.ts                   → PROJECT_REGISTRY: maps project id -> data filename
    filters/
      types.ts                      → FilterState (ephemeral, client-side), createDefaultFilterState,
                                       isNodeVisible/isLinkVisible — drives what's visible in the live
                                       D3 sim right now; NOT the same thing as the persisted
                                       NamedFilter below (see Persistence layer)
    views-filters/
      types.ts                      → persisted domain schema: FilterCriteria, FilterValue,
                                       NamedFilter, FilterRef, View + the FilterStore/ViewStore
                                       storage-agnostic interfaces
      client.ts                     → FilterState ⇄ FilterCriteria translation + fetch helpers
                                       for the /api/filters routes (client-safe; no fs/db imports)
      file-store.ts                 → file-based FilterStore/ViewStore implementation (dev/test
                                       only — doesn't survive Vercel's serverless filesystem)
      schema.ts                     → Drizzle table definitions (named_filters, filter_values,
                                       filter_history, views)
      db.ts                         → Neon/Drizzle connection singleton
      postgres-store.ts             → Postgres FilterStore/ViewStore implementation
      contract-tests.ts             → storage-agnostic behavioral test suite, run unchanged
                                       against every adapter
      run-contract-tests.file.ts    → test harness for the file adapter (passing)
      run-contract-tests.postgres.ts→ test harness for the Postgres adapter
  api/
    filters/
      route.ts                     → GET (list), POST (create)
      [id]/route.ts                → GET, PATCH (updateCriteria or rename), DELETE (soft-delete)
      [id]/resolve/route.ts        → GET — resolves a filter's current criteria
  _components/
    visualizations/
      network-graph/
        NetworkGraph.tsx            → D3 force-directed graph (client component, forwardRef)
        useContainerSize.ts         → ResizeObserver hook for responsive SVG sizing
    layout/
      NetworkWorkspace.tsx          → orchestrator: holds UI state, composes everything;
                                       receives projectId as an explicit prop (see below)
      TopBar.tsx / ToolDock.tsx / ToolSidePanel.tsx / FilterPanel.tsx
      ZoomControlPanel.tsx / LegendPanel.tsx / SavePanel.tsx
      NodeContextMenu.tsx / tools.ts
public/
  data/*.json                       → cleaned per-project datasets (read-only fixtures; unrelated
                                       to Filters/Views persistence)
drizzle.config.ts                   → project root; drizzle-kit config for schema migrations
```

`_lib` = renderer-agnostic domain logic/types. `_components/layout` = UI chrome. `_components/visualizations` = chart implementations (currently only the force graph). `views-filters` is deliberately a separate module from `filters` — see Persistence layer below for why the naming overlap is intentional-but-distinct rather than a merge candidate.

## Data model

- Source data per project: static JSON in `public/data/`, shape `{ project: {...}, nodes: [...], links: [...] }`.
- `project.settings` is the canonical schema shared across a project: `categories`, `linkTypes` (with `direction`), `linkStrengths`, `influenceLevels`, `interestLevels`.
- Nodes: `{ id, name, category, interest, influence, description }`. Simulation-derived fields (x/y, degree, centrality) are excluded from source data.
- Links: `{ source, target, type, strength }` (0=weak, 1=normal, 2=strong).
- Reciprocal links (A→B and B→A) are kept as two distinct records, on purpose — independent strength/frequency/confidence per direction is planned.

### Project registry

| id                    | dataFile                  |
| --------------------- | ------------------------- |
| off-grid-analysis     | network-sample-large.json |
| HIM-2                 | network-sample-mid.json   |
| Open-Air-Food-Markets | network-sample-sm.json    |
| RRCS-in-Africa        | network-ng.json           |
| IFPRI-composite       | ifpri\_test.json          |

## NetworkGraph.tsx

- React owns the `<svg>` shell; D3 owns everything inside the root `<g>` imperatively.
- Responsive sizing via `useContainerSize` (ResizeObserver) drives `viewBox`.
- Forces: `forceLink` (distance 90), `forceManyBody` (strength -120, capped `distanceMax`), `forceCenter`, `forceX`/`forceY` gravity (strength 0.03), `forceCollide`.
- Node radius: `4 + influence * 1.5`.
- Links render as `<path>` (quadratic Bézier) to support curving. Only links sharing a node-pair with siblings curve; lone links render as straight segments (perf optimization).
- Curve bow direction is computed from canonical id-order (`min(id)→max(id)`), not source→target, so reciprocal pairs fan into two arcs instead of collapsing.
- Link style by strength: 0 = dotted, 1 = solid 1px, 2 = solid 1.5px. Color follows link type's legend color. Arrowheads shown only for directed link types.
- Labels: visible at ≥100% zoom, toggled inside the D3 zoom handler (no React state). Collision-avoidance pass exists but is disabled (`ENABLE_LABEL_DECLUTTER = false`).
- Highlighting: `mousedown` (not hover, to avoid flicker during drag) highlights node + first-order neighbors, dims everything else to 0.08 opacity.
- Persistent selection: double-click shows a blue ring (separate from highlight system) and opens Edit Actor panel.
- Context menu: right-click → View / Edit / Delete. Delete is a stub (`console.warn`).
- Tooltips: native SVG `<title>`.
- Imperative handle (`NetworkGraphHandle`): `zoomIn`, `zoomOut`, `resetZoom`, `clearSelection`, `selectNode(id)`. **Not yet present:** `getNodePositions`/`setNodePositions` — needed before a View's saved `layout` can actually be captured or restored (see Persistence layer).
- Filtering happens before nodes/links enter the simulation, not just visually — so layout reflows on filter change. Known tradeoff: this will need revisiting once manually-arranged positions are persisted (see Views).

## UI shell

- Top bar (80px): project name + placeholder nav.
- Floating right-side tool dock: Add/Edit/Delete Actor, Link, Filter (only Filter is real). Slide-in side panel, one at a time.
- Floating bottom panels: zoom HUD (real), legend (real), save/export (stubs).
- `RENDER_GRAPH` flag in `NetworkWorkspace.tsx` swaps the real graph for a placeholder box, for isolating layout bugs from D3 bugs.
- `projectId` (the route-param string, e.g. `"off-grid-analysis"`) is threaded explicitly as its own prop through `page.tsx → NetworkWorkspace → ToolSidePanel → FilterPanel`, decoupled from whatever shape `ProjectMeta`/`NetworkDataset` carry — it's needed to scope persisted Filters per project and isn't derivable from those types.

## Filtering — two distinct layers

**Ephemeral `FilterState`** (`app/_lib/filters/types.ts`) — fully implemented: filter by category, link type, influence range, interest range (OR within a dimension, AND across dimensions). Drives `NetworkGraph.tsx` directly, recomputed on every render, never itself saved.

**Persisted `NamedFilter`** (`app/_lib/views-filters/`) — a named, versioned, saved filter that a person can create, reload, edit, and delete across sessions. `FilterPanel.tsx` now has a "Saved Filters" section wired to this: load a saved filter into the live `FilterState`, save the current selection as a new named filter, update a loaded filter's criteria (mints a new version, keeps history), or soft-delete it. All via `app/api/filters/*` routes, since the storage adapters use `fs`/DB clients that can't run in client components.

These two are deliberately separate modules (`filters/` vs `views-filters/`) despite the name overlap — one is per-render UI state, the other is a persisted, versioned entity with its own lifecycle. See `SESSION-LOG-2026-07-31.md` for the reasoning.

## Persistence layer (Filters & Views)

Built as a **storage-agnostic repository pattern**: `FilterStore`/`ViewStore` interfaces (`app/_lib/views-filters/types.ts`) define every operation — `get`, `list`, `create`, `updateCriteria`, `rename`, `softDelete`, `resolve` (Filters); `get`, `list`, `create`, `update`, `delete` (Views) — at the domain level, with no method implying which database answers it. IDs are opaque strings throughout.

**Two adapters exist, both implementing the same interfaces:**
- **File-based** (`file-store.ts`) — JSON on disk, atomic temp-file+rename writes. Fully validated (15/15 contract-test assertions passing) but **not viable in production**: Vercel's serverless functions run on a filesystem that's read-only outside `/tmp`, and `/tmp` doesn't persist across cold starts — this is what caused save/load failures once deployed. No longer imported by any API route; kept as reference/fallback only.
- **Postgres** (`postgres-store.ts`, via Drizzle + Neon) — the active, production-bound adapter. Schema in `schema.ts`: `named_filters`, `filter_values`, `filter_history` (one row per history entry, not a jsonb array, so closing/opening entries is a clean atomic transaction rather than a read-modify-write), and `views`. **Validated**: full 15/15 contract-test suite passing against a real Neon database, and `app/api/filters/*` routes are cut over to use it. `db.ts` uses a WebSocket-based driver (`drizzle-orm/neon-serverless` + `Pool`, not the HTTP driver) specifically because `db.transaction()` — needed by `create()` and `updateCriteria()`'s atomic mint-and-repoint operation — isn't supported over Neon's HTTP driver. Two aspects of this driver choice are flagged but not yet confirmed against real Vercel serverless infrastructure (only tested via local `tsx` so far): whether a module-level `Pool` singleton behaves correctly across serverless cold starts/invocations, and whether the `ws` package is required on Vercel's actual deployed Node runtime (local testing used Node 25's native `WebSocket` support, which may not reflect Vercel's runtime version).

**Deploy state, as of this writing:** schema pushed and validated on Neon's `vercel-dev` branch only — Production's branch (`main`) has not yet had the schema pushed to it, so the live deployed app cannot yet use Filters. Neon's branch-per-environment model, and the full Dev/Preview/Production workflow, are documented separately in `NEON-BRANCH-WORKFLOW-LOG.md` rather than duplicated here.

**Robustness mechanism:** `contract-tests.ts` is a single, storage-agnostic behavioral test suite written once against the interfaces and run unchanged against every adapter. An adapter isn't considered done until it passes this suite — the actual proof two backends behave identically, not just the interface existing. `runViewStoreContractTests` requires a real `FilterStore` to create a genuine `NamedFilter` before testing a View's `filterRef` — an earlier version used a synthetic placeholder id, which the file adapter didn't catch (no referential-integrity checking) but Postgres correctly rejected via its foreign-key constraint, surfacing a test gap rather than an adapter bug.

**Provider choice:** Neon over "Vercel Postgres" (discontinued in 2025, migrated to Neon) or Supabase — chosen specifically to avoid coupling the database to an auth/realtime bundle before those requirements exist. Standard Postgres wire protocol means switching to Supabase later, if ever needed, would only require rework of auth/realtime-specific code, not this data layer.

## Not yet built

- **View layout capture** — `NetworkGraph`'s imperative handle needs `getNodePositions`/`setNodePositions` added before a saved View's manual arrangement can be captured or restored. Filter-only Views work today; layout-bearing Views don't yet.
- **Postgres cutover** — done and validated (see Persistence layer above); the one remaining step is pushing the schema to Production's Neon branch (`main`) — only `vercel-dev` has it so far, so the live deployed app can't use Filters yet.
- **Actor/link CRUD** (Add/Edit/Delete Actor, Link tools) — UI triggers exist, panels are placeholders.
- **Save/Export** — buttons exist, no backend.
- **Auth** — deferred, not yet designed.
- **Sticky/pinned nodes + stop/start simulation** — deferred pending visualization-behavior decisions.
- See `DEV-NOTES.md`, `VIEWS-AND-FILTERS.md`, and its amendments doc for what's designed-but-not-built vs. fully open.

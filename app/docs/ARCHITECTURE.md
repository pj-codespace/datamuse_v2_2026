# Architecture

**Stack:** Next.js 16 (App Router, TypeScript), D3.js (force simulation + SVG rendering), Tailwind CSS, pnpm.

## Folder structure

```
app/
  page.tsx                          → root dashboard: lists projects, links to /network/[id]
  (visualizations)/
    network/
      [projectId]/page.tsx          → per-project network page (dynamic route)
  _lib/
    data/
      types.ts                      → NetworkDataset, NetworkNode, NetworkLink, ProjectMeta, etc.
      network-data.ts               → getNetworkData(id), getProjectSummaries()
      projects.ts                   → PROJECT_REGISTRY: maps project id -> data filename
    filters/
      types.ts                      → FilterState, createDefaultFilterState, isNodeVisible/isLinkVisible
  _components/
    visualizations/
      network-graph/
        NetworkGraph.tsx            → D3 force-directed graph (client component, forwardRef)
        useContainerSize.ts         → ResizeObserver hook for responsive SVG sizing
    layout/
      NetworkWorkspace.tsx          → orchestrator: holds UI state, composes everything
      TopBar.tsx / ToolDock.tsx / ToolSidePanel.tsx / FilterPanel.tsx
      ZoomControlPanel.tsx / LegendPanel.tsx / SavePanel.tsx
      NodeContextMenu.tsx / tools.ts
public/
  data/*.json                       → cleaned per-project datasets
```

`_lib` = renderer-agnostic domain logic/types. `_components/layout` = UI chrome. `_components/visualizations` = chart implementations (currently only the force graph).

## Data model

- Source data per project: static JSON in `public/data/`, shape `{ project: {...}, nodes: [...], links: [...] }`.
- `project.settings` is the canonical schema shared across a project: `categories`, `linkTypes` (with `direction`), `linkStrengths`, `influenceLevels`, `interestLevels`.
- Nodes: `{ id, name, category, interest, influence, description }`. Simulation-derived fields (x/y, degree, centrality) are excluded from source data.
- Links: `{ source, target, type, strength }` (0=weak, 1=normal, 2=strong).
- Reciprocal links (A→B and B→A) are kept as two distinct records, on purpose — independent strength/frequency/confidence per direction is planned.

### Project registry

| id | dataFile |
|---|---|
| off-grid-analysis | network-sample-large.json |
| HIM-2 | network-sample-mid.json |
| Open-Air-Food-Markets | network-sample-sm.json |
| RRCS-in-Africa | network-ng.json |
| IFPRI-composite | ifpri_test.json |

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
- Imperative handle (`NetworkGraphHandle`): `zoomIn`, `zoomOut`, `resetZoom`, `clearSelection`, `selectNode(id)`.
- Filtering happens before nodes/links enter the simulation, not just visually — so layout reflows on filter change. Known tradeoff: this will need revisiting once manually-arranged positions are persisted (see Views).

## UI shell

- Top bar (80px): project name + placeholder nav.
- Floating right-side tool dock: Add/Edit/Delete Actor, Link, Filter (only Filter is real). Slide-in side panel, one at a time.
- Floating bottom panels: zoom HUD (real), legend (real), save/export (stubs).
- `RENDER_GRAPH` flag in `NetworkWorkspace.tsx` swaps the real graph for a placeholder box, for isolating layout bugs from D3 bugs.

## Filtering

Fully implemented (`app/_lib/filters/types.ts`): filter by category, link type, influence range, interest range — OR within a dimension, AND across dimensions. `FilterState` is a plain, serializable object, designed to be reused by Views.

## Not yet built

See [DEV-NOTES.md](./DEV-NOTES.md) and [VIEWS-AND-FILTERS.md](./VIEWS-AND-FILTERS.md) for what's designed-but-not-built vs. fully open.

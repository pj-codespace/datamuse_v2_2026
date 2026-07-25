# Network Visualization App — Project Summary

**Stack:** Next.js 16 (App Router, TypeScript), D3.js (force simulation + SVG rendering), Tailwind CSS, pnpm.
**Purpose:** A tool for visualizing and interpreting actor/relationship networks (funding flows, influence maps, etc.) from research/survey data — built as a general-purpose platform, not tied to one dataset.

This document is a snapshot of everything built and decided so far, meant to let a fresh conversation pick up work without replaying the full history. Attach it alongside the current project scaffold zip.

---

## 1. Folder structure

```
app/
  page.tsx                          → root dashboard: lists projects, links to /network/[id]
  (visualizations)/
    network/
      [projectId]/page.tsx          → per-project network page (dynamic route)
  _lib/
    data/
      types.ts                      → NetworkDataset, NetworkNode, NetworkLink, ProjectMeta, etc.
      network-data.ts               → getNetworkData(id), getProjectSummaries() — reads /public/data/*.json
      projects.ts                   → PROJECT_REGISTRY: maps project id -> data filename
    filters/
      types.ts                      → FilterState, createDefaultFilterState, isNodeVisible/isLinkVisible
  _components/
    visualizations/
      network-graph/
        NetworkGraph.tsx            → the D3 force-directed graph (client component, forwardRef)
        useContainerSize.ts         → ResizeObserver hook for responsive SVG sizing
    layout/
      NetworkWorkspace.tsx          → orchestrator: holds UI state, composes everything below
      TopBar.tsx                    → 80px header, project name (links home), placeholder nav
      ToolDock.tsx                  → floating right-side vertical toolbar
      ToolSidePanel.tsx             → slide-in panel from right; renders FilterPanel for real,
                                       placeholder text for other tools
      FilterPanel.tsx               → real filter UI (categories, link types, influence/interest ranges)
      ZoomControlPanel.tsx          → bottom-center zoom HUD, wired to real D3 zoom
      LegendPanel.tsx               → bottom-left, renders real category legend
      SavePanel.tsx                 → bottom-right, Save/Export placeholders (no backend yet)
      NodeContextMenu.tsx           → right-click menu: View / Edit / Delete
      tools.ts                     → shared placeholder tool list (Add/Edit/Delete Actor, Link, Filter)
public/
  data/*.json                       → cleaned per-project datasets (see §6)
```

Conventions: `_lib` = renderer-agnostic domain logic/types; `_components/layout` = UI chrome; `_components/visualizations` = chart implementations (currently only the force graph; room for matrix/bar/radar later). Underscore-prefixed folders are private (not routable) per Next.js convention.

---

## 2. Data model

- **Source data per project**: static JSON in `public/data/`, shape `{ project: {...}, nodes: [...], links: [...] }`.
- **`project.settings`** is the canonical schema shared across a project: `categories`, `linkTypes` (with `direction: "directed"|"undirected"`), `linkStrengths`, `influenceLevels`, `interestLevels`.
- **Nodes**: `{ id, name, category, interest, influence, description }`. All simulation-derived fields (x/y, degree, centrality) are deliberately **excluded from source data** — D3 computes positions at runtime; analytics (centrality etc.) will be computed on request by a future module, not stored in the dataset.
- **Links**: `{ source, target, type, strength }`. `strength` is numeric (0=weak,1=normal,2=strong); blank/missing defaults to 1 at cleaning time.
- **Cleaning rules established**: strip all derived/computed fields; trim whitespace; drop obvious placeholder/"unknown" nodes (case-by-case, confirmed with user); reciprocal links (A→B and B→A) are kept as **two distinct link records** on purpose — the team plans to assign independent strength/frequency/confidence per direction later, so merging them into one bidirectional link would lose information.

### Project registry (`app/_lib/data/projects.ts`)
```ts
{ id: "off-grid-analysis", dataFile: "network-sample-large.json" },
{ id: "HIM-2", dataFile: "network-sample-mid.json" },
{ id: "Open-Air-Food-Markets", dataFile: "network-sample-sm.json" },
{ id: "RRCS-in-Africa", dataFile: "network-ng.json" },
{ id: "IFPRI-composite", dataFile: "ifpri_test.json" },
```
**Important lesson learned**: these are genuinely different files/datasets, even when they sound similar. A data-inconsistency investigation once went sideways because two checks were run against different files under an evolving registry entry without realizing it. Always confirm which exact file is in question before debugging cross-session.

---

## 3. NetworkGraph.tsx — how the graph actually works

- **Architecture**: React owns the `<svg>` shell (created once); D3 owns everything inside a root `<g>` imperatively via selections — this avoids routing every simulation tick through React's render cycle, which matters at hundreds of nodes / thousands of links.
- **Responsive sizing**: `useContainerSize` (ResizeObserver) drives the SVG's `viewBox`; a `min-h-0` on the flex ancestor was required to fix an earlier "canvas keeps expanding" bug (classic flexbox gotcha).
- **Forces**: `forceLink` (distance 90), `forceManyBody` (strength -120, `distanceMax` capped to viewport size), `forceCenter`, plus **`forceX`/`forceY` gravity** (strength 0.03) added specifically to stop isolated/low-degree nodes from drifting off-canvas — `forceCenter` alone only holds the *average* position, not individual nodes. `forceCollide` sized to each node's radius.
- **Node radius**: `4 + influence * 1.5`.
- **Links**: rendered as `<path>` (quadratic Bézier), not `<line>`, to support curving. Only links sharing a node-pair with siblings actually curve (`curveOffset` fan-out); a lone link between two nodes renders as a cheap straight segment — this was a deliberate performance optimization (Option A) after universal curving caused noticeable lag on dense datasets.
  - **Fixed bug**: the curve's bow direction is computed from a **canonical id-order reference** (`min(id)→max(id)`), not the link's own source→target direction — otherwise reciprocal pairs (A→B and B→A) mathematically cancel out and collapse onto the same visual curve instead of fanning into two arcs.
  - Link style by `strength`: 0 = 1px dotted, 1 = 1px solid, 2 = 1.5px solid. Color follows the link type's legend color.
  - Directional arrowheads via SVG `<marker>`, shown only when that link type's `direction === "directed"`.
- **Labels**: node name, centered below the node, white stroke outline (`paint-order: stroke`) for legibility over other elements. Zoom-based visibility (visible at ≥100% zoom) toggled directly inside the D3 zoom handler (no React state involved, for performance). A label **collision-avoidance pass** (spatial-grid based, approximates text width from character count rather than expensive `getBBox()` calls) exists but is currently **disabled** (`ENABLE_LABEL_DECLUTTER = false`) — results weren't satisfactory; the machinery is intact behind the flag for revisiting later.
- **Highlighting**: mousedown (not hover — hover caused flicker during drag since other nodes pass under the cursor as the sim reheats) highlights a node + first-order neighbors at full opacity with a **black** border; everything else dims to `0.08` opacity. Clears on mouseup/drag-end.
- **Persistent selection**: double-clicking a node shows a **blue ring** (separate SVG element from the highlight system, so the two never fight over the same attributes) and opens the "Edit Actor" side panel (still a placeholder panel, but the actor-name wiring is real). Selection clears when the panel is explicitly closed, but persists (and just moves) when a different actor is double-clicked while the panel stays open.
- **Context menu**: right-click on a node suppresses the native browser menu and shows a custom View/Edit/Delete menu. View = select only (ring, no panel). Edit = select + open Edit Actor panel. Delete = stub only (`console.warn`) — real deletion needs the core-dataset mutation layer, not built yet.
- **Tooltips**: native SVG `<title>`, multi-line, showing name/category label/influence/interest.
- **Double-click-to-zoom** (D3's default) is disabled (`svg.on("dblclick.zoom", null)`) since it conflicted with node double-click; canvas double-click is reserved for a future action (not yet defined).
- **Imperative handle** (`NetworkGraphHandle`, via `forwardRef`): `zoomIn`, `zoomOut`, `resetZoom`, `clearSelection`, `selectNode(id)`.
- **Filtering**: `filters?: FilterState` prop. Nodes/links are filtered **before** they ever enter the simulation (not just visually hidden) — so filtered-out nodes stop influencing physics and visible nodes reflow into the freed space. **Known tradeoff**: this means changing a filter currently rebuilds the whole layout from scratch (like a resize does); once manually-arranged positions are persisted (see Views, §5), this will need revisiting so filtering doesn't undo a saved arrangement.

---

## 4. UI shell (NetworkWorkspace + layout components)

- Top bar (80px, outside the graph's own container) — project name (links to dashboard) + 4 placeholder nav items.
- Floating right-side tool dock: Add/Edit/Delete Actor, Link, Filter (placeholders except Filter, which is fully real). Clicking toggles a slide-in side panel; only one open at a time.
- Floating bottom panels: zoom HUD (bottom-center, real), legend (bottom-left, real data), save/export (bottom-right, stubs).
- All floating panels are positioned relative to a `min-h-0` container *below* the top bar, so they never drift under it.
- `RENDER_GRAPH` flag in `NetworkWorkspace.tsx` can swap the real graph for a plain placeholder box — useful for isolating layout bugs from graph/D3 bugs (used successfully once already).

---

## 5. Filtering (built) and Views (designed, not yet built)

**Filters** (`app/_lib/filters/types.ts`) are fully implemented: filter by category, link type, influence range, interest range, any combination (OR within a dimension, AND across dimensions). `FilterState` is a plain, serializable object — deliberately designed to be reusable by saved Views later.

**Views** — extensively discussed as an architecture exercise, **not yet implemented**. Key decisions reached:
- A project can have **multiple raw datasets** conforming to one shared `project.settings` schema, optionally reconciled (automated + human) into one canonical dataset.
- A **View** captures manual layout (dragged/pinned node positions) + active filters, savable/loadable on request.
- **Layout is dataset-scoped and never shared** across datasets (entity identities may differ between unreconciled datasets).
- **Filters are NOT dataset-scoped** — they only reference project-level settings (category/link-type ids), so they're reusable across many datasets (envisioned use case: 500+ survey-response datasets). Filters use **reference semantics with track-vs-pin choice**: a named filter is a pointer to an immutable filter-value; editing the named filter creates a new immutable value and moves the pointer; each View can either track the pointer (auto-updates) or pin to a specific historical value (frozen). Changing a filter's parameters = a genuinely different filter, not a mutation — this was an explicit, deliberate design choice.
- **Project-level settings changes** (categories/link types) will be classified as breaking vs. non-breaking, at an administrator's discretion.
- **Audit trails are required** for all of the above (research/provenance requirement) — bigger backbone than originally scoped, intentionally deferred pending more definite requirements from the user.
- **Sticky/pinned nodes + stop/start simulation**: explicitly deferred. The user has a specific, not-yet-explained reason this needs to be architecturally separate from normal simulation behavior — do not assume design details here; wait for the user's brief.
- Current drag behavior is **intentionally left as the pre-Views default** (temporary pin during drag, releases on drop) per explicit instruction — do not change this until the stop/start-sim feature is specified.

---

## 6. Datasets in play

Multiple real project datasets are being used to stress-test the model (not just synthetic samples): off-grid energy investment network, HIM-2, Open-Air-Food-Markets, RRCS-in-Africa (funding sustainability of research capacity), IFPRI-composite. One dataset (RRCS-in-Africa / `network-ng.json`) had a **structural bug** during cleanup: `nodes`/`links` were nested inside `project` instead of being top-level siblings — valid JSON, but wrong shape for our loader. Fixed by hand at the source rather than adding loader tolerance, since the user wants dataset shape decisions to go through the eventual project-settings/data separation work, not be patched ad hoc.

---

## 7. Deferred / not yet built (parking lot)

- Views (see §5) — designed, not implemented.
- Sticky/pinned nodes + stop/start simulation control — deferred, needs a user briefing before starting.
- Actual CRUD for actors/links (Add/Edit/Delete Actor, Link tools) — UI triggers exist, panels are placeholders, no data-mutation layer yet.
- Save/Export functionality — buttons exist, no backend.
- Renderer switching (SVG → Canvas → WebGL based on graph size) — discussed as a real architecture question; explicitly tabled with no urgency, but the user wants the architecture to leave room for it eventually. Key insight if revisited: **link count**, not node count, is the actual bottleneck in this app's datasets — a size threshold should weigh links (or total elements), not nodes alone.
- Other visualization types (matrix, bar chart, radar) — mentioned as future needs from the very start; folder structure (`_components/visualizations/<type>/`) already anticipates this.
- Authentication — deferred; dashboard is currently a fully public landing page.
- Label collision avoidance — built, currently disabled by flag, not deleted.

---

## 8. Working conventions established with the user

- Prefer discussing architecture tradeoffs explicitly before building anything non-trivial (this happened for Views, filter semantics, and renderer switching) — don't assume defaults for genuinely open design questions when the user has flagged something as an "architecture benchmark."
- For concrete, well-scoped UI/behavior requests, implement directly with sensible defaults, flagging any assumption made along the way.
- Whenever a "bug" is reported, verify against actual raw data programmatically (a Python script, not eyeballing) before concluding anything — a prior manual-eyeball check turned out to be the source of a false bug report.
- User is testing this app as a real architecture exercise, using real research datasets, and cares about correctness/provenance (audit trails, no silent data loss) more than speed of delivery.

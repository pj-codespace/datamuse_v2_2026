---
title: Decision Log
order: 0
---


# Decision Log

Append new entries at the top. Don't rewrite or delete old entries, even if later reversed — add a new entry noting the reversal and link back to the original.

---

### Reciprocal links stay as two distinct records
A→B and B→A are never merged into a single bidirectional link, even though it'd simplify rendering. Reason: the team plans to assign independent strength/frequency/confidence per direction later. Merging now would lose information that can't be reconstructed later.

### Curve direction uses canonical id-order, not source→target
Bow direction for curved links is computed from `min(id)→max(id)`, not the link's own direction. Fixed a bug where reciprocal pairs mathematically cancelled onto the same curve instead of fanning into two arcs.

### Only sibling-sharing links curve; lone links render straight
Universal curving caused noticeable lag on dense datasets. Curving only pairs that share a node-pair with another link (Option A) was chosen as a deliberate performance tradeoff over always curving.

### Highlight on mousedown, not hover
Hover caused flicker during drag (other nodes pass under the cursor as the simulation reheats). Mousedown avoids this.

### Persistent selection (blue ring) is a separate SVG element from highlight
Kept structurally separate so the two visual states never fight over the same attributes.

### Filtering happens pre-simulation, not just visually
Filtered nodes/links are removed before they enter the D3 simulation, so they stop influencing physics. Known tradeoff: changing a filter currently rebuilds layout from scratch, same as a resize. Will need revisiting once manually-arranged positions are persisted via Views — filtering shouldn't undo a saved arrangement.

### Filters are project-scoped, not dataset-scoped
Filters only reference project-level settings (category/link-type ids), so they're reusable across many datasets (envisioned use case: 500+ survey-response datasets). Layout, by contrast, is dataset-scoped and never shared across datasets, since entity identities may differ between unreconciled datasets.

### Named filters use reference semantics with track-vs-pin
A named filter is a pointer to an immutable filter-value. Editing a named filter creates a new immutable value and moves the pointer — it does not mutate the existing value. Each View can either track the pointer (auto-updates when the named filter changes) or pin to a specific historical value (frozen). Changing a filter's parameters is treated as a genuinely different filter, not a mutation of the same one — deliberate, for audit-trail correctness.

### RRCS-in-Africa (`network-ng.json`) structural bug fixed at the source, not in the loader
`nodes`/`links` were nested inside `project` instead of top-level siblings — valid JSON, wrong shape. Fixed by hand in the data file rather than adding loader tolerance, since dataset-shape decisions are meant to go through the eventual project-settings/data separation work, not be patched ad hoc.

### Sticky/pinned nodes + stop/start simulation: deferred, don't assume design
The user has a specific, not-yet-explained reason this needs to be architecturally separate from normal simulation behavior. Current drag behavior (temporary pin during drag, releases on drop) is intentionally left as-is until this is briefed.

### Label collision avoidance: built, disabled, not deleted
Spatial-grid based pass exists behind `ENABLE_LABEL_DECLUTTER = false`. Results weren't satisfactory at the time; machinery kept intact for revisiting later rather than removed.

### Renderer switching (SVG → Canvas → WebGL): tabled, no urgency, but architecture should leave room
Key insight if revisited: **link count**, not node count, is the actual bottleneck in this app's datasets. Any size threshold should weigh links (or total elements), not nodes alone.

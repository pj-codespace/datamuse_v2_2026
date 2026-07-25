# Dev Notes

Informal scratchpad. Open questions, in-progress work, things to pick back up. Prune freely.

## Parking lot (deferred / not yet built)

- **Views** — schema designed (see VIEWS-AND-FILTERS.md), not implemented.
- **Sticky/pinned nodes + stop/start simulation control** — deferred, needs a user briefing before starting. Don't guess at design here.
- **CRUD for actors/links** — UI triggers exist (Add/Edit/Delete Actor, Link), panels are placeholders, no data-mutation layer.
- **Save/Export** — buttons exist, no backend.
- **Renderer switching (SVG → Canvas → WebGL)** — tabled, no urgency. Remember: link count is the real bottleneck, not node count.
- **Other visualization types** (matrix, bar, radar) — folder structure already anticipates this (`_components/visualizations/<type>/`).
- **Authentication** — deferred; dashboard is currently fully public.
- **Label collision avoidance** — built, disabled behind `ENABLE_LABEL_DECLUTTER`, not deleted.

## Working conventions established with the user

- Discuss architecture tradeoffs explicitly before building anything non-trivial for genuinely open design questions (this happened for Views, filter semantics, renderer switching).
- For concrete, well-scoped UI/behavior requests, implement directly with sensible defaults, flag assumptions made along the way.
- When a "bug" is reported, verify against raw data programmatically (script, not eyeballing) before concluding anything.
- Correctness/provenance (audit trails, no silent data loss) matters more than speed of delivery — this is a real architecture exercise using real research datasets.

## Gotchas / lessons learned

- **Datasets that sound similar are still genuinely different files.** A data-inconsistency investigation once went sideways because two checks ran against different files under an evolving registry entry. Always confirm the exact file before debugging cross-session.
- **`min-h-0` on flex ancestors** is required to stop the SVG canvas from expanding indefinitely — classic flexbox gotcha, easy to forget when refactoring layout.
- **Double-click is contested territory**: node double-click (select + edit panel) vs. D3's default double-click-to-zoom had to be explicitly disabled (`svg.on("dblclick.zoom", null)`). Canvas double-click is still reserved/undefined for future use — don't assume it's free real estate.

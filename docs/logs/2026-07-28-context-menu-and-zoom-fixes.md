---
title: Context Menu & Zoom Persistence Fixes
description: Click-outside bug fix, reserved canvas right-click, and zoom transform persistence across filter changes.
order: 1
---

# Context Menu & Zoom Persistence Fixes

**Date:** 2026-07-28    
**Files touched:** `NetworkGraph.tsx`, `NodeContextMenu.tsx`

## 1. Context menu wouldn't close on click-outside (within the SVG)

**Symptom:** Right-clicking a node opened `NodeContextMenu`, but clicking elsewhere inside the graph (empty canvas or another node) didn't close it — only clicking entirely outside the SVG element did.

**Root cause:** D3's `zoom` and `drag` behaviors both call `stopImmediatePropagation()` internally on the `mousedown` that starts a pan/zoom or drag gesture. `NodeContextMenu`'s outside-click listener was bound to `document` on the bubble phase, so any `mousedown` inside the SVG never reached it — D3 killed propagation before it could bubble up.

**Fix:** Bind the listener on the **capture phase** instead, so it fires on the way down to the target, before D3's handlers run and suppress bubbling.

```tsx
document.addEventListener("mousedown", handlePointerDown, true); // capture
document.addEventListener("keydown", handleKeyDown);
return () => {
  document.removeEventListener("mousedown", handlePointerDown, true);
  document.removeEventListener("keydown", handleKeyDown);
};
```

No changes needed in `NetworkGraph.tsx` for this one — D3's zoom/drag setup was left untouched.

## 2. Reserved right-click on empty canvas for a future function

**Context:** Right-clicking a node already suppressed the native browser menu and opened `NodeContextMenu`. Right-clicking empty canvas still triggered the native browser menu, since nothing intercepted it at the SVG level.

**Change:** Added a `contextmenu` listener on the `svg` selection itself (alongside the existing `dblclick.zoom` disable), plus an optional `onCanvasContextMenu` prop mirroring `onNodeContextMenu`'s shape. No parent currently supplies it — the canvas action itself is still undefined — so today this is purely a native-menu suppression stub, plumbed for later.

```tsx
svg.on("contextmenu", (event) => {
  event.preventDefault();
  onCanvasContextMenu?.(event.clientX, event.clientY);
});
```

**Note:** a right-click on a node still bubbles up to this handler after the node's own handler runs (no `stopPropagation()` added), so `onCanvasContextMenu` would currently fire for node right-clicks too if it's ever wired up. If canvas-only firing is required later, guard on `event.target` in the parent rather than adding `stopPropagation()` here.

## 3. Zoom level reset (and later snapped back) when a filter was applied

**Symptom:** Applying a filter always reset the view to 100% zoom. The *next* zoom/pan action would then jump back to whatever zoom level was active before the filter — a visible "snap."

**Root cause:** The graph-building `useEffect` re-runs in full on every filter change (`svg.selectAll("*").remove()`, new `root <g>`, new `d3.zoom()` behavior). D3 stores its live transform on the `<svg>` DOM node itself (`__zoom`), separately from the `root <g>`'s `transform` attribute. The node-level state survives the rebuild; the `<g>`'s visual transform and the freshly-constructed zoom behavior don't know about it — so the view visually resets to identity while D3 privately still remembers the old transform, and the next interaction computes from that stale value.

**Fix:** Track the live transform in a `ref` (updated on every `"zoom"` event), and explicitly re-apply it to the new zoom behavior right after rebuild:

```tsx
const currentTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
```

```tsx
svg.call(zoomBehavior.transform, currentTransformRef.current);
```

**Ordering gotcha hit during implementation:** this call fires the `"zoom"` handler *synchronously*, which references `labelSelection` (to toggle label visibility by zoom level). `labelSelection` isn't defined until later in the effect — placing the re-sync call right after `zoomBehavior` is constructed threw `Cannot access 'labelSelection' before initialization`. Fixed by moving the re-sync call to immediately after `labelSelection` is defined, instead of immediately after `zoomBehavior`. Worth remembering for any future D3 setup code in this file: **anything that can synchronously fire the zoom handler must come after everything that handler touches.**

## Follow-ups / not done

- `onCanvasContextMenu` is unwired — no consumer yet. Revisit once the canvas-level action is actually specified (see project summary, deferred items).
- Filter changes now preserve zoom/pan, but node *positions* still fully re-simulate on filter change (documented, pre-existing tradeoff, out of scope for this pass).

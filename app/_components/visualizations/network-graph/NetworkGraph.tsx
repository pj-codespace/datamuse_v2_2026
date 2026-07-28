"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as d3 from "d3";
import { useContainerSize } from "./useContainerSize";
import type { NetworkDataset, NetworkNode, NetworkLink } from "@/app/_lib/data/types";
import {
  createDefaultFilterState,
  isLinkVisible,
  isNodeVisible,
  type FilterState,
} from "@/app/_lib/filters/types";

export interface NetworkGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  /** Clears the persistent selection ring around a double-clicked node
   *  (e.g. call this when the Edit Actor panel is closed). */
  clearSelection: () => void;
  /** Selects a node by id, showing the same persistent ring double-click
   *  produces — lets an external control (e.g. a context menu) trigger
   *  the same selection without simulating a double-click. */
  selectNode: (nodeId: number) => void;
}

interface NetworkGraphProps {
  data: NetworkDataset;
  /** Floor for the SVG height, in case the container has no intrinsic height yet. */
  minHeight?: number;
  /** Called whenever the D3 zoom transform changes, with the current scale
   *  as a plain number (1 = 100%). Lets an external zoom HUD display and
   *  stay in sync with the real zoom level, rather than tracking its own
   *  separate (and potentially out-of-sync) copy. */
  onZoomChange?: (scale: number) => void;
  /** Fired on double-clicking a node — e.g. to open an "Edit Actor" panel
   *  for that specific actor. The panel itself isn't built yet; this is
   *  just the trigger and the node data it needs. */
  onNodeDoubleClick?: (node: NetworkNode) => void;
  /** Fired on right-clicking a node, with the raw viewport coordinates
   *  the browser's native context menu would have appeared at — lets
   *  the parent render its own menu there instead. The native menu is
   *  already suppressed for nodes; this is the replacement. */
  onNodeContextMenu?: (node: NetworkNode, clientX: number, clientY: number) => void;
  /** Fired on right-clicking empty canvas (not a node), with the raw
   *  viewport coordinates the browser's native context menu would have
   *  appeared at. Reserved for a future canvas-level action (not yet
   *  defined) — currently unused if omitted, in which case the native
   *  menu is still suppressed but nothing else happens. */
  onCanvasContextMenu?: (clientX: number, clientY: number) => void;
  /** Which nodes/links are currently visible. Defaults to "everything
   *  visible" if omitted. Filtered-out nodes are excluded from the
   *  simulation entirely (not just hidden), so the visible ones reflow
   *  into the freed space — that's the whole point of filtering a dense
   *  graph. This means changing filters currently rebuilds the layout
   *  from scratch, same as a resize does; once manually-arranged
   *  positions are persisted (Views), this will need revisiting so
   *  filtering doesn't undo someone's arrangement. */
  filters?: FilterState;
}

// D3's simulation mutates node/link objects in place at runtime (adding
// x/y/vx/vy to nodes, and swapping link source/target from ids to full
// node references). These local types describe that augmented shape
// without polluting the NetworkNode/NetworkLink types used elsewhere.
type SimNode = NetworkNode & d3.SimulationNodeDatum & { labelYOffset?: number };
type SimLink = d3.SimulationLinkDatum<SimNode> & {
  type: string;
  strength: number;
  // Assigned once per load: how far this link's curve bows away from a
  // straight line, relative to its siblings between the same two nodes.
  // 0 = only link between this pair (drawn nearly straight).
  // Non-zero, alternating values = one of several parallel links, fanned
  // out so none of them overlap.
  curveOffset: number;
};

const CURVE_SPACING = 0.22; // how sharply parallel links fan apart, as a fraction of their length
const ARROW_MARKER_SIZE = 8;
const LABEL_VISIBLE_ZOOM_THRESHOLD = 1; // labels show at 100% zoom (scale 1) or more
const LABEL_FONT_SIZE = 10;
const LABEL_CHAR_WIDTH = LABEL_FONT_SIZE * 0.6; // rough average glyph width; avoids measuring the real DOM box
const LABEL_LINE_HEIGHT = LABEL_FONT_SIZE * 1.4;
const LABEL_DECLUTTER_PASSES = 4;
const LABEL_GRID_CELL = 140; // roughly the widest label we expect; keeps neighbor lookups cheap
// TEMPORARY toggle while deciding whether cumulative nudging reads well —
// flip to false to fall back to every label sitting at its flat base
// offset, no decluttering at all.
const ENABLE_LABEL_DECLUTTER = false;
const HIGHLIGHT_STROKE_COLOR = "#000000"; // border color for the mousedown-selected node + its neighbors
const DIMMED_OPACITY = 0.08; // near-invisible, per the brief, for everything NOT in the highlighted set
const SELECTION_RING_COLOR = "#2563eb"; // persistent ring around a double-clicked (selected) node
const SELECTION_RING_EXTRA_RADIUS = 4; // how much larger than the node itself the ring sits

function nodeRadius(d: NetworkNode) {
  return 4 + d.influence * 1.5;
}

/** Base vertical offset for a node's label (before any declutter nudge),
 *  shared between initial placement and the declutter pass so they never
 *  drift out of sync. */
function labelBaseDy(d: NetworkNode) {
  return nodeRadius(d) + 12;
}

/** Maps each node id to the set of node ids it shares a link with (in
 *  either direction). Built once per data load, not recomputed on every
 *  hover — hovering needs to feel instant even on the denser datasets. */
function buildNeighborMap(links: SimLink[]): Map<number, Set<number>> {
  const neighbors = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number) => {
    const set = neighbors.get(a);
    if (set) set.add(b);
    else neighbors.set(a, new Set([b]));
  };
  for (const link of links) {
    const rawSource = typeof link.source === "object" ? link.source.id : link.source;
    const rawTarget = typeof link.target === "object" ? link.target.id : link.target;
    
    // Explicitly coerce to number to satisfy TypeScript
    const sourceId = Number(rawSource);
    const targetId = Number(rawTarget);

    addEdge(sourceId, targetId);
    addEdge(targetId, sourceId);
  }
  return neighbors;
}

/** Groups links by the unordered pair of node ids they connect, so links
 *  between the same two actors (in either direction) fan out together
 *  rather than each being grouped only with same-direction duplicates.
 *  A link with no siblings gets curveOffset 0 — it's rendered as a plain
 *  straight segment (see curvedLinkPath), which is both the simplest
 *  visual and the cheapest to compute per tick. */
function assignCurveOffsets(links: SimLink[]) {
  const groups = new Map<string, SimLink[]>();
  for (const link of links) {
    const sourceId = typeof link.source === "object" ? link.source.id : link.source;
    const targetId = typeof link.target === "object" ? link.target.id : link.target;
    const key = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
    const group = groups.get(key) ?? [];
    group.push(link);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const n = group.length;
    group.forEach((link, i) => {
      link.curveOffset = n === 1 ? 0 : i - (n - 1) / 2;
    });
  }
}

/** Approximates a label's on-screen bounding box from its node's current
 *  position and its text length — no DOM measurement (getBBox), which
 *  would force a layout reflow for every one of potentially thousands
 *  of labels. Good enough for collision detection, not pixel-perfect. */
function labelBox(node: SimNode) {
  const halfWidth = (node.name.length * LABEL_CHAR_WIDTH) / 2;
  const centerY = (node.y ?? 0) + labelBaseDy(node) + (node.labelYOffset ?? 0);
  return {
    left: (node.x ?? 0) - halfWidth,
    right: (node.x ?? 0) + halfWidth,
    top: centerY - LABEL_LINE_HEIGHT / 2,
    bottom: centerY + LABEL_LINE_HEIGHT / 2,
  };
}

function boxesOverlap(a: ReturnType<typeof labelBox>, b: ReturnType<typeof labelBox>) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Nudges overlapping labels further from their node (straight down, in
 *  line-height steps) until they stop colliding.
 *
 *  Runs ONLY when the simulation has cooled down (see the "end" event
 *  below) — never on every tick, since a full collision pass at hundreds
 *  or thousands of labels would be too costly to repeat continuously.
 *  Uses a coarse spatial grid so each label is only compared against
 *  labels that are actually near it, rather than every other label. */
function declutterLabels(nodes: SimNode[]) {
  for (const node of nodes) {
    node.labelYOffset = 0;
  }

  for (let pass = 0; pass < LABEL_DECLUTTER_PASSES; pass++) {
    const grid = new Map<string, SimNode[]>();
    for (const node of nodes) {
      const cellX = Math.floor((node.x ?? 0) / LABEL_GRID_CELL);
      const cellY = Math.floor((node.y ?? 0) / LABEL_GRID_CELL);
      const key = `${cellX},${cellY}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(node);
      else grid.set(key, [node]);
    }

    let anyOverlap = false;
    for (const node of nodes) {
      const cellX = Math.floor((node.x ?? 0) / LABEL_GRID_CELL);
      const cellY = Math.floor((node.y ?? 0) / LABEL_GRID_CELL);
      const boxA = labelBox(node);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const neighbors = grid.get(`${cellX + dx},${cellY + dy}`);
          if (!neighbors) continue;
          for (const other of neighbors) {
            if (other === node || !boxesOverlap(boxA, labelBox(other))) continue;
            anyOverlap = true;
            // Only the higher-id member of a colliding pair moves, so
            // both sides of a pair don't push against each other at
            // once — that would just oscillate across passes instead
            // of converging.
            if (node.id > other.id) {
              node.labelYOffset = (node.labelYOffset ?? 0) + LABEL_LINE_HEIGHT;
            }
          }
        }
      }
    }

    if (!anyOverlap) break;
  }
}

/** Builds an SVG path `d` string between two node centers, with both
 *  endpoints trimmed back to sit exactly on each node's circle edge (not
 *  its center) so arrowheads land cleanly on the boundary.
 *
 *  Performance note: this runs on every simulation tick, for every link
 *  (thousands, potentially). Links with no sibling between the same pair
 *  (the common case) take a cheap straight-line path using a single
 *  sqrt. Only links that actually need to fan apart from a duplicate
 *  pay for the extra curve/tangent math. */
function curvedLinkPath(d: SimLink): string {
  const source = d.source as SimNode;
  const target = d.target as SimNode;
  const sx = source.x ?? 0;
  const sy = source.y ?? 0;
  const tx = target.x ?? 0;
  const ty = target.y ?? 0;

  const dx = tx - sx;
  const dy = ty - sy;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;

  if (d.curveOffset === 0) {
    // Cheap path: trim both ends along the direct source->target
    // direction we already have, no extra sqrt calls needed.
    const startR = nodeRadius(source);
    const endR = nodeRadius(target);
    const startX = sx + ux * startR;
    const startY = sy + uy * startR;
    const endX = tx - ux * endR;
    const endY = ty - uy * endR;
    return `M${startX},${startY} L${endX},${endY}`;
  }

  // Perpendicular for the bow direction, computed from a CANONICAL
  // reference (lower id -> higher id) rather than this link's own
  // source->target direction. This matters specifically for reciprocal
  // pairs (A->B and B->A): each link's own direction is exactly
  // reversed, so using it directly would flip both the perpendicular
  // AND effectively cancel out against the offset sign, causing both
  // links to compute the same bow point and collapse onto a single
  // visual curve — exactly the "looks like one bidirectional arrow"
  // effect we need to avoid, since each direction needs to stay a
  // distinct, independently-styleable link.
  const forward = source.id < target.id;
  const canonicalDx = forward ? dx : -dx;
  const canonicalDy = forward ? dy : -dy;
  const nx = -canonicalDy / distance;
  const ny = canonicalDx / distance;
  const offset = d.curveOffset * distance * CURVE_SPACING;

  const midX = (sx + tx) / 2 + nx * offset;
  const midY = (sy + ty) / 2 + ny * offset;

  // Trim each endpoint back along the curve's own tangent direction at
  // that end, by that node's radius, so the path stops at the circle's
  // edge rather than its center.
  const startTangentX = midX - sx;
  const startTangentY = midY - sy;
  const startTangentLen = Math.sqrt(startTangentX ** 2 + startTangentY ** 2) || 1;
  const startR = nodeRadius(source);
  const startX = sx + (startTangentX / startTangentLen) * startR;
  const startY = sy + (startTangentY / startTangentLen) * startR;

  const endTangentX = tx - midX;
  const endTangentY = ty - midY;
  const endTangentLen = Math.sqrt(endTangentX ** 2 + endTangentY ** 2) || 1;
  const endR = nodeRadius(target);
  const endX = tx - (endTangentX / endTangentLen) * endR;
  const endY = ty - (endTangentY / endTangentLen) * endR;

  return `M${startX},${startY} Q${midX},${midY} ${endX},${endY}`;
}

const NetworkGraph = forwardRef<NetworkGraphHandle, NetworkGraphProps>(function NetworkGraph(
  { data, minHeight = 500, onZoomChange, onNodeDoubleClick, onNodeContextMenu, onCanvasContextMenu, filters },
  ref
) {
  const { ref: containerRef, size } = useContainerSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Persists across effect re-runs so the imperative handle below can
  // always reach the current zoom behavior, even after a resize causes
  // the effect (and everything it creates) to run again.
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  // Tracks the live zoom/pan transform across effect re-runs (e.g. a
  // filter change). D3 stores its own transform state on the svg DOM
  // node itself, separate from this — but that node's stored state
  // survives a rebuild while our fresh root <g> and fresh zoom behavior
  // don't know about it, causing a visual/internal mismatch. Keeping our
  // own copy here lets us explicitly re-sync both after a rebuild.
  const currentTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  // Same pattern, for the current effect run's "clear the selection ring"
  // function — set inside the effect below.
  const clearSelectionRef = useRef<(() => void) | null>(null);
  const selectNodeRef = useRef<((nodeId: number) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (!svgRef.current || !zoomBehaviorRef.current) return;
      d3.select(svgRef.current)
        .transition()
        .duration(200)
        .call(zoomBehaviorRef.current.scaleBy, 1.3);
    },
    zoomOut: () => {
      if (!svgRef.current || !zoomBehaviorRef.current) return;
      d3.select(svgRef.current)
        .transition()
        .duration(200)
        .call(zoomBehaviorRef.current.scaleBy, 1 / 1.3);
    },
    resetZoom: () => {
      if (!svgRef.current || !zoomBehaviorRef.current) return;
      d3.select(svgRef.current)
        .transition()
        .duration(200)
        .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
    },
    clearSelection: () => {
      clearSelectionRef.current?.();
    },
    selectNode: (nodeId: number) => {
      selectNodeRef.current?.(nodeId);
    },
  }));

  // Fallback dimensions for the very first render, before ResizeObserver
  // has reported anything. Prevents a zero-sized viewBox.
  const width = size.width || 800;
  const height = Math.max(size.height, minHeight) || minHeight;

  // D3 owns everything inside the root <g> imperatively. React renders the
  // <svg> shell once; it never re-renders the circles/lines inside it.
  // That matters at this node/link count — routing every simulation tick
  // through React's render cycle would be noticeably slower.
  useEffect(() => {
    if (!svgRef.current || width === 0 || height === 0) return;

    // Work on copies so re-running this effect (new data, or a resize
    // once we react to width/height) doesn't reuse mutated state from a
    // previous run.
    const activeFilters = filters ?? createDefaultFilterState(data.project);
    const visibleSourceNodes = data.nodes.filter((n) => isNodeVisible(n, activeFilters));
    const visibleNodeIds = new Set(visibleSourceNodes.map((n) => n.id));
    const visibleSourceLinks = data.links.filter((l) =>
      isLinkVisible(l, activeFilters, visibleNodeIds)
    );

    const nodes: SimNode[] = visibleSourceNodes.map((n) => ({ ...n }));
    const links: SimLink[] = visibleSourceLinks.map((l) => ({ ...l, curveOffset: 0 }));
    assignCurveOffsets(links);

    const categoryColor = new Map(
      data.project.settings.categories.map((c) => [c.id, c.color])
    );
    const linkTypesById = new Map(
      data.project.settings.linkTypes.map((t) => [t.id, t])
    );

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // clean slate each time the effect (re)runs

    // Arrowhead markers, one per link type, colored to match that link
    // type's legend color. Only directed link types actually get used
    // (see marker-end below), but defining all of them here is cheap.
    const defs = svg.append("defs");
    for (const linkType of data.project.settings.linkTypes) {
      defs
        .append("marker")
        .attr("id", `arrow-${linkType.id}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 9)
        .attr("markerWidth", ARROW_MARKER_SIZE)
        .attr("markerHeight", ARROW_MARKER_SIZE)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", linkType.color);
    }

    const root = svg.append("g").attr("class", "network-root");

    // Zoom/pan transforms the root <g>, not the SVG's viewBox — keeps
    // D3's zoom math and our responsive-sizing logic independent of
    // each other.
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        currentTransformRef.current = event.transform;
        root.attr("transform", event.transform.toString());
        onZoomChange?.(event.transform.k);
        labelSelection.attr(
          "display",
          event.transform.k >= LABEL_VISIBLE_ZOOM_THRESHOLD ? null : "none"
        );
      });
    zoomBehaviorRef.current = zoomBehavior;
    svg.call(zoomBehavior);
    // D3's zoom behavior listens for double-click by default and zooms
    // in — that fires even when double-clicking a node (the event
    // bubbles up to the svg), fighting with our own node dblclick
    // handler below. Disabling it here also leaves canvas dblclick free
    // for a different action later.
    svg.on("dblclick.zoom", null);

    // Suppress the native browser context menu on empty canvas too — the
    // node-level contextmenu handler already does this for nodes. The
    // actual action is undefined for now; onCanvasContextMenu is an
    // optional hook a parent can supply once that's decided. Left
    // unwired for the moment (no parent passes it yet) — this is just
    // the suppression + the plumbing for later.
    svg.on("contextmenu", (event) => {
      event.preventDefault();
      onCanvasContextMenu?.(event.clientX, event.clientY);
    });

    const linkSelection = root
      .append("g")
      .attr("class", "links")
      .attr("fill", "none")
      .attr("stroke-opacity", 0.6)
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("stroke", (d) => linkTypesById.get(d.type)?.color ?? "#999")
      .attr("stroke-width", (d) => (d.strength === 2 ? 1.5 : 1))
      .attr("stroke-dasharray", (d) => (d.strength === 0 ? "3,3" : null))
      .attr("marker-end", (d) =>
        linkTypesById.get(d.type)?.direction === "directed"
          ? `url(#arrow-${d.type})`
          : null
      );

    const dragBehavior = d3
      .drag<any, SimNode>() // <--- Change SVGCircleElement to any (or Element)
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        highlightNode(d.id);
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        clearHighlight();
      });

    const nodeSelection = root
      .append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => nodeRadius(d))
      .attr("fill", (d) => categoryColor.get(d.category) ?? "#999")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .style("cursor", "grab")
      .call(dragBehavior)
      .on("dblclick", (event, d) => {
        setSelectedNode(d);
        onNodeDoubleClick?.(d);
      })
      .on("contextmenu", (event, d) => {
        // Suppress the browser's native right-click menu on nodes and
        // hand off to our own (position comes from the raw mouse event,
        // not d3's, since d3's touch/mouse-normalized event doesn't
        // carry clientX/clientY the same way).
        event.preventDefault();
        onNodeContextMenu?.(d, event.clientX, event.clientY);
      });

    // Native browser tooltip for now — swap for a richer tooltip component later.
    const categoryLabel = new Map(
      data.project.settings.categories.map((c) => [c.id, c.label])
    );
    nodeSelection.append("title").text((d) =>
      [
        d.name,
        `Category: ${categoryLabel.get(d.category) ?? d.category}`,
        `Influence: ${d.influence}`,
        `Interest: ${d.interest}`,
      ].join("\n")
    );

    const labelSelection = root
      .append("g")
      .attr("class", "labels")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d) => d.name)
      .attr("font-size", 10)
      .attr("fill", "#374151")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke") // draws the white stroke BEHIND the fill, so it reads as an outline rather than covering the text
      .style("stroke-linejoin", "round")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => labelBaseDy(d)) // sits below the node, scaled by its radius
      .style("pointer-events", "none") // never intercept drag/click meant for the node underneath
      // Matches the initial zoom transform (scale 1, i.e. 100%) before any
      // zoom event has fired — kept in sync with the same threshold used
      // in the zoom handler below.
      .attr("display", 1 >= LABEL_VISIBLE_ZOOM_THRESHOLD ? null : "none");

    // Re-sync both D3's internal transform state (stored on the svg DOM
    // node, which survives selectAll("*").remove() above) and the new
    // root <g>'s visual transform (which resets to identity on every
    // rebuild) to whatever zoom/pan was active before this effect re-ran
    // — e.g. from a filter change. Without this, the <g> resets to 100%
    // visually while D3 privately still thinks it's at the old
    // transform, so the *next* zoom/pan jumps back to that stale value
    // instead of continuing from what's on screen. Skipped on the very
    // first run, when currentTransformRef is still the identity default,
    // so it's a no-op then. Deliberately placed here (after
    // labelSelection exists) rather than right after zoomBehavior is
    // created — the "zoom" handler above touches labelSelection, and
    // this call fires that handler synchronously, so it must run after
    // labelSelection is actually defined or it throws a
    // before-initialization error.
    svg.call(zoomBehavior.transform, currentTransformRef.current);

    // A single ring, not one per node — only one node can be selected at
    // a time. Positioned around whichever node is currently selected,
    // updated on tick. Kept as its own element (not reusing nodeSelection's
    // stroke/opacity) so the hover-highlight system above can freely
    // reset every node's stroke without ever touching this.
    const selectionRing = root
      .append("circle")
      .attr("class", "selection-ring")
      .attr("fill", "none")
      .attr("stroke", SELECTION_RING_COLOR)
      .attr("stroke-width", 2)
      .style("pointer-events", "none")
      .attr("display", "none");

    let selectedNode: SimNode | null = null;

    function setSelectedNode(node: SimNode | null) {
      selectedNode = node;
      if (node) {
        selectionRing
          .attr("r", nodeRadius(node) + SELECTION_RING_EXTRA_RADIUS)
          .attr("cx", node.x ?? 0)
          .attr("cy", node.y ?? 0)
          .attr("display", null);
      } else {
        selectionRing.attr("display", "none");
      }
    }

    clearSelectionRef.current = () => setSelectedNode(null);
    selectNodeRef.current = (nodeId: number) => {
      const target = nodes.find((n) => n.id === nodeId);
      if (target) setSelectedNode(target);
    };

    const neighborMap = buildNeighborMap(links);

    /** Highlights a node and its first-order neighbors at full opacity
     *  with a distinct border color; dims everything else near-invisible.
     *  Triggered by mousedown (via drag's "start" event, which fires
     *  immediately on mousedown regardless of whether movement follows)
     *  and cleared on mouseup ("end") — active for the full press-to-
     *  release duration, not just a hover. Only links directly touching
     *  the selected node are kept visible — links between two neighbors
     *  that don't involve the selected node itself stay dimmed, since
     *  those aren't "first-order" from here. */
    function highlightNode(nodeId: number) {
      const neighborIds = neighborMap.get(nodeId) ?? new Set<number>();
      const highlightedIds = new Set<number>([nodeId, ...neighborIds]);

      nodeSelection
        .attr("opacity", (d) => (highlightedIds.has(d.id) ? 1 : DIMMED_OPACITY))
        .attr("stroke", (d) => (highlightedIds.has(d.id) ? HIGHLIGHT_STROKE_COLOR : "#fff"))
        .attr("stroke-width", (d) => (highlightedIds.has(d.id) ? 2 : 1));

      linkSelection.attr("opacity", (d) => {
        const sourceId = (d.source as SimNode).id;
        const targetId = (d.target as SimNode).id;
        return sourceId === nodeId || targetId === nodeId ? 1 : DIMMED_OPACITY;
      });

      labelSelection.attr("opacity", (d) => (highlightedIds.has(d.id) ? 1 : DIMMED_OPACITY));
    }

    function clearHighlight() {
      nodeSelection.attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 1);
      linkSelection.attr("opacity", 1);
      labelSelection.attr("opacity", 1);
    }

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(90) // was 60 — more spread between connected nodes
      )
      .force(
        "charge",
        d3
          .forceManyBody()
          .strength(-120)
          // Caps how far the repulsion effect reaches. Without this, a
          // node with few/no links can get pushed arbitrarily far by
          // cumulative repulsion from the whole graph, with nothing to
          // pull it back — this bounds that "flung to the horizon"
          // effect on its own, on top of the forceX/forceY below.
          .distanceMax(Math.max(width, height))
      )
      .force("center", d3.forceCenter(width / 2, height / 2))
      // A separate, gentle pull toward the center for EVERY node
      // individually — forceCenter above only keeps the graph's average
      // position fixed, it doesn't pull any single node inward. Without
      // this, isolated or low-degree nodes (nothing else holding them
      // in) can drift off the visible canvas entirely, since only
      // repulsion is acting on them.
      .force("gravityX", d3.forceX(width / 2).strength(0.03))
      .force("gravityY", d3.forceY(height / 2).strength(0.03))
      .force(
        "collide",
        d3.forceCollide<SimNode>((d) => 2 + nodeRadius(d))
      )
      .on("tick", () => {
        linkSelection.attr("d", (d) => curvedLinkPath(d));

        nodeSelection.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
        labelSelection.attr("x", (d) => d.x ?? 0).attr("y", (d) => d.y ?? 0);
        if (selectedNode) {
          selectionRing.attr("cx", selectedNode.x ?? 0).attr("cy", selectedNode.y ?? 0);
        }
      })
      // Fires once, automatically, when D3 considers the layout settled
      // (alpha decays below alphaMin) — including again after a drag
      // reheats and re-cools the simulation. This is the "cooled down"
      // moment we run the (comparatively expensive) declutter pass at,
      // rather than on every tick.
      .on("end", () => {
        if (ENABLE_LABEL_DECLUTTER) {
          declutterLabels(nodes);
        }
        labelSelection.attr("dy", (d) => labelBaseDy(d) + (d.labelYOffset ?? 0));
      });

    return () => {
      simulation.stop();
    };
  }, [data, width, height, filters]);

  return (
    <div ref={containerRef} className="relative h-full min-h-[500px] w-full">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      />
    </div>
  );
});

NetworkGraph.displayName = "NetworkGraph";

export default NetworkGraph;

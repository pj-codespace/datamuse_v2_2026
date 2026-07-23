"use client";

import { useCallback, useRef, useState } from "react";
import TopBar from "./TopBar";
import ToolDock from "./ToolDock";
import ToolSidePanel from "./ToolSidePanel";
import ZoomControlPanel from "./ZoomControlPanel";
import LegendPanel from "./LegendPanel";
import SavePanel from "./SavePanel";
import NodeContextMenu from "./NodeContextMenu";
import { TOOLS } from "./tools";
import NetworkGraph, {
  type NetworkGraphHandle,
} from "@/app/_components/visualizations/network-graph/NetworkGraph";
import type { NetworkDataset, NetworkNode } from "@/app/_lib/data/types";
import { createDefaultFilterState, type FilterState } from "@/app/_lib/filters/types";

// Flip to false if you ever need to isolate the surrounding layout from
// the graph again (e.g. debugging a layout-only issue).
const RENDER_GRAPH = true;

interface NetworkWorkspaceProps {
  data: NetworkDataset;
}

export default function NetworkWorkspace({ data }: NetworkWorkspaceProps) {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [selectedActorName, setSelectedActorName] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(() =>
    createDefaultFilterState(data.project)
  );
  const [contextMenu, setContextMenu] = useState<{
    node: NetworkNode;
    x: number;
    y: number;
  } | null>(null);
  const graphRef = useRef<NetworkGraphHandle>(null);

  // Clicking the currently-open tool again closes its panel; clicking a
  // different tool swaps directly to that one. Only one panel is ever
  // open at a time. Closing the Edit Actor panel this way also clears
  // the graph's selection ring — but selecting a DIFFERENT actor while
  // it's open just moves the ring (handled inside NetworkGraph itself,
  // not here).
  const handleToggleTool = useCallback((toolId: string) => {
    setActiveTool((current) => {
      const next = current === toolId ? null : toolId;
      if (next === null && current === "edit-actor") {
        graphRef.current?.clearSelection();
        setSelectedActorName(null);
      }
      return next;
    });
  }, []);

  const handleCloseTool = useCallback(() => {
    setActiveTool((current) => {
      if (current === "edit-actor") {
        graphRef.current?.clearSelection();
        setSelectedActorName(null);
      }
      return null;
    });
  }, []);

  // Wrapped in useCallback so this function reference stays stable across
  // renders — NetworkGraph's effect doesn't currently list onZoomChange
  // as a dependency, but keeping it stable avoids surprises if that ever
  // changes.
  const handleZoomChange = useCallback((scale: number) => {
    setZoomPercent(scale * 100);
  }, []);

  // Double-clicking a node opens the Edit Actor panel for that node.
  // The panel's actual editing UI doesn't exist yet (per the brief), but
  // this proves the node -> panel wiring works end to end: the panel
  // shows the real double-clicked actor's name, not a placeholder.
  const handleNodeDoubleClick = useCallback((node: { name: string }) => {
    setSelectedActorName(node.name);
    setActiveTool("edit-actor");
  }, []);

  const handleNodeContextMenu = useCallback(
    (node: NetworkNode, x: number, y: number) => setContextMenu({ node, x, y }),
    []
  );
  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);

  // View: just shows the selection ring, same visual as double-click,
  // but doesn't open the side panel — a lighter "look at this one"
  // action distinct from committing to edit it.
  const handleViewFromMenu = useCallback(() => {
    if (!contextMenu) return;
    graphRef.current?.selectNode(contextMenu.node.id);
    setContextMenu(null);
  }, [contextMenu]);

  // Edit: same as double-clicking the node directly.
  const handleEditFromMenu = useCallback(() => {
    if (!contextMenu) return;
    graphRef.current?.selectNode(contextMenu.node.id);
    setSelectedActorName(contextMenu.node.name);
    setActiveTool("edit-actor");
    setContextMenu(null);
  }, [contextMenu]);

  // Delete: intentionally a stub. Actually removing an actor needs the
  // core-dataset mutation layer (add/edit/delete actors & links), which
  // doesn't exist yet — this just closes the menu rather than pretending
  // to delete anything.
  const handleDeleteFromMenu = useCallback(() => {
    if (!contextMenu) return;
    console.warn(`Delete requested for "${contextMenu.node.name}" — not implemented yet.`);
    setContextMenu(null);
  }, [contextMenu]);

  return (
    <div className="flex h-screen w-screen flex-col">
      <TopBar projectName={data.project.name} />

      {/* Everything below the top bar. Floating panels are positioned
          relative to THIS container, not the whole viewport, so they
          never drift under the top bar. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {RENDER_GRAPH ? (
          <NetworkGraph
            ref={graphRef}
            data={data}
            onZoomChange={handleZoomChange}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeContextMenu={handleNodeContextMenu}
            filters={filters}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center border-2 border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
            Graph placeholder — layout check only (RENDER_GRAPH = false)
          </div>
        )}

        <ToolDock tools={TOOLS} activeTool={activeTool} onToggleTool={handleToggleTool} />
        <ToolSidePanel
          tools={TOOLS}
          activeTool={activeTool}
          onClose={handleCloseTool}
          selectedActorName={selectedActorName}
          project={data.project}
          filters={filters}
          onFiltersChange={setFilters}
        />

        <NodeContextMenu
          node={contextMenu?.node ?? null}
          x={contextMenu?.x ?? 0}
          y={contextMenu?.y ?? 0}
          onView={handleViewFromMenu}
          onEdit={handleEditFromMenu}
          onDelete={handleDeleteFromMenu}
          onClose={handleCloseContextMenu}
        />

        <ZoomControlPanel
          zoomPercent={zoomPercent}
          onZoomIn={() => graphRef.current?.zoomIn()}
          onZoomOut={() => graphRef.current?.zoomOut()}
          onReset={() => graphRef.current?.resetZoom()}
        />
        <LegendPanel categories={data.project.settings.categories} />
        <SavePanel />
      </div>
    </div>
  );
}

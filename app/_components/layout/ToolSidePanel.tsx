"use client";

import type { ToolDefinition } from "./tools";
import FilterPanel from "./FilterPanel";
import type { ProjectMeta } from "@/app/_lib/data/types";
import type { FilterState } from "@/app/_lib/filters/types";

interface ToolSidePanelProps {
  tools: ToolDefinition[];
  activeTool: string | null;
  onClose: () => void;
  /** The name of the actor that was double-clicked to open this panel,
   *  if any (currently only set for the "edit-actor" tool). Shown so
   *  it's visible the node -> panel wiring actually works, ahead of the
   *  real editing UI existing. */
  selectedActorName?: string | null;
  /** Needed only for the "filter" tool's real content. */
  project: ProjectMeta;
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
}

export default function ToolSidePanel({
  tools,
  activeTool,
  onClose,
  selectedActorName,
  project,
  filters,
  onFiltersChange,
}: ToolSidePanelProps) {
  const activeToolDef = tools.find((t) => t.id === activeTool) ?? null;
  const isOpen = activeToolDef !== null;

  return (
    <div
      // Always mounted (not conditionally rendered) so the CSS transition
      // actually plays when opening/closing, instead of popping in place.
      className={`absolute right-0 top-0 h-full w-80 overflow-y-auto border-l border-gray-200 bg-white shadow-lg transition-transform duration-200 ease-out ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!isOpen}
    >
      {activeToolDef && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-900">{activeToolDef.label}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700"
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>

          {activeToolDef.id === "filter" ? (
            <FilterPanel project={project} filters={filters} onChange={onFiltersChange} />
          ) : (
            <div className="flex-1 p-4 text-sm text-gray-500">
              {activeToolDef.label} panel — coming soon.
              {selectedActorName && activeToolDef.id === "edit-actor" && (
                <p className="mt-2 text-gray-700">
                  Selected actor: <span className="font-medium">{selectedActorName}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

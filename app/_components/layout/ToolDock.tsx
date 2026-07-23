"use client";

import type { ToolDefinition } from "./tools";

interface ToolDockProps {
  tools: ToolDefinition[];
  activeTool: string | null;
  onToggleTool: (id: string) => void;
}

export default function ToolDock({ tools, activeTool, onToggleTool }: ToolDockProps) {
  return (
    <div className="absolute right-4 top-4 flex flex-col gap-1 rounded-lg border border-gray-200 bg-white/90 p-1 shadow-md backdrop-blur">
      {tools.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            title={tool.label}
            aria-pressed={isActive}
            onClick={() => onToggleTool(tool.id)}
            className={`flex h-10 w-10 items-center justify-center rounded-md text-xs font-semibold transition-colors ${
              isActive
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tool.shortLabel}
          </button>
        );
      })}
    </div>
  );
}

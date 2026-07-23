"use client";

import type { Category } from "@/app/_lib/data/types";

interface LegendPanelProps {
  categories: Category[];
}

export default function LegendPanel({ categories }: LegendPanelProps) {
  return (
    <div className="absolute bottom-4 left-4 w-56 rounded-lg border border-gray-200 bg-white/90 p-3 shadow-md backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Legend
        </h3>
        {/* Placeholders — wire these up once category visibility toggling exists. */}
        <div className="flex gap-2">
          <button type="button" className="text-xs text-gray-400 hover:text-gray-700">
            Show all
          </button>
          <button type="button" className="text-xs text-gray-400 hover:text-gray-700">
            Hide all
          </button>
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-2 text-xs text-gray-700">
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            {category.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

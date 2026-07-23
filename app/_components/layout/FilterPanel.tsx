"use client";

import type { ReactNode } from "react";
import type { ProjectMeta } from "@/app/_lib/data/types";
import type { FilterState } from "@/app/_lib/filters/types";

interface FilterPanelProps {
  project: ProjectMeta;
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

export default function FilterPanel({ project, filters, onChange }: FilterPanelProps) {
  const { categories, linkTypes, influenceLevels, interestLevels, highestInfluenceValue } =
    project.settings;

  const interestValues = interestLevels.map((l) => l.value);
  const interestMin = Math.min(...interestValues);
  const interestMax = Math.max(...interestValues);

  function toggleInSet(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  return (
    <div className="flex flex-col gap-6 p-4 text-sm">
      <FilterSection
        title="Category"
        onSelectAll={() =>
          onChange({ ...filters, categories: new Set(categories.map((c) => c.id)) })
        }
        onClearAll={() => onChange({ ...filters, categories: new Set() })}
      >
        {categories.map((category) => (
          <label key={category.id} className="flex items-center gap-2 py-0.5">
            <input
              type="checkbox"
              checked={filters.categories.has(category.id)}
              onChange={() =>
                onChange({ ...filters, categories: toggleInSet(filters.categories, category.id) })
              }
            />
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            <span className="text-gray-700">{category.label}</span>
          </label>
        ))}
      </FilterSection>

      <FilterSection
        title="Link type"
        onSelectAll={() =>
          onChange({ ...filters, linkTypes: new Set(linkTypes.map((t) => t.id)) })
        }
        onClearAll={() => onChange({ ...filters, linkTypes: new Set() })}
      >
        {linkTypes.map((linkType) => (
          <label key={linkType.id} className="flex items-center gap-2 py-0.5">
            <input
              type="checkbox"
              checked={filters.linkTypes.has(linkType.id)}
              onChange={() =>
                onChange({ ...filters, linkTypes: toggleInSet(filters.linkTypes, linkType.id) })
              }
            />
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: linkType.color }}
            />
            <span className="text-gray-700">{linkType.label}</span>
          </label>
        ))}
      </FilterSection>

      <RangeFilterSection
        title="Influence"
        min={0}
        max={highestInfluenceValue}
        value={filters.influenceRange}
        levelLabel={(v) => influenceLevels.find((l) => l.value === v)?.label}
        onChange={(range) => onChange({ ...filters, influenceRange: range })}
      />

      <RangeFilterSection
        title="Interest"
        min={interestMin}
        max={interestMax}
        value={filters.interestRange}
        levelLabel={(v) => interestLevels.find((l) => l.value === v)?.label}
        onChange={(range) => onChange({ ...filters, interestRange: range })}
      />
    </div>
  );
}

function FilterSection({
  title,
  onSelectAll,
  onClearAll,
  children,
}: {
  title: string;
  onSelectAll: () => void;
  onClearAll: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
        <div className="flex gap-2">
          <button type="button" onClick={onSelectAll} className="text-xs text-gray-400 hover:text-gray-700">
            All
          </button>
          <button type="button" onClick={onClearAll} className="text-xs text-gray-400 hover:text-gray-700">
            None
          </button>
        </div>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function RangeFilterSection({
  title,
  min,
  max,
  value,
  levelLabel,
  onChange,
}: {
  title: string;
  min: number;
  max: number;
  value: [number, number];
  levelLabel: (v: number) => string | undefined;
  onChange: (range: [number, number]) => void;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={value[1]}
          value={value[0]}
          onChange={(e) => onChange([Number(e.target.value), value[1]])}
          className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <span className="text-gray-400">to</span>
        <input
          type="number"
          min={value[0]}
          max={max}
          value={value[1]}
          onChange={(e) => onChange([value[0], Number(e.target.value)])}
          className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      <p className="mt-1 text-xs text-gray-400">
        {levelLabel(value[0]) ?? value[0]} – {levelLabel(value[1]) ?? value[1]}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ProjectMeta } from "@/app/_lib/data/types";
import type { FilterState } from "@/app/_lib/filters/types";
import type { NamedFilter } from "@/app/_lib/views-filters/types";
import {
  criteriaToFilterState,
  filterStateToCriteria,
  listNamedFilters,
  createNamedFilter,
  updateNamedFilterCriteria,
  deleteNamedFilter,
  resolveNamedFilter,
} from "@/app/_lib/views-filters/client";

interface FilterPanelProps {
  project: ProjectMeta;
  // Route-param project id (e.g. "off-grid-analysis") — threaded down
  // explicitly from the page, NOT derived from `project`, since
  // NetworkDataset/ProjectMeta never actually carry this string themselves.
  projectId: string;
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

export default function FilterPanel({ project, projectId, filters, onChange }: FilterPanelProps) {
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
      <SavedFiltersSection projectId={projectId} filters={filters} onChange={onChange} />

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

// ── Saved Filters (new) ──────────────────────────────────────────────────

function SavedFiltersSection({
  projectId,
  filters,
  onChange,
}: {
  projectId: string;
  filters: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const [savedFilters, setSavedFilters] = useState<NamedFilter[]>([]);
  const [loadedFilterId, setLoadedFilterId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setSavedFilters(await listNamedFilters(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved filters");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleLoad(namedFilterId: string) {
    if (!namedFilterId) {
      setLoadedFilterId(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const criteria = await resolveNamedFilter(namedFilterId);
      if (!criteria) throw new Error("That filter no longer resolves to a value");
      onChange(criteriaToFilterState(criteria));
      setLoadedFilterId(namedFilterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load filter");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAsNew() {
    if (!newLabel.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createNamedFilter(
        projectId,
        newLabel.trim(),
        filterStateToCriteria(filters),
        newDescription.trim() || undefined
      );
      setNewLabel("");
      setNewDescription("");
      setLoadedFilterId(created.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save filter");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate() {
    if (!loadedFilterId) return;
    setBusy(true);
    setError(null);
    try {
      await updateNamedFilterCriteria(loadedFilterId, filterStateToCriteria(filters));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update filter");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!loadedFilterId) return;
    setBusy(true);
    setError(null);
    try {
      await deleteNamedFilter(loadedFilterId);
      setLoadedFilterId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete filter");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-gray-200 pb-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Saved Filters
      </h3>

      <select
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-700"
        value={loadedFilterId ?? ""}
        disabled={busy}
        onChange={(e) => handleLoad(e.target.value)}
      >
        <option value="">— Select a saved filter —</option>
        {savedFilters.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>

      {loadedFilterId && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleUpdate}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Update saved filter
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New filter name"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            disabled={busy || !newLabel.trim()}
            onClick={handleSaveAsNew}
            className="flex-shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Save as new
          </button>
        </div>
        <input
          type="text"
          placeholder="Description (optional)"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
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

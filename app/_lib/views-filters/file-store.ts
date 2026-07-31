// app/_lib/views-filters/file-store.ts
//
// Throwaway file-based adapter, satisfying the FilterStore / ViewStore
// contracts defined in ./types.ts. This is a cheap validation layer only —
// it is expected to be discarded once the Postgres adapter lands. Nothing
// outside this file should ever import fs/path directly for this domain.
//
// Layout on disk (outside public/ — mutable app data, not static assets):
//   data/projects/{projectId}/filters.json   → { filters: NamedFilter[], values: FilterValue[] }
//   data/datasets/{datasetId}/views.json     → { views: View[] }

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  FilterCriteria,
  FilterRef,
  FilterStore,
  FilterValue,
  LayoutEntry,
  NamedFilter,
  View,
  ViewStore,
} from "./types";

// Overridable so contract tests (and any other caller) can point this at an
// isolated temp directory instead of the real project's data/ folder.
const DATA_ROOT = process.env.VIEWS_FILTERS_DATA_ROOT ?? path.join(process.cwd(), "data");

// ── Generic atomic read/write helpers ───────────────────────────────────────

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readJSON<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

// Write to a temp file in the same directory, then rename over the target.
// rename() is atomic on the same filesystem, so a crash mid-write can never
// leave the real file half-written.
async function writeJSONAtomic<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(filePath);
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

function nowISO(): string {
  return new Date().toISOString();
}

// ── Filters ──────────────────────────────────────────────────────────────

interface FilterFileShape {
  filters: NamedFilter[];
  values: FilterValue[];
}

function filtersPath(projectId: string): string {
  return path.join(DATA_ROOT, "projects", projectId, "filters.json");
}

// projectId lookup is needed for get/updateCriteria/etc. since those take
// only a namedFilterId. We scan project directories to find it — fine at
// file-adapter scale; a real DB would index by id directly.
async function findFilterFile(
  namedFilterId: string
): Promise<{ projectId: string; data: FilterFileShape } | null> {
  const projectsDir = path.join(DATA_ROOT, "projects");
  let projectDirs: string[];
  try {
    projectDirs = await fs.readdir(projectsDir);
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  for (const projectId of projectDirs) {
    const data = await readJSON<FilterFileShape>(filtersPath(projectId), {
      filters: [],
      values: [],
    });
    if (data.filters.some((f) => f.id === namedFilterId)) {
      return { projectId, data };
    }
  }
  return null;
}

export const fileFilterStore: FilterStore = {
  async get(namedFilterId) {
    const found = await findFilterFile(namedFilterId);
    if (!found) return null;
    return found.data.filters.find((f) => f.id === namedFilterId) ?? null;
  },

  async list(projectId) {
    const data = await readJSON<FilterFileShape>(filtersPath(projectId), {
      filters: [],
      values: [],
    });
    return data.filters.filter((f) => !f.deletedAt);
  },

  async create(projectId, label, criteria, createdBy, description) {
    const data = await readJSON<FilterFileShape>(filtersPath(projectId), {
      filters: [],
      values: [],
    });

    const timestamp = nowISO();
    const value: FilterValue = {
      id: randomUUID(),
      ...criteria,
      createdAt: timestamp,
      createdBy,
    };
    const namedFilter: NamedFilter = {
      id: randomUUID(),
      projectId,
      label,
      description,
      currentFilterValueId: value.id,
      history: [{ filterValueId: value.id, from: timestamp, to: null }],
      createdAt: timestamp,
      createdBy,
    };

    data.values.push(value);
    data.filters.push(namedFilter);
    await writeJSONAtomic(filtersPath(projectId), data);
    return namedFilter;
  },

  async updateCriteria(namedFilterId, criteria, updatedBy) {
    const found = await findFilterFile(namedFilterId);
    if (!found) throw new Error(`NamedFilter ${namedFilterId} not found`);
    const { projectId, data } = found;

    const filter = data.filters.find((f) => f.id === namedFilterId)!;
    const timestamp = nowISO();

    const newValue: FilterValue = {
      id: randomUUID(),
      ...criteria,
      createdAt: timestamp,
      createdBy: updatedBy,
    };

    // Close out the previous history entry, then append the new one.
    const currentEntry = filter.history.find(
      (h) => h.filterValueId === filter.currentFilterValueId && h.to === null
    );
    if (currentEntry) currentEntry.to = timestamp;

    filter.history.push({ filterValueId: newValue.id, from: timestamp, to: null });
    filter.currentFilterValueId = newValue.id;

    data.values.push(newValue);
    await writeJSONAtomic(filtersPath(projectId), data);
    return filter;
  },

  async rename(namedFilterId, label, description) {
    const found = await findFilterFile(namedFilterId);
    if (!found) throw new Error(`NamedFilter ${namedFilterId} not found`);
    const { projectId, data } = found;

    const filter = data.filters.find((f) => f.id === namedFilterId)!;
    if (label !== undefined) filter.label = label;
    if (description !== undefined) filter.description = description;

    await writeJSONAtomic(filtersPath(projectId), data);
    return filter;
  },

  async softDelete(namedFilterId) {
    const found = await findFilterFile(namedFilterId);
    if (!found) return;
    const { projectId, data } = found;

    const filter = data.filters.find((f) => f.id === namedFilterId)!;
    filter.deletedAt = nowISO();

    await writeJSONAtomic(filtersPath(projectId), data);
  },

  async resolve(filterRef: FilterRef): Promise<FilterCriteria | null> {
    const found = await findFilterFile(filterRef.namedFilterId);
    if (!found) return null;
    const { data } = found;

    const valueId =
      filterRef.mode === "pin" && filterRef.pinnedFilterValueId
        ? filterRef.pinnedFilterValueId
        : data.filters.find((f) => f.id === filterRef.namedFilterId)
            ?.currentFilterValueId;

    const value = data.values.find((v) => v.id === valueId);
    if (!value) return null;

    const { categories, linkTypes, linkStrengths, influenceLevels, interestLevels } =
      value;
    return { categories, linkTypes, linkStrengths, influenceLevels, interestLevels };
  },
};

// ── Views ────────────────────────────────────────────────────────────────

interface ViewFileShape {
  views: View[];
}

function viewsPath(datasetId: string): string {
  return path.join(DATA_ROOT, "datasets", datasetId, "views.json");
}

async function findViewFile(
  viewId: string
): Promise<{ datasetId: string; data: ViewFileShape } | null> {
  const datasetsDir = path.join(DATA_ROOT, "datasets");
  let datasetDirs: string[];
  try {
    datasetDirs = await fs.readdir(datasetsDir);
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  for (const datasetId of datasetDirs) {
    const data = await readJSON<ViewFileShape>(viewsPath(datasetId), { views: [] });
    if (data.views.some((v) => v.id === viewId)) {
      return { datasetId, data };
    }
  }
  return null;
}

export const fileViewStore: ViewStore = {
  async get(viewId) {
    const found = await findViewFile(viewId);
    if (!found) return null;
    return found.data.views.find((v) => v.id === viewId) ?? null;
  },

  async list(datasetId) {
    const data = await readJSON<ViewFileShape>(viewsPath(datasetId), { views: [] });
    return data.views;
  },

  async create(datasetId, projectId, label, createdBy, layout, filterRef) {
    const data = await readJSON<ViewFileShape>(viewsPath(datasetId), { views: [] });
    const timestamp = nowISO();

    const view: View = {
      id: randomUUID(),
      datasetId,
      projectId,
      label,
      layout,
      filterRef,
      createdAt: timestamp,
      createdBy,
      updatedAt: timestamp,
    };

    data.views.push(view);
    await writeJSONAtomic(viewsPath(datasetId), data);
    return view;
  },

  async update(viewId, updates) {
    const found = await findViewFile(viewId);
    if (!found) throw new Error(`View ${viewId} not found`);
    const { datasetId, data } = found;

    const view = data.views.find((v) => v.id === viewId)!;
    if (updates.label !== undefined) view.label = updates.label;
    if (updates.layout !== undefined) view.layout = updates.layout;
    if (updates.filterRef !== undefined) {
      // null explicitly clears the filter; undefined leaves it untouched
      // (handled by the caller only passing keys it wants to change).
      view.filterRef = updates.filterRef ?? undefined;
    }
    view.updatedAt = nowISO();

    await writeJSONAtomic(viewsPath(datasetId), data);
    return view;
  },

  async delete(viewId) {
    const found = await findViewFile(viewId);
    if (!found) return;
    const { datasetId, data } = found;

    data.views = data.views.filter((v) => v.id !== viewId);
    await writeJSONAtomic(viewsPath(datasetId), data);
  },
};

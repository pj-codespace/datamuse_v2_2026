// app/_lib/views-filters/client.ts
//
// Client-safe helpers only. Never import file-store.ts (or anything using
// fs/path/crypto) from here or from any "use client" component — those only
// run server-side, behind the API routes in app/api/filters/.

import type { FilterState } from "@/app/_lib/filters/types";
import type { FilterCriteria, NamedFilter } from "./types";

// ── Translation: ephemeral FilterState ⇄ persisted FilterCriteria ──────────
//
// FilterState uses Sets (categories/linkTypes) and contiguous [min, max]
// tuples (influenceRange/interestRange). FilterCriteria uses plain arrays
// everywhere. For influence/interest we store the two range endpoints as a
// 2-element array — ASSUMPTION: lossless only because the UI never produces
// a non-contiguous selection today. `linkStrengths` isn't exposed in
// FilterPanel's UI at all yet, so it round-trips as empty ("no constraint").

export function filterStateToCriteria(filters: FilterState): FilterCriteria {
  return {
    categories: Array.from(filters.categories),
    linkTypes: Array.from(filters.linkTypes),
    linkStrengths: [],
    influenceLevels: [filters.influenceRange[0], filters.influenceRange[1]],
    interestLevels: [filters.interestRange[0], filters.interestRange[1]],
  };
}

export function criteriaToFilterState(criteria: FilterCriteria): FilterState {
  return {
    categories: new Set(criteria.categories),
    linkTypes: new Set(criteria.linkTypes),
    influenceRange: [criteria.influenceLevels[0] ?? 0, criteria.influenceLevels[1] ?? 0],
    interestRange: [criteria.interestLevels[0] ?? 0, criteria.interestLevels[1] ?? 0],
  };
}

// ── API client (fetch helpers) ───────────────────────────────────────────

async function parseOrThrow<T>(res: Response, action: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to ${action} (${res.status})`);
  }
  return res.json();
}

export async function listNamedFilters(projectId: string): Promise<NamedFilter[]> {
  const res = await fetch(`/api/filters?projectId=${encodeURIComponent(projectId)}`);
  return parseOrThrow(res, "list filters");
}

export async function createNamedFilter(
  projectId: string,
  label: string,
  criteria: FilterCriteria,
  description?: string
): Promise<NamedFilter> {
  const res = await fetch("/api/filters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, label, description, criteria }),
  });
  return parseOrThrow(res, "create filter");
}

export async function updateNamedFilterCriteria(
  namedFilterId: string,
  criteria: FilterCriteria
): Promise<NamedFilter> {
  const res = await fetch(`/api/filters/${namedFilterId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ criteria }),
  });
  return parseOrThrow(res, "update filter");
}

export async function renameNamedFilter(
  namedFilterId: string,
  label?: string,
  description?: string
): Promise<NamedFilter> {
  const res = await fetch(`/api/filters/${namedFilterId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, description }),
  });
  return parseOrThrow(res, "rename filter");
}

export async function deleteNamedFilter(namedFilterId: string): Promise<void> {
  const res = await fetch(`/api/filters/${namedFilterId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete filter (${res.status})`);
}

export async function resolveNamedFilter(
  namedFilterId: string
): Promise<FilterCriteria | null> {
  const res = await fetch(`/api/filters/${namedFilterId}/resolve`);
  if (res.status === 404) return null;
  return parseOrThrow(res, "resolve filter");
}

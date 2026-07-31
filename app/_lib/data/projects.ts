export interface ProjectRegistryEntry {
  /** Used as the URL segment: /network/[id] */
  id: string;
  /** Filename inside public/data/ */
  dataFile: string;
}

// Add an entry here whenever a new project dataset is ready. Everything
// shown on the dashboard (name, description, counts) is read from the
// project's own data file at request time — not duplicated here — so
// there's a single source of truth per project.
export const PROJECT_REGISTRY: ProjectRegistryEntry[] = [
  { id: "off-grid-analysis", dataFile: "network-sample-large.json" },
  { id: "HIM-2", dataFile: "network-sample-mid.json" },
  { id: "Open-Air-Food-Markets", dataFile: "network-sample-sm.json" },
  { id: "RRCS-in-Africa", dataFile: "network-ng.json" },
  { id: "IFPRI-composite", dataFile: "ifpri_test.json" }
];
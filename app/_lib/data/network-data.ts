import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { NetworkDataset } from "./types";
import { PROJECT_REGISTRY } from "./projects";

async function readDataFile(fileName: string): Promise<NetworkDataset> {
  const filePath = path.join(process.cwd(), "public", "data", fileName);
  let raw = await fs.readFile(filePath, "utf-8");
  // Strip a leading UTF-8 byte-order-mark if present — some editors/tools
  // (common on Windows) save JSON with one, and JSON.parse throws on it
  // even though the file looks completely normal when opened.
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  return JSON.parse(raw) as NetworkDataset;
}

// Thin data-access layer. Today this reads a static JSON file from /public.
// Later, when a real backend exists, only the INSIDE of this function needs
// to change (e.g. to a database query keyed by projectId) — every
// page/component that calls getNetworkData() stays exactly the same.
export async function getNetworkData(projectId: string): Promise<NetworkDataset> {
  const entry = PROJECT_REGISTRY.find((p) => p.id === projectId);
  if (!entry) {
    throw new Error(`Unknown project id: "${projectId}"`);
  }
  return readDataFile(entry.dataFile);
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  linkCount: number;
  categoryCount: number;
  /** False if the data file couldn't be read (e.g. not uploaded yet). */
  available: boolean;
}

/** Reads every registered project's data file and extracts the bits the
 *  dashboard needs. Projects whose data file is missing (e.g. registered
 *  but not yet uploaded) show up as an "unavailable" placeholder instead
 *  of crashing the whole dashboard. */
export async function getProjectSummaries(): Promise<ProjectSummary[]> {
  return Promise.all(
    PROJECT_REGISTRY.map(async (entry): Promise<ProjectSummary> => {
      try {
        const data = await readDataFile(entry.dataFile);
        return {
          id: entry.id,
          name: data.project.name,
          description: data.project.description,
          nodeCount: data.nodes.length,
          linkCount: data.links.length,
          categoryCount: data.project.settings.categories.length,
          available: true,
        };
      } catch (error) {
        // Logged (not swallowed silently) so a bad file is diagnosable
        // from the dev server's terminal output instead of just showing
        // the same generic message for every possible failure reason.
        console.error(`[getProjectSummaries] Failed to load "${entry.dataFile}" for project "${entry.id}":`, error);
        return {
          id: entry.id,
          name: entry.id,
          description: "Dataset not yet available.",
          nodeCount: 0,
          linkCount: 0,
          categoryCount: 0,
          available: false,
        };
      }
    })
  );
}

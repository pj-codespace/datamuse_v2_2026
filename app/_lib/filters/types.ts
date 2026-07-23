import type { NetworkLink, NetworkNode, ProjectMeta } from "@/app/_lib/data/types";

export interface FilterState {
  /** Category ids currently checked. A node's category must be in this
   *  set to be visible. */
  categories: Set<string>;
  /** Link type ids currently checked. */
  linkTypes: Set<string>;
  /** Inclusive [min, max] influence range. */
  influenceRange: [number, number];
  /** Inclusive [min, max] interest range. */
  interestRange: [number, number];
}

/** Everything checked, full range — i.e. no filtering applied. This is
 *  the state a fresh view starts in, and what "select all" resets to. */
export function createDefaultFilterState(project: ProjectMeta): FilterState {
  const interestValues = project.settings.interestLevels.map((l) => l.value);
  return {
    categories: new Set(project.settings.categories.map((c) => c.id)),
    linkTypes: new Set(project.settings.linkTypes.map((t) => t.id)),
    influenceRange: [0, project.settings.highestInfluenceValue],
    interestRange: [Math.min(...interestValues), Math.max(...interestValues)],
  };
}

export function isNodeVisible(node: NetworkNode, filters: FilterState): boolean {
  return (
    filters.categories.has(node.category) &&
    node.influence >= filters.influenceRange[0] &&
    node.influence <= filters.influenceRange[1] &&
    node.interest >= filters.interestRange[0] &&
    node.interest <= filters.interestRange[1]
  );
}

/** A link needs its own type checked AND both endpoints currently
 *  visible — a link to/from a filtered-out node shouldn't float free. */
export function isLinkVisible(
  link: NetworkLink,
  filters: FilterState,
  visibleNodeIds: Set<number>
): boolean {
  return (
    filters.linkTypes.has(link.type) &&
    visibleNodeIds.has(link.source) &&
    visibleNodeIds.has(link.target)
  );
}

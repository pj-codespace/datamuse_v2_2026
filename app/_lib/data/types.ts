// Types matching the cleaned network dataset.
// These describe the SOURCE data shape only — simulation-derived fields
// (x/y positions, degree counts, centrality scores, etc.) are NOT included
// here on purpose. D3 computes those at runtime, and future analytics
// features will compute the rest on request.

export interface Category {
  id: string; // e.g. "cat_0"
  label: string; // e.g. "Investor"
  color: string; // e.g. "#1ec895"
}

export interface LinkType {
  id: string; // e.g. "linktype_0"
  label: string; // e.g. "Funding"
  direction: "directed" | "undirected";
  color: string;
}

export interface LinkStrength {
  value: number; // 0, 1, 2
  id: "weak" | "normal" | "strong";
  label: string;
}

export interface ScaleLevel {
  value: number;
  label: string;
}

export interface ProjectSettings {
  highestInfluenceValue: number;
  influenceLevels: ScaleLevel[];
  interestLevels: ScaleLevel[];
  categories: Category[];
  linkTypes: LinkType[];
  linkStrengths: LinkStrength[];
}

export interface ProjectMeta {
  name: string;
  description: string;
  settings: ProjectSettings;
}

// A single entity in the network (an organization, fund, etc.)
export interface NetworkNode {
  id: number;
  name: string;
  category: string; // references Category.id
  interest: number; // -3 to 3 scale
  influence: number; // 0 to highestInfluenceValue scale
  description: string;
}

// A directed/undirected funding relationship between two nodes
export interface NetworkLink {
  source: number; // references NetworkNode.id
  target: number; // references NetworkNode.id
  type: string; // references LinkType.id
  strength: number; // 0 (weak) | 1 (normal) | 2 (strong)
}

export interface NetworkDataset {
  project: ProjectMeta;
  nodes: NetworkNode[];
  links: NetworkLink[];
}

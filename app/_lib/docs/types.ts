export interface DocsFrontmatter {
  title?: string;
  description?: string;
  order?: number;
}

export interface DocHeading {
  depth: 2 | 3;
  text: string;
  slug: string;
}

/** A single renderable doc page (one .md file on disk). */
export interface DocPage {
  /** URL slug segments, e.g. ["settled", "guides", "adding-a-dataset"]. Empty array = docs root (README.md). */
  slug: string[];
  /** Full route, e.g. "/docs/settled/guides/adding-a-dataset". */
  href: string;
  /** Absolute path on disk. */
  filePath: string;
  title: string;
  /** True if this file is a README.md acting as a folder's index page. */
  isIndex: boolean;
}

/** A node in the sidebar nav tree. Can be a folder (possibly with its own index page) or a leaf page. */
export interface DocsNavNode {
  title: string;
  /** Null if this is a folder with no README.md index — not directly navigable, just an expandable group. */
  href: string | null;
  slug: string[];
  children: DocsNavNode[];
  isFolder: boolean;
}

export interface DocSearchEntry {
  href: string;
  title: string;
  snippet: string;
}

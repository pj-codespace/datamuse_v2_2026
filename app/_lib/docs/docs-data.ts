import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import matter from "gray-matter";
import type { DocPage, DocsNavNode } from "./types";

// docs/ lives at the project root, as a sibling of app/ and public/ — NOT inside public/,
// since we don't want the raw .md files served as static assets.
const DOCS_ROOT = path.join(process.cwd(), "docs");

function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.md$/i, "");
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function readTitle(filePath: string, fallback: string): string {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { content, data } = matter(raw);
    if (data?.title) return String(data.title);
    const match = content.match(/^#\s+(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    // file unreadable for some reason — fall back to filename-derived title
  }
  return fallback;
}

interface WalkResult {
  pages: DocPage[];
  nav: DocsNavNode[];
}

function walk(dir: string, slugPrefix: string[]): WalkResult {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"));
  const dirs = entries.filter((e) => e.isDirectory());

  const pages: DocPage[] = [];
  // Combined nav entries (files + folders) so we can sort them together by title.
  const navEntries: DocsNavNode[] = [];

  for (const file of files) {
    const isReadme = file.name.toLowerCase() === "readme.md";
    const nameNoExt = file.name.replace(/\.md$/i, "");
    const slug = isReadme ? slugPrefix : [...slugPrefix, nameNoExt];
    const href = "/docs" + (slug.length ? "/" + slug.join("/") : "");
    const filePath = path.join(dir, file.name);
    const title = readTitle(filePath, titleFromFilename(file.name));

    pages.push({ slug, href, filePath, title, isIndex: isReadme });

    // README.md becomes this folder's index (attached to the folder node below),
    // not a separate leaf in the sidebar.
    if (!isReadme) {
      navEntries.push({ title, href, slug, children: [], isFolder: false });
    }
  }

  for (const d of dirs) {
    const childSlugPrefix = [...slugPrefix, d.name];
    const childDir = path.join(dir, d.name);
    const result = walk(childDir, childSlugPrefix);
    pages.push(...result.pages);

    const folderReadme = result.pages.find(
      (p) => p.isIndex && p.slug.join("/") === childSlugPrefix.join("/")
    );

    navEntries.push({
      title: titleFromFilename(d.name),
      href: folderReadme ? folderReadme.href : null,
      slug: childSlugPrefix,
      children: result.nav,
      isFolder: true,
    });
  }

  navEntries.sort((a, b) => a.title.localeCompare(b.title));

  return { pages, nav: navEntries };
}

/** Cached per-request (React `cache()`) so repeated calls during one render don't re-read the filesystem. */
export const getDocsTree = cache((): WalkResult => {
  if (!fs.existsSync(DOCS_ROOT)) {
    return { pages: [], nav: [] };
  }
  return walk(DOCS_ROOT, []);
});

export function getAllDocPages(): DocPage[] {
  return getDocsTree().pages;
}

export function getNavTree(): DocsNavNode[] {
  return getDocsTree().nav;
}

export function getDocPageBySlug(slug: string[]): DocPage | null {
  const target = slug.join("/");
  return getAllDocPages().find((p) => p.slug.join("/") === target) ?? null;
}

export function getDocRawContent(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/** For generateStaticParams in app/docs/[[...slug]]/page.tsx */
export function getAllDocSlugParams(): { slug: string[] }[] {
  return getAllDocPages().map((p) => ({ slug: p.slug }));
}

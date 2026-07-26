import { NextRequest, NextResponse } from "next/server";
import { getAllDocPages, getDocRawContent } from "../../../_lib/docs/docs-data";
import { renderMarkdown } from "../../../_lib/docs/markdown";
import type { DocSearchEntry } from "../../../_lib/docs/types";

// Simple in-memory cache so we don't re-read + re-parse every doc on every keystroke.
// Fine for a docs set of this size; invalidates on server restart / redeploy.
let cachedIndex: DocSearchEntry[] | null = null;

function buildIndex(): DocSearchEntry[] {
  return getAllDocPages().map((page) => {
    const raw = getDocRawContent(page.filePath);
    const { excerpt } = renderMarkdown(raw);
    return { href: page.href, title: page.title, snippet: excerpt };
  });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (!cachedIndex) cachedIndex = buildIndex();

  if (!q) return NextResponse.json({ results: [] });

  const results = cachedIndex
    .map((entry) => {
      const titleMatch = entry.title.toLowerCase().includes(q);
      const snippetIdx = entry.snippet.toLowerCase().indexOf(q);
      if (!titleMatch && snippetIdx === -1) return null;

      // Build a short snippet centered on the match, for context.
      let snippet = entry.snippet;
      if (snippetIdx !== -1) {
        const start = Math.max(0, snippetIdx - 40);
        snippet = (start > 0 ? "…" : "") + entry.snippet.slice(start, snippetIdx + q.length + 60) + "…";
      }

      return {
        href: entry.href,
        title: entry.title,
        snippet,
        // Title matches rank higher than body-only matches.
        score: titleMatch ? 2 : 1,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return NextResponse.json({ results });
}

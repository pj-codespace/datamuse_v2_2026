import type { DocsNavNode } from "../../_lib/docs/types";
import { DocsSidebar } from "./DocsSidebar";
import { DocsSearch } from "./DocsSearch";

export function DocsShell({
  tree,
  children,
  toc,
}: {
  tree: DocsNavNode[];
  children: React.ReactNode;
  /** Right-hand table-of-contents column content, per-page. Omit for pages with no headings. */
  toc?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
      {/* Left sidebar */}
      <aside className="hidden w-64 shrink-0 md:block">
        <div className="sticky top-8 space-y-4">
          <DocsSearch />
          <DocsSidebar tree={tree} />
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">
        <article
          className="prose prose-slate max-w-none dark:prose-invert
                     prose-pre:bg-slate-900 prose-pre:text-slate-100
                     prose-code:before:content-none prose-code:after:content-none"
        >
          {children}
        </article>
      </main>

      {/* Right-hand table of contents */}
      {toc && <aside className="hidden w-56 shrink-0 lg:block"><div className="sticky top-8">{toc}</div></aside>}
    </div>
  );
}

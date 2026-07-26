import type { Metadata } from "next";
import Link from "next/link";
import "highlight.js/styles/github-dark.css";

export const metadata: Metadata = {
  title: {
    template: "%s · Docs",
    default: "Docs",
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/docs" className="text-sm font-semibold text-slate-900 dark:text-white">
            Docs
          </Link>
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            ← Back to app
          </Link>
        </div>
      </header>
      {/* Each page.tsx fetches the nav tree via getNavTree() and wraps its content in <DocsShell tree={tree}>.
          getNavTree() is wrapped in React's cache(), so this filesystem walk only happens once per request
          even though every page calls it independently — no need to thread it through context. */}
      {children}
    </div>
  );
}

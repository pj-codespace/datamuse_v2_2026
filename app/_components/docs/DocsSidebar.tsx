"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { DocsNavNode } from "../../_lib/docs/types";

function isAncestorOfCurrentPath(node: DocsNavNode, pathname: string): boolean {
  const nodeHref = "/docs" + (node.slug.length ? "/" + node.slug.join("/") : "");
  return pathname === nodeHref || pathname.startsWith(nodeHref + "/");
}

function NavNode({ node, pathname }: { node: DocsNavNode; pathname: string }) {
  const active = node.href === pathname;
  const [expanded, setExpanded] = useState(() => isAncestorOfCurrentPath(node, pathname));

  if (!node.isFolder) {
    return (
      <li>
        <Link
          href={node.href!}
          className={`block rounded px-2 py-1 text-sm transition-colors ${
            active
              ? "bg-slate-200 font-medium text-slate-900 dark:bg-slate-700 dark:text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          {node.title}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          aria-label={expanded ? "Collapse section" : "Expand section"}
        >
          <span
            className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}
            style={{ fontSize: "10px" }}
          >
            ▶
          </span>
        </button>
        {node.href ? (
          <Link
            href={node.href}
            className={`block flex-1 rounded px-2 py-1 text-sm font-semibold uppercase tracking-wide ${
              active
                ? "text-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {node.title}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex-1 rounded px-2 py-1 text-left text-sm font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            {node.title}
          </button>
        )}
      </div>
      {expanded && node.children.length > 0 && (
        <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-200 pl-3 dark:border-slate-700">
          {node.children.map((child) => (
            <NavNode key={child.slug.join("/") || "index"} node={child} pathname={pathname} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function DocsSidebar({ tree }: { tree: DocsNavNode[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation" className="text-sm">
      <ul className="space-y-0.5">
        {tree.map((node) => (
          <NavNode key={node.slug.join("/") || "index"} node={node} pathname={pathname} />
        ))}
      </ul>
    </nav>
  );
}

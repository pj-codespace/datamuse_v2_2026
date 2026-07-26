"use client";

import { useEffect, useState } from "react";
import type { DocHeading } from "../../_lib/docs/types";

export function TableOfContents({ headings }: { headings: DocHeading[] }) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length === 0) return;

    const elements = headings
      .map((h) => document.getElementById(h.slug))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport that's currently intersecting.
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const topMost = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          );
          setActiveSlug(topMost.target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 1.0 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="Table of contents" className="text-sm">
      <p className="mb-2 font-semibold uppercase tracking-wide text-slate-400 text-xs">
        On this page
      </p>
      <ul className="space-y-1 border-l border-slate-200 dark:border-slate-700">
        {headings.map((h) => (
          <li key={h.slug} style={{ paddingLeft: h.depth === 3 ? "1.5rem" : "0.75rem" }}>
            <a
              href={`#${h.slug}`}
              className={`block border-l-2 -ml-px py-0.5 pl-3 transition-colors ${
                activeSlug === h.slug
                  ? "border-slate-900 font-medium text-slate-900 dark:border-white dark:text-white"
                  : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

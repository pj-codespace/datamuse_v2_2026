import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getAllDocSlugParams,
  getDocPageBySlug,
  getDocRawContent,
  getNavTree,
} from "../../_lib/docs/docs-data";
import { renderMarkdown } from "../../_lib/docs/markdown";
import { DocsShell } from "../../_components/docs/DocsShell";
import { TableOfContents } from "../../_components/docs/TableOfContents";

export function generateStaticParams() {
  return getAllDocSlugParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug = [] } = await params;
  const page = getDocPageBySlug(slug);
  return { title: page?.title ?? "Not found" };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const page = getDocPageBySlug(slug);

  if (!page) notFound();

  const raw = getDocRawContent(page.filePath);
  const { html, headings, frontmatter } = renderMarkdown(raw);
  const tree = getNavTree();

  return (
    <DocsShell tree={tree} toc={<TableOfContents headings={headings} />}>
      {frontmatter.description && (
        <p className="text-lg text-slate-500 dark:text-slate-400">{frontmatter.description}</p>
      )}
      {/* html comes from our own markdown pipeline (unified/remark/rehype) rendering local
          repo files we control — not user-submitted content — so this is safe. */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </DocsShell>
  );
}

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import matter from "gray-matter";
import type { Root, Element, Text } from "hast";
import type { DocHeading, DocsFrontmatter } from "./types";

function extractText(node: Element | Text): string {
  if (node.type === "text") return node.value;
  if (!("children" in node) || !node.children) return "";
  return node.children.map((c) => extractText(c as Element | Text)).join("");
}

/** A rehype plugin that collects h2/h3 headings (with their slug ids) into the array passed in. */
function collectHeadings(headings: DocHeading[]) {
  return () => (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "h2" || node.tagName === "h3") {
        const slug = (node.properties?.id as string) ?? "";
        headings.push({
          depth: node.tagName === "h2" ? 2 : 3,
          text: extractText(node),
          slug,
        });
      }
    });
  };
}

export interface RenderedDoc {
  html: string;
  headings: DocHeading[];
  frontmatter: DocsFrontmatter;
  /** Plain-text excerpt, used for the search index. */
  excerpt: string;
}

export function renderMarkdown(raw: string): RenderedDoc {
  const { content, data } = matter(raw);
  const headings: DocHeading[] = [];

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug) // assign heading ids first...
    .use(collectHeadings(headings)) // ...then collect them, ids included
    .use(rehypeHighlight, { detect: true })
    .use(rehypeStringify);

  const html = String(processor.processSync(content));

  const excerpt = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  return { html, headings, frontmatter: data as DocsFrontmatter, excerpt };
}

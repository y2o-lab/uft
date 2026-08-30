import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      ["target", "_blank"],
      ["rel", "noopener noreferrer"],
    ],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-/],
    ],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      ["src", /^(?:blob:|data:image\/(?:png|jpe?g|gif|webp)|[^:]+$)/],
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
    src: ["blob", "data"],
  },
} as Parameters<typeof rehypeSanitize>[0];

export async function renderMarkdown(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSanitize, schema)
    .use(rehypeStringify)
    .process(markdown);
  return String(result).replace(
    /<a href="(https?:[^"]+)"/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer"',
  );
}

export function mermaidBlocks(
  markdown: string,
): Array<{ source: string; index: number }> {
  return [...markdown.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)].map(
    (match, index) => ({ source: match[1].trim(), index }),
  );
}

export function relativeAssetPath(
  documentPath: string,
  assetPath: string,
): string {
  const origin = documentPath.split("/").slice(0, -1);
  const target = assetPath.split("/");
  while (origin.length && target.length && origin[0] === target[0]) {
    origin.shift();
    target.shift();
  }
  return `${
    origin
      .map(() => "..")
      .concat(target)
      .join("/") || "."
  }`;
}

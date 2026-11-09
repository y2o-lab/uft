import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { TASK_BOARD_LANGUAGE, taskBoardBlocks } from "./task-board";

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

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify)
  .freeze();

export async function renderMarkdownPreview(markdown: string) {
  const tree = renderer.parse(markdown);
  const taskBoards = markdown.includes(TASK_BOARD_LANGUAGE)
    ? taskBoardBlocks(tree)
    : [];
  const html = renderer
    .stringify(await renderer.run(tree))
    .replace(
      /<a href="(https?:[^"]+)"/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer"',
    );
  return { html, taskBoards };
}

export async function renderMarkdown(markdown: string): Promise<string> {
  return (await renderMarkdownPreview(markdown)).html;
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

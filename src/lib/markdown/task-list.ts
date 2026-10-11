import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

type TaskNode = {
  type: string;
  checked?: boolean | null;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: TaskNode[];
};

// Use parsed task items so examples in code fences and ordinary text are ignored.
export function setTaskChecked(
  markdown: string,
  index: number,
  checked: boolean,
): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const offsets: Array<number | undefined> = [];
  function visit(node: TaskNode): void {
    if (node.type === "listItem" && typeof node.checked === "boolean") {
      const start = node.position?.start.offset;
      const contentEnd = node.children?.[0]?.position?.end.offset;
      const marker =
        start !== undefined && contentEnd !== undefined
          ? /\[([ xX])\]/.exec(markdown.slice(start, contentEnd))
          : null;
      offsets.push(
        marker && start !== undefined ? start + marker.index + 1 : undefined,
      );
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(tree);
  const offset = offsets[index];
  if (offset === undefined) return markdown;
  return `${markdown.slice(0, offset)}${checked ? "x" : " "}${markdown.slice(offset + 1)}`;
}

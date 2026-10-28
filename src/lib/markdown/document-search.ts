export interface TextMatch {
  from: number;
  to: number;
}

/** Literal, case-insensitive search, retaining original UTF-16 offsets. */
export function findTextMatches(text: string, query: string): TextMatch[] {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...text.matchAll(new RegExp(escaped, "giu"))].map((match) => ({
    from: match.index,
    to: match.index + match[0].length,
  }));
}

/** Keep block boundaries separate while allowing matches across inline markup. */
export function previewSearchRanges(host: HTMLElement, query: string): Range[] {
  const groups = new Map<Element, Text[]>();
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !parent.closest("[data-preview-only],script,style,svg")) {
      const block = parent.closest(
        "h1,h2,h3,h4,h5,h6,p,li,pre,td,th,blockquote",
      );
      const key = block && host.contains(block) ? block : host;
      const nodes = groups.get(key) ?? [];
      nodes.push(node as Text);
      groups.set(key, nodes);
    }
    node = walker.nextNode();
  }
  const ranges: Range[] = [];
  for (const nodes of groups.values()) {
    const text = nodes.map((node) => node.data).join("");
    for (const match of findTextMatches(text, query)) {
      let offset = 0;
      const range = document.createRange();
      for (const node of nodes) {
        const end = offset + node.length;
        if (match.from >= offset && match.from < end)
          range.setStart(node, match.from - offset);
        if (match.to > offset && match.to <= end) {
          range.setEnd(node, match.to - offset);
          break;
        }
        offset = end;
      }
      ranges.push(range);
    }
  }
  return ranges;
}

export type MarkdownFormat =
  | "heading-1"
  | "heading-2"
  | "bold"
  | "italic"
  | "strike"
  | "inline-code"
  | "code-block"
  | "quote"
  | "bullet-list"
  | "ordered-list";

export type MarkdownSelection = { from: number; to: number };

export type MarkdownFormatResult = MarkdownSelection & { text: string };

const inlineFormats: Partial<
  Record<MarkdownFormat, { before: string; after: string; placeholder: string }>
> = {
  bold: { before: "**", after: "**", placeholder: "太字" },
  italic: { before: "*", after: "*", placeholder: "斜体" },
  strike: { before: "~~", after: "~~", placeholder: "取り消し線" },
  "inline-code": { before: "`", after: "`", placeholder: "code" },
};

function wrapInline(
  text: string,
  selection: MarkdownSelection,
  before: string,
  after: string,
  placeholder: string,
): MarkdownFormatResult {
  const { from, to } = selection;
  const selected = text.slice(from, to);

  if (from === to) {
    const lineStart = text.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
    const nextBreak = text.indexOf("\n", from);
    const lineEnd = nextBreak === -1 ? text.length : nextBreak;
    const opening = text.lastIndexOf(before, from - before.length);
    const closing = text.indexOf(after, from);
    if (opening >= lineStart && closing >= from && closing <= lineEnd) {
      const caret = closing + after.length;
      return { text, from: caret, to: caret };
    }
  }

  if (selected.startsWith(before) && selected.endsWith(after)) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return {
      text: text.slice(0, from) + inner + text.slice(to),
      from,
      to: from + inner.length,
    };
  }

  if (
    from >= before.length &&
    text.slice(from - before.length, from) === before &&
    text.slice(to, to + after.length) === after
  ) {
    return {
      text:
        text.slice(0, from - before.length) +
        selected +
        text.slice(to + after.length),
      from: from - before.length,
      to: to - before.length,
    };
  }

  const content = selected || placeholder;
  const replacement = `${before}${content}${after}`;
  return {
    text: text.slice(0, from) + replacement + text.slice(to),
    from: from + before.length,
    to: from + before.length + content.length,
  };
}

function selectedLineBounds(
  text: string,
  selection: MarkdownSelection,
): { start: number; end: number } {
  const start = text.lastIndexOf("\n", Math.max(0, selection.from - 1)) + 1;
  const nextBreak = text.indexOf("\n", selection.to);
  return { start, end: nextBreak === -1 ? text.length : nextBreak };
}

function prefixLines(
  text: string,
  selection: MarkdownSelection,
  prefix: string,
  matchesPrefix: RegExp,
): MarkdownFormatResult {
  const { start, end } = selectedLineBounds(text, selection);
  const lines = text.slice(start, end).split("\n");
  const remove = lines.every((line) => matchesPrefix.test(line));
  const transformed = lines
    .map((line, index) => {
      matchesPrefix.lastIndex = 0;
      const clean = line.replace(matchesPrefix, "");
      if (remove) return clean;
      if (prefix === "1. ") return `${index + 1}. ${clean}`;
      return `${prefix}${clean}`;
    })
    .join("\n");
  const nextText = text.slice(0, start) + transformed + text.slice(end);

  if (selection.from === selection.to && lines.length === 1) {
    const originalPrefix = lines[0].match(matchesPrefix)?.[0].length ?? 0;
    const nextPrefix = remove ? 0 : prefix.length;
    const caret = Math.max(
      start + nextPrefix,
      selection.from + nextPrefix - originalPrefix,
    );
    return { text: nextText, from: caret, to: caret };
  }

  return { text: nextText, from: start, to: start + transformed.length };
}

function heading(
  text: string,
  selection: MarkdownSelection,
  level: 1 | 2,
): MarkdownFormatResult {
  const prefix = `${"#".repeat(level)} `;
  const { start, end } = selectedLineBounds(text, selection);
  const lines = text.slice(start, end).split("\n");
  const exact = new RegExp(`^#{${level}} `);
  const remove = lines.every((line) => exact.test(line));
  const transformed = lines
    .map((line) => {
      const clean = line.replace(/^#{1,6}\s+/, "");
      return remove ? clean : `${prefix}${clean}`;
    })
    .join("\n");
  const nextText = text.slice(0, start) + transformed + text.slice(end);

  if (selection.from === selection.to && lines.length === 1) {
    const originalPrefix = lines[0].match(/^#{1,6}\s+/)?.[0].length ?? 0;
    const nextPrefix = remove ? 0 : prefix.length;
    const caret = Math.max(
      start + nextPrefix,
      selection.from + nextPrefix - originalPrefix,
    );
    return { text: nextText, from: caret, to: caret };
  }

  return { text: nextText, from: start, to: start + transformed.length };
}

function codeBlock(
  text: string,
  selection: MarkdownSelection,
): MarkdownFormatResult {
  const { from, to } = selection;
  const selected = text.slice(from, to);
  const fenced = selected.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (fenced) {
    return {
      text: text.slice(0, from) + fenced[1] + text.slice(to),
      from,
      to: from + fenced[1].length,
    };
  }

  const content = selected || "code";
  const needsLeadingBreak = from > 0 && text[from - 1] !== "\n";
  const needsTrailingBreak = to < text.length && text[to] !== "\n";
  const before = `${needsLeadingBreak ? "\n" : ""}\`\`\`\n`;
  const after = `\n\`\`\`${needsTrailingBreak ? "\n" : ""}`;
  return {
    text: text.slice(0, from) + before + content + after + text.slice(to),
    from: from + before.length,
    to: from + before.length + content.length,
  };
}

export function applyMarkdownFormat(
  text: string,
  selection: MarkdownSelection,
  format: MarkdownFormat,
): MarkdownFormatResult {
  const inline = inlineFormats[format];
  if (inline)
    return wrapInline(
      text,
      selection,
      inline.before,
      inline.after,
      inline.placeholder,
    );
  if (format === "heading-1") return heading(text, selection, 1);
  if (format === "heading-2") return heading(text, selection, 2);
  if (format === "code-block") return codeBlock(text, selection);
  if (format === "quote") return prefixLines(text, selection, "> ", /^>\s?/);
  if (format === "bullet-list")
    return prefixLines(text, selection, "- ", /^\s*[-+*]\s+/);
  return prefixLines(text, selection, "1. ", /^\s*\d+[.)]\s+/);
}

export function activeMarkdownFormats(
  text: string,
  selection: MarkdownSelection,
): Set<MarkdownFormat> {
  const active = new Set<MarkdownFormat>();
  const { from, to } = selection;
  const selected = text.slice(from, to);
  const { start } = selectedLineBounds(text, selection);
  const lineBeforeCursor = text.slice(start, from);
  const line = text.slice(
    start,
    text.indexOf("\n", from) === -1 ? text.length : text.indexOf("\n", from),
  );

  if (/^#\s/.test(line)) active.add("heading-1");
  if (/^##\s/.test(line)) active.add("heading-2");
  if (/^>\s?/.test(line)) active.add("quote");
  if (/^\s*[-+*]\s+/.test(line)) active.add("bullet-list");
  if (/^\s*\d+[.)]\s+/.test(line)) active.add("ordered-list");

  for (const [format, markers] of Object.entries(inlineFormats) as Array<
    [MarkdownFormat, NonNullable<(typeof inlineFormats)[MarkdownFormat]>]
  >) {
    if (
      (selected.startsWith(markers.before) &&
        selected.endsWith(markers.after)) ||
      (from >= markers.before.length &&
        text.slice(0, from).lastIndexOf(markers.before) >
          text.slice(0, from).lastIndexOf("\n") &&
        text.indexOf(markers.after, to) !== -1)
    )
      active.add(format);
  }

  const fencesBefore = text.slice(0, from).match(/^```/gm)?.length ?? 0;
  if (fencesBefore % 2 === 1 || /^```/.test(lineBeforeCursor))
    active.add("code-block");
  return active;
}

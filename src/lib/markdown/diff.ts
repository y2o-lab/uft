export type DiffKind = "added" | "equal" | "removed";

export type DiffLine = {
  kind: DiffKind;
  content: string;
  oldLine: number | null;
  newLine: number | null;
};

export type DiffSummary = {
  additions: number;
  removals: number;
  unchanged: number;
};

const maxComparisonCells = 1_000_000;

function splitLines(markdown: string): string[] {
  return markdown.replace(/\r\n/g, "\n").split("\n");
}

function replacementDiff(before: string[], after: string[]): DiffLine[] {
  return [
    ...before.map((content, index) => ({
      kind: "removed" as const,
      content,
      oldLine: index + 1,
      newLine: null,
    })),
    ...after.map((content, index) => ({
      kind: "added" as const,
      content,
      oldLine: null,
      newLine: index + 1,
    })),
  ];
}

/**
 * Produces a stable, line-oriented Markdown diff. For unusually large inputs,
 * it falls back to a replacement block instead of allocating an unbounded matrix.
 */
export function diffMarkdown(
  beforeMarkdown: string,
  afterMarkdown: string,
): DiffLine[] {
  const before = splitLines(beforeMarkdown);
  const after = splitLines(afterMarkdown);

  if (before.length * after.length > maxComparisonCells)
    return replacementDiff(before, after);

  const width = after.length + 1;
  const matrix = new Uint32Array((before.length + 1) * width);
  const at = (row: number, column: number) => row * width + column;

  for (
    let beforeIndex = before.length - 1;
    beforeIndex >= 0;
    beforeIndex -= 1
  ) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      matrix[at(beforeIndex, afterIndex)] =
        before[beforeIndex] === after[afterIndex]
          ? matrix[at(beforeIndex + 1, afterIndex + 1)] + 1
          : Math.max(
              matrix[at(beforeIndex + 1, afterIndex)],
              matrix[at(beforeIndex, afterIndex + 1)],
            );
    }
  }

  const lines: DiffLine[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length && afterIndex < after.length) {
    if (before[beforeIndex] === after[afterIndex]) {
      lines.push({
        kind: "equal",
        content: before[beforeIndex],
        oldLine: beforeIndex + 1,
        newLine: afterIndex + 1,
      });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (
      matrix[at(beforeIndex + 1, afterIndex)] >=
      matrix[at(beforeIndex, afterIndex + 1)]
    ) {
      lines.push({
        kind: "removed",
        content: before[beforeIndex],
        oldLine: beforeIndex + 1,
        newLine: null,
      });
      beforeIndex += 1;
    } else {
      lines.push({
        kind: "added",
        content: after[afterIndex],
        oldLine: null,
        newLine: afterIndex + 1,
      });
      afterIndex += 1;
    }
  }

  while (beforeIndex < before.length) {
    lines.push({
      kind: "removed",
      content: before[beforeIndex],
      oldLine: beforeIndex + 1,
      newLine: null,
    });
    beforeIndex += 1;
  }
  while (afterIndex < after.length) {
    lines.push({
      kind: "added",
      content: after[afterIndex],
      oldLine: null,
      newLine: afterIndex + 1,
    });
    afterIndex += 1;
  }
  return lines;
}

export function summarizeDiff(lines: DiffLine[]): DiffSummary {
  return lines.reduce<DiffSummary>(
    (summary, line) => {
      if (line.kind === "added") summary.additions += 1;
      else if (line.kind === "removed") summary.removals += 1;
      else summary.unchanged += 1;
      return summary;
    },
    { additions: 0, removals: 0, unchanged: 0 },
  );
}

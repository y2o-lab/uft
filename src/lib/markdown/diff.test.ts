import { describe, expect, it } from "vitest";
import { diffMarkdown, summarizeDiff } from "./diff";

describe("Markdown diff", () => {
  it("marks inserted, removed, and unchanged Markdown lines with line numbers", () => {
    const lines = diffMarkdown(
      "# Plan\n\n- Draft\n- Remove",
      "# Plan\n\n- Draft\n- Review",
    );

    expect(lines).toEqual([
      { kind: "equal", content: "# Plan", oldLine: 1, newLine: 1 },
      { kind: "equal", content: "", oldLine: 2, newLine: 2 },
      { kind: "equal", content: "- Draft", oldLine: 3, newLine: 3 },
      { kind: "removed", content: "- Remove", oldLine: 4, newLine: null },
      { kind: "added", content: "- Review", oldLine: null, newLine: 4 },
    ]);
    expect(summarizeDiff(lines)).toEqual({
      additions: 1,
      removals: 1,
      unchanged: 3,
    });
  });

  it("normalizes Windows line endings and reports identical documents as unchanged", () => {
    const lines = diffMarkdown("# Title\r\n\r\nBody", "# Title\n\nBody");

    expect(lines.every((line) => line.kind === "equal")).toBe(true);
    expect(summarizeDiff(lines)).toEqual({
      additions: 0,
      removals: 0,
      unchanged: 3,
    });
  });
});

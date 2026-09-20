import { describe, expect, it } from "vitest";
import { activeMarkdownFormats, applyMarkdownFormat } from "./formatting";

describe("Markdown formatting", () => {
  it("wraps a selection and keeps its contents selected", () => {
    expect(
      applyMarkdownFormat("Write clearly", { from: 6, to: 13 }, "bold"),
    ).toEqual({
      text: "Write **clearly**",
      from: 8,
      to: 15,
    });
  });

  it("creates a selected placeholder for continued styled input", () => {
    expect(
      applyMarkdownFormat("Text ", { from: 5, to: 5 }, "inline-code"),
    ).toEqual({
      text: "Text `code`",
      from: 6,
      to: 10,
    });
  });

  it("moves the caret out of an active inline style when toggled", () => {
    expect(applyMarkdownFormat("**bold**", { from: 4, to: 4 }, "bold")).toEqual(
      {
        text: "**bold**",
        from: 8,
        to: 8,
      },
    );
  });

  it("applies and removes headings from the current line", () => {
    const applied = applyMarkdownFormat(
      "Title\nBody",
      { from: 2, to: 2 },
      "heading-1",
    );
    expect(applied).toEqual({ text: "# Title\nBody", from: 4, to: 4 });
    expect(
      applyMarkdownFormat(applied.text, { from: 4, to: 4 }, "heading-1"),
    ).toEqual({
      text: "Title\nBody",
      from: 2,
      to: 2,
    });
  });

  it("wraps a selection in a fenced code block", () => {
    const result = applyMarkdownFormat(
      "before\nconst n = 1;\nafter",
      { from: 7, to: 19 },
      "code-block",
    );
    expect(result.text).toBe("before\n```\nconst n = 1;\n```\nafter");
    expect(result.text.slice(result.from, result.to)).toBe("const n = 1;");
  });

  it("reports active block and inline formats at the cursor", () => {
    const text = "## A **bold** value";
    const active = activeMarkdownFormats(text, { from: 9, to: 9 });
    expect(active).toContain("heading-2");
    expect(active).toContain("bold");
  });
});

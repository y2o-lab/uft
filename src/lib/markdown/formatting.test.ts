import { describe, expect, it } from "vitest";
import { activeMarkdownFormats, applyMarkdownFormat } from "./formatting";

describe("Markdown formatting", () => {
  it("inserts an empty task with the caret ready for typing", () => {
    expect(applyMarkdownFormat("", { from: 0, to: 0 }, "task-list")).toEqual({
      text: "- [ ] ",
      from: 6,
      to: 6,
    });
    expect(
      applyMarkdownFormat("\nNext", { from: 0, to: 0 }, "task-list"),
    ).toEqual({ text: "- [ ] \nNext", from: 6, to: 6 });
  });

  it("converts the current line and keeps the caret in its text", () => {
    expect(
      applyMarkdownFormat("Task\nOther", { from: 2, to: 2 }, "task-list"),
    ).toEqual({ text: "- [ ] Task\nOther", from: 8, to: 8 });
  });

  it("converts lists without duplicating markers or losing indentation or checked state", () => {
    const text = "- First\n  2. Nested\n+ [X] Done\nPlain";
    const result = applyMarkdownFormat(
      text,
      { from: 0, to: text.length },
      "task-list",
    );
    expect(result.text).toBe(
      "- [ ] First\n  - [ ] Nested\n+ [X] Done\n- [ ] Plain",
    );
    expect(result.text.slice(result.from, result.to)).toBe(result.text);
    expect(applyMarkdownFormat(result.text, result, "task-list").text).toBe(
      "- First\n  - Nested\n- Done\n- Plain",
    );
  });

  it("does not change the next line when selection ends at its start", () => {
    expect(
      applyMarkdownFormat("First\nOther", { from: 0, to: 6 }, "task-list"),
    ).toEqual({ text: "- [ ] First\nOther", from: 0, to: 11 });
  });

  it("removes a checked task marker while preserving the caret", () => {
    expect(
      applyMarkdownFormat("  - [x] Done", { from: 10, to: 10 }, "task-list"),
    ).toEqual({ text: "  - Done", from: 6, to: 6 });
  });

  it.each(["- [ ] Task", "+ [x] Task", "  * [X] Task", "1. [ ] Task"])(
    "reports task format for %s",
    (text) => {
      expect(
        activeMarkdownFormats(text, { from: text.length, to: text.length }),
      ).toContain("task-list");
    },
  );

  it.each(["- Plain", "- [no] Task", "[ ] Plain"])(
    "does not report task format for %s",
    (text) => {
      expect(
        activeMarkdownFormats(text, { from: text.length, to: text.length }),
      ).not.toContain("task-list");
    },
  );

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

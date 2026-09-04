import { describe, expect, it } from "vitest";
import { countMarkdownCharacters } from "./character-count";

describe("countMarkdownCharacters", () => {
  it("counts Markdown syntax, whitespace, line breaks, and Unicode characters", () => {
    expect(countMarkdownCharacters("# 日本語🙂\n\ntext")).toBe(12);
  });
});

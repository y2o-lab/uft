import { describe, expect, it } from "vitest";
import { mermaidBlocks, relativeAssetPath, renderMarkdown } from "./preview";

describe("Markdown preview", () => {
  it("sanitizes script and unsafe links", async () => {
    const html = await renderMarkdown(
      "<script>alert(1)</script>\n\n[bad](javascript:alert(1))",
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("javascript:");
  });
  it("finds Mermaid blocks and resolves relative assets", () => {
    expect(mermaidBlocks("```mermaid\ngraph LR\n``` ")).toHaveLength(1);
    expect(relativeAssetPath("docs/a/guide.md", "assets/image.png")).toBe(
      "../../assets/image.png",
    );
  });
  it("renders image paths containing spaces when they use Markdown angle brackets", async () => {
    const html = await renderMarkdown(
      "![System flow](<../assets/diagrams/System flow.svg>)",
    );
    expect(html).toContain(
      '<img src="../assets/diagrams/System%20flow.svg" alt="System flow"',
    );
  });
});

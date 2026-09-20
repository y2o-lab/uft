// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { previewToMarkdown } from "./preview-to-markdown";

describe("editable Markdown preview", () => {
  it("turns edited preview blocks back into GFM", () => {
    const preview = document.createElement("article");
    preview.innerHTML = `
      <h1>Edited title</h1>
      <p>A <strong>local</strong> document with <del>old</del> text.</p>
      <ul><li>First</li><li>Second</li></ul>
      <table><thead><tr><th>Name</th><th>State</th></tr></thead><tbody><tr><td>Preview</td><td>Editable</td></tr></tbody></table>
      <pre><code class="language-ts">const enabled = true;\n</code></pre>
    `;

    const markdown = previewToMarkdown(preview);

    expect(markdown).toContain("# Edited title");
    expect(markdown).toContain("A **local** document with ~old~ text.");
    expect(markdown).toContain("-   First");
    expect(markdown).toContain("| Name | State |");
    expect(markdown).toContain("```ts\nconst enabled = true;\n```");
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("keeps original asset paths and Mermaid source instead of preview output", () => {
    const preview = document.createElement("article");
    preview.innerHTML = `
      <p><img src="blob:http://localhost/rendered" data-markdown-src="../assets/System flow.svg" alt="System flow"></p>
      <figure class="mermaid-diagram" data-mermaid-source="graph LR&#10;A--&gt;B"><svg><path></path></svg></figure>
      <p class="diagram-error" data-preview-only>Mermaid error shown only in Preview</p>
    `;

    const markdown = previewToMarkdown(preview);

    expect(markdown).toContain("![System flow](<../assets/System flow.svg>)");
    expect(markdown).not.toContain("blob:");
    expect(markdown).toContain("```mermaid\ngraph LR\nA-->B\n```");
    expect(markdown).not.toContain("<svg");
    expect(markdown).not.toContain("Mermaid error");
  });
});

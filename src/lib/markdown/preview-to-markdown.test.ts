// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./preview";
import { previewToMarkdown } from "./preview-to-markdown";

describe("editable Markdown preview", () => {
  it("preserves toggled tasks in both tight and loose lists", async () => {
    const preview = document.createElement("article");
    preview.innerHTML = await renderMarkdown(
      "- [ ] tight\n  - [x] nested\n\n* [ ] loose\n\n  Another paragraph.\n\n* [x] done\n",
    );
    const checkboxes = preview.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    checkboxes[0].checked = true;
    checkboxes[1].checked = false;
    checkboxes[2].checked = true;
    checkboxes[3].checked = false;
    const markdown = previewToMarkdown(preview);
    expect(markdown).toMatch(/\[x\]\s+tight/);
    expect(markdown).toMatch(/\[ \]\s+nested/);
    expect(markdown).toMatch(/\[x\]\s+loose/);
    expect(markdown).toMatch(/\[ \]\s+done/);
    expect(markdown).toContain("Another paragraph.");
  });
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

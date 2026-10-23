// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { decorateListHandles, moveListItem } from "./list-reordering";
import { renderMarkdown } from "./preview";
import { previewToMarkdown } from "./preview-to-markdown";

describe("preview list reordering", () => {
  it("moves complete items with nested lists, formatting, paragraphs and task state", async () => {
    const host = document.createElement("article");
    host.innerHTML = await renderMarkdown(
      "- [x] **Parent**\n\n  Paragraph.\n\n  - [ ] Child\n\n- [ ] Other\n",
    );
    const [parent, other] =
      host.querySelectorAll<HTMLLIElement>(":scope > ul > li");
    decorateListHandles(host, true);
    expect(host.querySelectorAll("[data-list-handle]")).toHaveLength(3);
    expect(moveListItem(host, parent, other, true)).toBe(true);
    const markdown = previewToMarkdown(host);
    expect(markdown.indexOf("Other")).toBeLessThan(markdown.indexOf("Parent"));
    expect(markdown).toMatch(/\[x\]\s+\*\*Parent\*\*/);
    expect(markdown).toContain("Paragraph.");
    expect(markdown).toMatch(/\[ \]\s+Child/);
    expect(markdown).not.toContain("リスト項目を移動");
    expect(markdown).not.toContain("button");
    decorateListHandles(host, false);
    expect(host.querySelectorAll("[data-list-handle]")).toHaveLength(0);
  });

  it("moves between lists and removes an emptied source list", () => {
    const host = document.createElement("article");
    host.innerHTML =
      "<ul><li>A</li></ul><ol start='3'><li>B</li><li>C</li></ol>";
    const [a, b, c] = host.querySelectorAll("li");
    expect(moveListItem(host, a, b, true)).toBe(true);
    expect(host.querySelector("ul")).toBeNull();
    expect(
      [...host.querySelectorAll("ol > li")].map((item) => item.textContent),
    ).toEqual(["B", "A", "C"]);
    expect(previewToMarkdown(host)).toMatch(/3\.\s+B\n4\.\s+A\n5\.\s+C/);
    expect(moveListItem(host, c, b, false)).toBe(true);
  });

  it("moves a nested item out beside its parent without losing either item", () => {
    const host = document.createElement("article");
    host.innerHTML =
      "<ul><li>Parent<ul><li>Child</li></ul></li><li>Other</li></ul>";
    const [parent, child] = host.querySelectorAll("li");
    expect(moveListItem(host, child, parent, true)).toBe(true);
    expect(
      [...host.querySelectorAll(":scope > ul > li")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Parent", "Child", "Other"]);
    expect(parent.querySelector("ul")).toBeNull();
  });

  it("rejects cycles, self drops, outside nodes and unchanged positions", () => {
    const host = document.createElement("article");
    host.innerHTML = "<ul><li>A<ul><li>Child</li></ul></li><li>B</li></ul>";
    const [a, child, b] = host.querySelectorAll("li");
    const original = host.innerHTML;
    expect(moveListItem(host, a, child, false)).toBe(false);
    expect(moveListItem(host, a, a, true)).toBe(false);
    expect(moveListItem(host, a, b, false)).toBe(false);
    expect(moveListItem(host, document.createElement("li"), b, true)).toBe(
      false,
    );
    expect(host.innerHTML).toBe(original);
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findTextMatches, previewSearchRanges } from "./document-search";

describe("document search", () => {
  it("finds literal Japanese, case-insensitive text and escaped metacharacters", () => {
    expect(findTextMatches("検索 test TEST 検索", "検索")).toEqual([
      { from: 0, to: 2 },
      { from: 13, to: 15 },
    ]);
    expect(findTextMatches("Test TEST", "test")).toHaveLength(2);
    expect(findTextMatches("a.* aXX", ".*")).toEqual([{ from: 1, to: 3 }]);
    expect(findTextMatches("anything", "")).toEqual([]);
  });

  it("keeps source offsets after Unicode characters with expanding lowercase", () => {
    expect(findTextMatches("İ 😀 target", "target")).toEqual([
      { from: 5, to: 11 },
    ]);
  });

  it("searches across inline formatting without changing the editable DOM", () => {
    const host = document.createElement("div");
    host.innerHTML =
      "<p>検索<strong>対象</strong>の文書</p><p>検索対象</p><p data-preview-only>検索対象</p>";
    const before = host.innerHTML;
    const ranges = previewSearchRanges(host, "検索対象");
    expect(ranges.map((range) => range.toString())).toEqual([
      "検索対象",
      "検索対象",
    ]);
    expect(host.innerHTML).toBe(before);
    expect(previewSearchRanges(host, "文書検索")).toHaveLength(0);
  });
});

it("keeps nested block matches in document order and separates surrounding text", () => {
  const host = document.createElement("div");
  host.innerHTML =
    "<ul><li>before target<pre><code>nested target</code></pre>after target</li></ul>";
  const ranges = previewSearchRanges(host, "target");
  expect(ranges.map((range) => range.startContainer.textContent)).toEqual([
    "before target",
    "nested target",
    "after target",
  ]);
  expect(ranges.map((range) => range.toString())).toEqual([
    "target",
    "target",
    "target",
  ]);
  expect(previewSearchRanges(host, "targetafter")).toHaveLength(0);
});

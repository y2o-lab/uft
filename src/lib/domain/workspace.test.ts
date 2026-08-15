import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "./workspace";

describe("defaultWorkspace", () => {
  it("starts with a Markdown document in docs", () => {
    expect(
      defaultWorkspace.entries.find((entry) => entry.id === "overview")?.path,
    ).toBe("docs/overview.md");
  });
});

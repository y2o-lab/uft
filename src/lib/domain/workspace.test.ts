import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "./workspace";

describe("defaultWorkspace", () => {
  it("starts with a Markdown document in docs", () => {
    expect(defaultWorkspace.files[0]?.path).toBe("docs/overview.md");
  });
});

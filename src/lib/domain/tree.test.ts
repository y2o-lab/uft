import { describe, expect, it } from "vitest";
import {
  canMoveEntry,
  childPath,
  normalizePath,
  validateName,
  WorkspacePathError,
} from "./tree";
import { cloneWorkspace, defaultWorkspace } from "./workspace";

describe("workspace paths", () => {
  it("normalizes safe relative paths", () => {
    expect(normalizePath("docs\\guide.md")).toBe("docs/guide.md");
    expect(
      childPath(
        defaultWorkspace.entries[0] ?? {
          id: "docs",
          workspaceId: "default",
          parentId: null,
          kind: "folder",
          name: "docs",
          path: "docs",
          sortOrder: 0,
          createdAt: "",
          updatedAt: "",
          deletedAt: null,
        },
        "guide.md",
      ),
    ).toBe("docs/guide.md");
  });

  it("rejects traversal and invalid names", () => {
    expect(() => normalizePath("../secret")).toThrow(WorkspacePathError);
    expect(() => validateName("nested/file.md")).toThrow(WorkspacePathError);
  });

  it("does not allow moving an entry into itself", () => {
    const workspace = cloneWorkspace(defaultWorkspace);
    expect(canMoveEntry(workspace, "docs", "docs")).toBe(false);
  });
});

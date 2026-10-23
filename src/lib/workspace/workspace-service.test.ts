import { afterEach, describe, expect, it, vi } from "vitest";
import { findEntry } from "../domain/tree";
import { cloneWorkspace, defaultWorkspace } from "../domain/workspace";
import {
  createEntry,
  moveEntry,
  renameEntry,
  restoreEntries,
  softDeleteEntry,
} from "./workspace-service";
import { mergeWorkspaces } from "./workspace-sync";

afterEach(() => vi.useRealTimers());

function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T00:00:00.000Z"));
  const workspace = cloneWorkspace(defaultWorkspace);
  const folder = createEntry(workspace, "folder", "docs", "moved");
  const nested = createEntry(workspace, "folder", folder.id, "nested");
  const file = createEntry(workspace, "markdown", nested.id, "keep.md");
  const diagram = createEntry(workspace, "diagram", folder.id, "diagram");
  return { workspace, folder, nested, file, diagram };
}

describe("folder mutations across save merges", () => {
  it("keeps a moved subtree after saving and deleting its old parent in the same millisecond", () => {
    const { workspace, folder, nested, file, diagram } = fixture();
    const persisted = cloneWorkspace(workspace);
    moveEntry(workspace, folder.id, null);
    const saved = mergeWorkspaces(persisted, workspace);

    expect(findEntry(saved, folder.id).path).toBe("moved");
    expect(findEntry(saved, nested.id).path).toBe("moved/nested");
    expect(findEntry(saved, file.id).path).toBe("moved/nested/keep.md");
    expect(findEntry(saved, diagram.id).path).toBe("moved/diagram");
    for (const entry of [folder, nested, file, diagram]) {
      expect(findEntry(saved, entry.id).updatedAt > entry.createdAt).toBe(true);
    }

    const deleted = softDeleteEntry(saved, "docs");
    expect(deleted.map((entry) => entry.id)).toEqual(["docs", "overview"]);
    const reloaded = mergeWorkspaces(persisted, saved);
    for (const entry of [folder, nested, file, diagram]) {
      expect(findEntry(reloaded, entry.id).deletedAt).toBeNull();
    }
    expect(reloaded.documents[file.id]).toEqual(persisted.documents[file.id]);
    expect(reloaded.diagrams[diagram.id]).toEqual(
      persisted.diagrams[diagram.id],
    );
  });

  it("keeps renamed descendant paths across repeated same-millisecond saves", () => {
    const { workspace, folder, file } = fixture();
    const persisted = cloneWorkspace(workspace);
    renameEntry(workspace, folder.id, "first");
    const saved = mergeWorkspaces(persisted, workspace);
    renameEntry(saved, folder.id, "second");
    const reloaded = mergeWorkspaces(workspace, saved);
    expect(findEntry(reloaded, folder.id).path).toBe("docs/second");
    expect(findEntry(reloaded, file.id).path).toBe(
      "docs/second/nested/keep.md",
    );
  });

  it("uses parent relationships to delete even when legacy paths are stale", () => {
    const { workspace, folder, nested, file, diagram } = fixture();
    // Reproduce an older client's partial move: only the folder path changed.
    folder.parentId = null;
    folder.path = "moved";
    expect(softDeleteEntry(workspace, "docs").map((entry) => entry.id)).toEqual(
      ["docs", "overview"],
    );
    const beforeDelete = cloneWorkspace(workspace);
    const deleted = softDeleteEntry(workspace, folder.id);
    expect(new Set(deleted.map((entry) => entry.id))).toEqual(
      new Set([folder.id, nested.id, file.id, diagram.id]),
    );
    const savedDeletion = mergeWorkspaces(beforeDelete, workspace);
    expect(
      savedDeletion.entries.find((entry) => entry.id === file.id)?.deletedAt,
    ).not.toBeNull();
    restoreEntries(
      savedDeletion,
      deleted.map((entry) => entry.id),
    );
    const restored = mergeWorkspaces(workspace, savedDeletion);
    for (const entry of [folder, nested, file, diagram]) {
      expect(findEntry(restored, entry.id).deletedAt).toBeNull();
    }
  });
});

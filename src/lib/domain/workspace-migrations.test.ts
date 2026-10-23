import { describe, expect, it } from "vitest";
import { createEntry, softDeleteEntry } from "../workspace/workspace-service";
import { mergeWorkspaces } from "../workspace/workspace-sync";
import legacyWorkspace from "./fixtures/workspace-v1.json";
import { findEntry } from "./tree";
import { cloneWorkspace, defaultWorkspace, type Workspace } from "./workspace";
import {
  migrateWorkspace,
  WorkspaceMigrationError,
} from "./workspace-migrations";

describe("migrateWorkspace", () => {
  it("upgrades the version 1 fixture without losing workspace content", () => {
    const result = migrateWorkspace(legacyWorkspace as Workspace);

    expect(result).toMatchObject({
      fromVersion: 1,
      toVersion: 2,
      migrated: true,
    });
    expect(result.workspace.documents["legacy-document"]?.content).toBe(
      "# Retained content",
    );
    expect(result.workspace.entries[0]?.path).toBe("notes.md");
    expect(legacyWorkspace.schemaVersion).toBe(1);
  });

  it("leaves the current schema unchanged", () => {
    const current = migrateWorkspace({
      ...legacyWorkspace,
      schemaVersion: 2,
    } as Workspace);

    expect(current.migrated).toBe(false);
    expect(current.workspace.schemaVersion).toBe(2);
  });

  it("does not open data created by a future frontend", () => {
    expect(() =>
      migrateWorkspace({ ...legacyWorkspace, schemaVersion: 3 } as Workspace),
    ).toThrow(WorkspaceMigrationError);
  });
});

// Historical snapshots are kept in the existing schema; the original object
// must remain intact so the session can back it up before persisting repairs.
describe("legacy entry path repair", () => {
  it("repairs moved descendants without changing IDs, content, or the schema", () => {
    const original = cloneWorkspace(defaultWorkspace);
    const nested = createEntry(original, "folder", "docs", "nested");
    const file = createEntry(original, "markdown", nested.id, "keep.md");
    const diagram = createEntry(original, "diagram", nested.id, "diagram");
    const deleted = createEntry(original, "markdown", nested.id, "deleted.md");
    softDeleteEntry(original, deleted.id);
    // The original folder was renamed, but old clients reverted child paths.
    const docs = findEntry(original, "docs");
    docs.name = "renamed";
    docs.path = "renamed";
    // Repairs must also supersede timestamps ahead of the current clock.
    file.updatedAt = "2099-01-01T00:00:00.000Z";
    const before = cloneWorkspace(original);
    const result = migrateWorkspace(original);

    expect(result).toMatchObject({
      fromVersion: 2,
      toVersion: 2,
      migrated: true,
      pathsRepaired: true,
    });
    expect(findEntry(result.workspace, nested.id).path).toBe("renamed/nested");
    expect(findEntry(result.workspace, file.id).path).toBe(
      "renamed/nested/keep.md",
    );
    expect(findEntry(result.workspace, diagram.id).path).toBe(
      "renamed/nested/diagram",
    );
    expect(
      findEntry(result.workspace, file.id).updatedAt > file.updatedAt,
    ).toBe(true);
    expect(
      result.workspace.entries.find((entry) => entry.id === deleted.id),
    ).toEqual(deleted);
    expect(result.workspace.documents).toEqual(before.documents);
    expect(result.workspace.diagrams).toEqual(before.diagrams);
    expect(result.workspace.assets).toEqual(before.assets);
    expect(original).toEqual(before);
    expect(migrateWorkspace(result.workspace).migrated).toBe(false);
    expect(
      findEntry(mergeWorkspaces(before, result.workspace), file.id).path,
    ).toBe("renamed/nested/keep.md");
  });

  it("does not guess parents or revive deleted entries in damaged trees", () => {
    const original = cloneWorkspace(defaultWorkspace);
    const deletedParent = createEntry(original, "folder", null, "deleted");
    const orphan = createEntry(
      original,
      "markdown",
      deletedParent.id,
      "orphan.md",
    );
    deletedParent.deletedAt = deletedParent.updatedAt;
    const cycleA = createEntry(original, "folder", null, "a");
    const cycleB = createEntry(original, "folder", cycleA.id, "b");
    cycleA.parentId = cycleB.id;
    orphan.path = "stale/orphan.md";
    const before = cloneWorkspace(original);

    const result = migrateWorkspace(original);
    expect(result.migrated).toBe(false);
    expect(result.workspace).toEqual(before);
  });
});

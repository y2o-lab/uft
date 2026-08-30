import { describe, expect, it } from "vitest";
import legacyWorkspace from "./fixtures/workspace-v1.json";
import type { Workspace } from "./workspace";
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

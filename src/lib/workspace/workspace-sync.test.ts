import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneWorkspace, defaultWorkspace } from "../domain/workspace";
import {
  createEntry,
  restoreEntries,
  softDeleteEntry,
  updateDocument,
} from "./workspace-service";
import { mergeWorkspaces } from "./workspace-sync";

afterEach(() => vi.useRealTimers());

describe("mergeWorkspaces", () => {
  it("keeps independent changes made by two browser tabs", () => {
    const persisted = cloneWorkspace(defaultWorkspace);
    const local = cloneWorkspace(defaultWorkspace);
    updateDocument(local, "overview", "# Local change");
    const localOverview = local.documents.overview;
    if (!localOverview) throw new Error("Overview document is missing.");
    localOverview.updatedAt = "2026-01-02T00:00:00.000Z";

    const remoteEntry = createEntry(persisted, "markdown", "docs", "remote.md");
    updateDocument(persisted, remoteEntry.id, "# Remote change");
    const remoteDocument = persisted.documents[remoteEntry.id];
    if (!remoteDocument) throw new Error("Remote document is missing.");
    remoteDocument.updatedAt = "2026-01-03T00:00:00.000Z";

    const merged = mergeWorkspaces(persisted, local);

    expect(merged.documents.overview?.content).toBe("# Local change");
    expect(merged.documents[remoteEntry.id]?.content).toBe("# Remote change");
    expect(merged.entries.some((entry) => entry.id === remoteEntry.id)).toBe(
      true,
    );
  });

  it("uses the newest document version when both tabs change the same file", () => {
    const persisted = cloneWorkspace(defaultWorkspace);
    const local = cloneWorkspace(defaultWorkspace);
    updateDocument(persisted, "overview", "# Earlier");
    const persistedOverview = persisted.documents.overview;
    if (!persistedOverview) throw new Error("Overview document is missing.");
    persistedOverview.updatedAt = "2026-01-02T00:00:00.000Z";
    updateDocument(local, "overview", "# Later");
    const localOverview = local.documents.overview;
    if (!localOverview) throw new Error("Overview document is missing.");
    localOverview.updatedAt = "2026-01-03T00:00:00.000Z";

    expect(mergeWorkspaces(persisted, local).documents.overview?.content).toBe(
      "# Later",
    );
  });

  it("keeps an entry restored after its deletion was already saved", () => {
    vi.useFakeTimers();
    const local = cloneWorkspace(defaultWorkspace);

    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
    softDeleteEntry(local, "overview");
    const persistedDeletion = cloneWorkspace(local);

    // Deliberately restore within the same clock millisecond: restoration must
    // still win over the saved tombstone when the save snapshots are merged.
    restoreEntries(local, ["overview"]);

    const merged = mergeWorkspaces(persistedDeletion, local);
    expect(
      merged.entries.find((entry) => entry.id === "overview")?.deletedAt,
    ).toBeNull();
  });
});

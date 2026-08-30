import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  type Asset,
  cloneWorkspace,
  defaultWorkspace,
} from "../domain/workspace";
import { createEntry } from "../workspace/workspace-service";
import {
  exportWorkspace,
  importWorkspace,
  MAX_UNZIPPED_BYTES,
  MAX_ZIP_ENTRIES,
} from "./workspace-zip";

function withDeclaredUnzippedSize(
  archive: Uint8Array,
  size: number,
): Uint8Array {
  const altered = archive.slice();
  for (let index = 0; index <= altered.byteLength - 4; index += 1) {
    if (
      altered[index] === 0x50 &&
      altered[index + 1] === 0x4b &&
      altered[index + 2] === 0x01 &&
      altered[index + 3] === 0x02
    ) {
      new DataView(
        altered.buffer,
        altered.byteOffset,
        altered.byteLength,
      ).setUint32(index + 24, size, true);
      return altered;
    }
  }
  throw new Error("ZIP central directory was not found");
}

describe("ZIP import guardrails", () => {
  it("has a bounded entry limit", () =>
    expect(MAX_ZIP_ENTRIES).toBeGreaterThan(0));

  it("rejects an oversized entry before allocating its declared output", async () => {
    const archive = withDeclaredUnzippedSize(
      zipSync({ "uft-manifest.json": strToU8("{}") }),
      MAX_UNZIPPED_BYTES + 1,
    );
    const bytes = archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength,
    ) as ArrayBuffer;

    await expect(
      importWorkspace(new Blob([bytes], { type: "application/zip" })),
    ).rejects.toThrow("ZIP の展開サイズが上限を超えています");
  });

  it("round-trips Markdown and assets through a validated manifest", async () => {
    const workspace = cloneWorkspace(defaultWorkspace);
    const plans = createEntry(workspace, "folder", null, "plans");
    createEntry(workspace, "folder", plans.id, "empty");
    createEntry(workspace, "diagram", plans.id, "System flow.v2");
    const asset: Asset = {
      id: "image",
      workspaceId: workspace.id,
      path: "assets/pixel.png",
      mediaType: "image/png",
      byteSize: 3,
      checksum: "ignored",
      createdAt: workspace.createdAt,
    };
    workspace.assets.push(asset);
    const diagram = Object.values(workspace.diagrams)[0];
    if (diagram) diagram.previewAssetId = asset.id;
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const repository = {
      mode: "indexeddb" as const,
      open: async () => workspace,
      listWorkspaces: async () => [],
      save: async () => undefined,
      putAsset: async () => undefined,
      getAsset: async (id: string) => (id === asset.id ? bytes : null),
      deleteAsset: async () => undefined,
      createMigrationSnapshot: async () => ({
        id: "snapshot",
        workspaceId: workspace.id,
        schemaVersion: workspace.schemaVersion,
        createdAt: workspace.createdAt,
        reason: "test",
      }),
      restoreMigrationSnapshot: async () => workspace,
    };
    const restored = await importWorkspace(
      await exportWorkspace(workspace, repository),
    );
    expect(Object.values(restored.workspace.documents)[0]?.content).toContain(
      "Overview",
    );
    expect(restored.workspace.assets[0]?.path).toBe("assets/pixel.png");
    expect(
      restored.binaries.get(restored.workspace.assets[0]?.id ?? ""),
    ).toBeDefined();
    expect(
      restored.workspace.entries.some(
        (entry) =>
          entry.kind === "diagram" && entry.path === "plans/System flow.v2",
      ),
    ).toBe(true);
    expect(
      restored.workspace.entries.some(
        (entry) => entry.kind === "folder" && entry.path === "plans/empty",
      ),
    ).toBe(true);
    expect(
      restored.workspace.entries.find((entry) => entry.path === "plans")
        ?.sortOrder,
    ).toBe(plans.sortOrder);
    expect(
      restored.workspace.entries.some((entry) => entry.path === "diagrams"),
    ).toBe(false);
    expect(
      restored.workspace.entries.some((entry) => entry.path === "assets"),
    ).toBe(false);
    expect(Object.values(restored.workspace.diagrams)[0]?.previewAssetId).toBe(
      restored.workspace.assets[0]?.id,
    );
    expect(restored.workspace.schemaVersion).toBe(workspace.schemaVersion);
  });

  it("rejects an export when an asset binary is unavailable", async () => {
    const workspace = cloneWorkspace(defaultWorkspace);
    workspace.assets.push({
      id: "missing-image",
      workspaceId: workspace.id,
      path: "assets/missing.png",
      mediaType: "image/png",
      byteSize: 3,
      checksum: "ignored",
      createdAt: workspace.createdAt,
    });
    const repository = {
      mode: "indexeddb" as const,
      open: async () => workspace,
      listWorkspaces: async () => [],
      save: async () => undefined,
      putAsset: async () => undefined,
      getAsset: async () => null,
      deleteAsset: async () => undefined,
      createMigrationSnapshot: async () => ({
        id: "snapshot",
        workspaceId: workspace.id,
        schemaVersion: workspace.schemaVersion,
        createdAt: workspace.createdAt,
        reason: "test",
      }),
      restoreMigrationSnapshot: async () => workspace,
    };

    await expect(exportWorkspace(workspace, repository)).rejects.toThrow(
      "アセットを読み出せませんでした: assets/missing.png",
    );
  });

  it("rejects archive entries that are absent from the manifest", async () => {
    const archive = zipSync({
      "uft-manifest.json": strToU8(
        JSON.stringify({
          formatVersion: 1,
          workspace: { name: "Unexpected file" },
          files: [],
        }),
      ),
      "unexpected.txt": strToU8("not described by the manifest"),
    });

    await expect(
      importWorkspace(new Blob([archive], { type: "application/zip" })),
    ).rejects.toThrow("マニフェストにない ZIP ファイルが含まれています");
  });
});

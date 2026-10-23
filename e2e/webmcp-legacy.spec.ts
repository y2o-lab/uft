import { expect, test } from "@playwright/test";
import { cloneWorkspace, defaultWorkspace } from "../src/lib/domain/workspace";

test("imports a real legacy OPFS SQLite workspace and asset into IndexedDB", async ({ page }) => {
  test.setTimeout(60_000);
  const legacy = cloneWorkspace(defaultWorkspace);
  legacy.id = "legacy-fixture"; legacy.name = "Legacy fixture";
  legacy.entries.forEach(entry => { entry.workspaceId = legacy.id; });
  legacy.documents.overview.content = "# Legacy imported\n\nRetained from SQLite.";
  legacy.assets = [{ id: "legacy-asset", workspaceId: legacy.id, path: "assets/legacy.bin", mediaType: "application/octet-stream", byteSize: 4, checksum: "fixture", createdAt: new Date(0).toISOString() }];
  // The launcher does not initialize IndexedDB. Write the old on-disk format
  // with the real legacy Worker, then unload its exclusive OPFS handle.
  await page.goto("/");
  await page.evaluate(async (workspace) => {
    const { createLegacyOpfsRepository } = await import("/src/lib/storage/workspace-repository.ts");
    const repository = createLegacyOpfsRepository();
    if (!repository) throw new Error("This test requires real OPFS support");
    await repository.save(workspace);
    await repository.putAsset(workspace.assets[0], new Uint8Array([1, 2, 3, 4]).buffer);
    const directory = await navigator.storage.getDirectory();
    await directory.getFileHandle("uft.sqlite3");
  }, legacy);
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toContainText("Legacy imported", { timeout: 30_000 });
  const imported = await page.evaluate(async () => {
    const { createWorkspaceRepository } = await import("/src/lib/storage/workspace-repository.ts");
    const repository = createWorkspaceRepository();
    const workspace = await repository.read("legacy-fixture");
    const bytes = await repository.getAsset("legacy-asset");
    return { content: workspace.documents.overview.content, mode: repository.mode, bytes: Array.from(new Uint8Array(bytes)) };
  });
  expect(imported).toEqual({ content: legacy.documents.overview.content, mode: "indexeddb", bytes: [1, 2, 3, 4] });
  await page.reload(); await expect(page.locator(".cm-content")).toContainText("Legacy imported");
});

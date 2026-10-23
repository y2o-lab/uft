import { expect, test, type Page } from "@playwright/test";
import { cloneWorkspace, defaultWorkspace, type Workspace } from "../src/lib/domain/workspace";
import { createEntry, softDeleteEntry } from "../src/lib/workspace/workspace-service";

async function save(page: Page): Promise<void> {
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".status")).toContainText("保存済み");
}

async function create(page: Page, kind: "フォルダ" | "文書", name: string): Promise<void> {
  await page.getByRole("button", { name: `新しい${kind}`, exact: true }).click();
  const input = page.locator("#text-input-dialog-value");
  await input.fill(name);
  await input.press("Enter");
  await save(page);
}

async function remove(page: Page, path: string): Promise<void> {
  await page.locator(`[data-entry-path="${path}"]`).click();
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click();
  await save(page);
}

async function readStore(page: Page, store: string): Promise<unknown[]> {
  return page.evaluate(async (store) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("uft-fallback", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result.map((value) => {
          // ArrayBuffers need explicit serialization across the browser boundary.
          if (value instanceof ArrayBuffer) return [...new Uint8Array(value)];
          if (value && typeof value === "object" && "workspace" in value) {
            return { ...value, assets: value.assets.map((asset: { bytes: ArrayBuffer }) => ({
              ...asset, bytes: [...new Uint8Array(asset.bytes)],
            })) };
          }
          return value;
        }));
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, store);
}

test("moved folder contents survive saving, deleting the old parent, and reloading", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();
  await create(page, "フォルダ", "moved");
  await create(page, "フォルダ", "nested");
  await create(page, "文書", "keep.md");
  await page.locator(".cm-content").fill("# Keep this content");
  await save(page);

  await page.locator('[data-entry-path="docs/moved"]').dragTo(
    page.getByRole("button", { name: "ワークスペースのルート", exact: true }),
  );
  await save(page);
  await expect(page.locator('[data-entry-path="moved/nested/keep.md"]')).toBeVisible();
  await remove(page, "docs");
  await page.reload();
  await page.locator('[data-entry-path="moved/nested/keep.md"]').click();
  await expect(page.locator(".cm-content")).toContainText("# Keep this content");

  // Deleting the new parent must still remove the entire subtree; undo must
  // recover the file and its content after another save/reload cycle.
  await remove(page, "moved");
  await expect(page.locator('[data-entry-path$="keep.md"]')).toHaveCount(0);
  await page.getByRole("button", { name: "削除しました。取り消す" }).click();
  await save(page);
  await page.reload();
  await page.locator('[data-entry-path="moved/nested/keep.md"]').click();
  await expect(page.locator(".cm-content")).toContainText("# Keep this content");
});

test("renamed folder descendant paths survive saving and reloading", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.locator('[data-entry-path="docs"]').click();
  await page.getByRole("button", { name: "名前変更", exact: true }).click();
  const input = page.locator("#text-input-dialog-value");
  await input.fill("renamed");
  await input.press("Enter");
  await save(page);
  await page.reload();
  await expect(page.locator('[data-entry-path="renamed/overview.md"]')).toBeVisible();
});

test("backs up and repairs existing schema-2 paths while preserving content and deletions", async ({ page }) => {
  const original = cloneWorkspace(defaultWorkspace);
  const folder = createEntry(original, "folder", "docs", "moved");
  const file = createEntry(original, "markdown", folder.id, "keep.md");
  const diagram = createEntry(original, "diagram", folder.id, "diagram");
  const deleted = createEntry(original, "markdown", folder.id, "deleted.md");
  softDeleteEntry(original, deleted.id);
  original.documents[file.id].content = "# Existing user data\n\n![image](assets/example.png)";
  const asset = {
    id: "existing-asset", workspaceId: original.id, path: "assets/example.png",
    mediaType: "image/png", byteSize: 3, checksum: "preserved", createdAt: original.createdAt,
  };
  original.assets.push(asset);
  // Simulate an old build's persisted partial move.
  folder.parentId = null;
  folder.path = "moved";
  await page.goto("/");
  await page.evaluate(async (workspace) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("uft-fallback", 2);
      request.onupgradeneeded = () => {
        for (const store of ["workspace", "metadata", "assets"]) {
          request.result.createObjectStore(store);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(["workspace", "metadata", "assets"], "readwrite");
      transaction.objectStore("workspace").put(workspace, workspace.id);
      transaction.objectStore("metadata").put(workspace.id, "activeWorkspaceId");
      transaction.objectStore("assets").put(new Uint8Array([1, 2, 3]).buffer, "existing-asset");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, original);

  await page.goto("/workspace");
  await expect(page.locator('[data-entry-path="moved/keep.md"]')).toBeVisible();
  const saved = (await readStore(page, "workspace"))[0] as Workspace;
  expect(saved.schemaVersion).toBe(2);
  expect(saved.documents).toEqual(original.documents);
  expect(saved.diagrams).toEqual(original.diagrams);
  expect(saved.assets).toEqual(original.assets);
  expect(saved.entries.find((entry) => entry.id === deleted.id)).toEqual(deleted);
  expect(saved.entries.find((entry) => entry.id === diagram.id)?.path).toBe("moved/diagram");
  const snapshots = (await readStore(page, "metadata")).filter(
    (value): value is { workspace: Workspace; assets: Array<{ bytes: number[] }> } =>
      typeof value === "object" && value !== null && "workspace" in value,
  );
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0].workspace).toEqual(original);
  expect(snapshots[0].assets[0].bytes).toEqual([1, 2, 3]);
  expect((await readStore(page, "assets"))[0]).toEqual([1, 2, 3]);

  await remove(page, "docs");
  await page.reload();
  await page.locator('[data-entry-path="moved/keep.md"]').click();
  await expect(page.locator(".cm-content")).toContainText("# Existing user data");
  const snapshotsAfterReload = (await readStore(page, "metadata")).filter(
    (value) => typeof value === "object" && value !== null && "workspace" in value,
  );
  expect(snapshotsAfterReload).toHaveLength(1);
});

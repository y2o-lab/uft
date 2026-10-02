import { expect, test, type Page } from "@playwright/test";
import type { ModelContextTool, ToolResult } from "../src/lib/webmcp/types";
import type { Workspace } from "../src/lib/domain/workspace";

declare global {
  interface Window {
    uftTools: Record<string, ModelContextTool>;
    uftRegistrations: number;
    uftController: AbortController;
    uftPending: Promise<ToolResult>;
  }
}
async function install(page: Page, fail = false) {
  await page.addInitScript(({ fail }) => {
    window.uftTools = {};
    window.uftRegistrations = 0;
    Object.defineProperty(document, "modelContext", { configurable: true, value: {
      registerTool: async (tool: ModelContextTool, options: { signal: AbortSignal }) => {
        if (fail && window.uftRegistrations === 2) throw new Error("simulated registration failure");
        window.uftRegistrations++;
        window.uftTools[tool.name] = tool;
        const remove = () => { if (window.uftTools[tool.name] === tool) delete window.uftTools[tool.name]; };
        options.signal.addEventListener("abort", remove, { once: true });
        if (options.signal.aborted) remove();
      },
    } });
  }, { fail });
}
async function enable(page: Page) {
  await page.goto("/workspace");
  await expect(page.getByRole("button", { name: "overview.md", exact: true })).toBeVisible();
  await page.locator(".ai-integration summary").click();
  await page.getByRole("checkbox", { name: "AI 連携を有効にする" }).check();
  await expect(page.getByText("5 ツール利用可能", { exact: true })).toBeVisible();
}
async function call(page: Page, name: string, input: Record<string, unknown>): Promise<any> {
  return page.evaluate(({ name, input }) => window.uftTools[name].execute(input, { signal: new AbortController().signal }), { name, input });
}
async function begin(page: Page, input: Record<string, unknown>) {
  await page.evaluate(input => {
    window.uftController = new AbortController();
    window.uftPending = window.uftTools.uft_update_document.execute(input, { signal: window.uftController.signal });
  }, input);
}
async function finish(page: Page) { return page.evaluate(() => window.uftPending) as Promise<any>; }
async function read(page: Page, entryId = "overview") { return call(page, "uft_read_document", { workspaceId: "default", entryId }); }
async function create(page: Page, name = "Agent", content = "# Before\n\nBody", requestId = "create") {
  return call(page, "uft_create_document", { workspaceId: "default", name, content, requestId });
}
async function edit(page: Page, content: string) {
  const editor = page.locator(".cm-content"); await editor.click(); await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.insertText(content);
}
async function stored(page: Page): Promise<Workspace> {
  return page.evaluate(() => new Promise<Workspace>((resolve, reject) => {
    const request = indexedDB.open("uft-fallback", 2);
    request.onsuccess = () => { const db = request.result; const tx = db.transaction("workspace"); const r = tx.objectStore("workspace").get("default"); r.onsuccess = () => { resolve(r.result); db.close(); }; r.onerror = () => reject(r.error); };
  }));
}
async function alterStored(page: Page, entryId: string, content: string, keepVersion = false) {
  await page.evaluate(({ entryId, content, keepVersion }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("uft-fallback", 2);
    request.onsuccess = () => { const db = request.result; const tx = db.transaction("workspace", "readwrite"); const store = tx.objectStore("workspace"); const r = store.get("default"); r.onsuccess = () => { const workspace = r.result as Workspace; workspace.documents[entryId].content = content; if (!keepVersion) { workspace.documents[entryId].updatedAt = new Date(Date.now() + 20).toISOString(); workspace.documents[entryId].revision++; } store.put(workspace, "default"); }; tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
  }), { entryId, content, keepVersion });
}

test("unsupported API leaves normal editing and saving operational", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(document, "modelContext", { value: undefined }));
  await page.goto("/workspace"); await page.locator(".ai-integration summary").click();
  await expect(page.getByRole("checkbox")).toBeDisabled();
  await edit(page, "# Manual works"); await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.locator(".cm-content")).toContainText("Manual works");
});
test("registration failure rolls back all tools and permits manual save", async ({ page }) => {
  await install(page, true); await page.goto("/workspace"); await page.locator(".ai-integration summary").click(); await page.getByRole("checkbox").check();
  await expect(page.getByText("登録失敗。通常編集を利用できます。", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(window.uftTools))).toEqual([]);
  await edit(page, "# After registration failure"); await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
});
test("tools are opt-in, stable while typing, removed on disable and other pages", async ({ page }) => {
  await install(page); await page.goto("/workspace"); await expect(page.locator(".cm-content")).toBeVisible(); expect(await page.evaluate(() => Object.keys(window.uftTools))).toHaveLength(0);
  await page.locator(".ai-integration summary").click(); await page.getByRole("checkbox").check(); await expect(page.getByText("5 ツール利用可能", { exact: true })).toBeVisible();
  await edit(page, "# Typing"); expect(await page.evaluate(() => window.uftRegistrations)).toBe(5);
  await page.getByRole("checkbox").uncheck(); expect(await page.evaluate(() => Object.keys(window.uftTools))).toHaveLength(0);
  await page.getByRole("checkbox").check(); await expect(page.getByText("5 ツール利用可能", { exact: true })).toBeVisible(); expect(await page.evaluate(() => window.uftRegistrations)).toBe(10);
  for (const path of ["/", "/convert-to-markdown", "/ip-toolkit"]) { await page.goto(path); expect(await page.evaluate(() => Object.keys(window.uftTools))).toHaveLength(0); }
});
test("five tools persist content, selection, preview, count and isolated Undo/Redo", async ({ page }) => {
  await install(page); await enable(page);
  const list = await call(page, "uft_list_documents", { workspaceId: "default" }); expect(list.data.documents[0].entryId).toBe("overview"); expect(list.data.folders[0].parentId).toBe("docs"); expect(list.data.documents[0]).not.toHaveProperty("content");
  const created = await create(page); expect(created.ok).toBe(true); const id = created.data.entryId;
  await expect(page.locator(".cm-content")).toContainText("Before");
  const before = await read(page, id); expect(before.data.versionToken).toBe(created.data.versionToken);
  await begin(page, { workspaceId: "default", entryId: id, versionToken: before.data.versionToken, content: "# After\n\nNew content", requestId: "update" });
  await expect(page.getByRole("dialog", { name: "AI による本文更新の確認" })).toBeVisible(); await expect(page.locator(".ai-diff")).toContainText("After");
  await page.getByRole("button", { name: "変更を適用", exact: true }).click(); const updated = await finish(page); expect(updated.ok).toBe(true);
  await expect(page.locator(".cm-content")).toContainText("After"); await expect(page.locator(".preview-pane h1")).toHaveText("After"); await expect(page.getByTestId("markdown-character-count")).toContainText("20");
  await page.locator(".cm-content").click(); await page.keyboard.press("ControlOrMeta+z"); await expect(page.locator(".cm-content")).toContainText("Before"); await expect(page.locator(".preview-pane h1")).toHaveText("Before");
  await page.keyboard.press("ControlOrMeta+Shift+z"); await expect(page.locator(".cm-content")).toContainText("After"); await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  await call(page, "uft_open_document", { workspaceId: "default", entryId: "overview" }); await expect(page.locator(".cm-content")).toContainText("Overview");
  await read(page, id); await expect(page.locator(".cm-content")).toContainText("Overview");
  await call(page, "uft_open_document", { workspaceId: "default", entryId: id }); await page.reload(); await expect(page.locator(".cm-content")).toContainText("After");
});
test("request IDs replay across reload, preserve later edits and reject changed input", async ({ page }) => {
  await install(page); await enable(page); const first = await create(page); const id = first.data.entryId;
  await edit(page, "# Later manual change"); await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  await enable(page); const replay = await call(page, "uft_create_document", { requestId: "create", content: "# Before\n\nBody", name: "Agent", workspaceId: "default" }); expect(replay.replayed).toBe(true); expect(replay.data.entryId).toBe(id); expect((await stored(page)).documents[id].content).toBe("# Later manual change");
  expect((await create(page, "Other", "body", "create")).error.code).toBe("REQUEST_ID_REUSED");
  expect((await call(page, "uft_list_documents", { workspaceId: "default" })).data.documents).toHaveLength(2);
});
test("reject, signal cancellation, disabling and manual edit during diff never commit", async ({ page }) => {
  await install(page); await enable(page); const state = await read(page);
  const input = { workspaceId: "default", entryId: "overview", versionToken: state.data.versionToken, content: "# Agent overwrite", requestId: "attempt" };
  await begin(page, input); await page.getByRole("button", { name: "キャンセル", exact: true }).click(); expect((await finish(page)).error.code).toBe("CANCELLED");
  await begin(page, input); await expect(page.locator(".ai-confirmation")).toBeVisible(); await page.evaluate(() => window.uftController.abort()); expect((await finish(page)).error.code).toBe("CANCELLED");
  await begin(page, input); await expect(page.locator(".ai-confirmation")).toBeVisible(); await edit(page, "# User editing during confirmation"); await page.getByRole("button", { name: "変更を適用", exact: true }).click(); expect((await finish(page)).error.code).toBe("CONFLICT");
  await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  const fresh = await read(page); await begin(page, { ...input, versionToken: fresh.data.versionToken }); await expect(page.locator(".ai-confirmation")).toBeVisible(); await page.getByRole("checkbox").uncheck(); expect((await finish(page)).error.code).toBe("CANCELLED");
  expect((await stored(page)).documents.overview.content).toBe("# User editing during confirmation");
});
test("same revision and timestamp with different saved text conflicts", async ({ page }) => {
  await install(page); await enable(page); const before = await read(page);
  await alterStored(page, "overview", "# Remote same revision", true);
  const result = await call(page, "uft_update_document", { workspaceId: "default", entryId: "overview", versionToken: before.data.versionToken, content: "# Stale", requestId: "stale" });
  expect(result.error.code).toBe("CONFLICT"); expect((await stored(page)).documents.overview.content).toBe("# Remote same revision");
});
test("remote save during confirmation conflicts and leaves persisted text intact", async ({ page }) => {
  await install(page); await enable(page); const before = await read(page);
  await begin(page, { workspaceId: "default", entryId: "overview", versionToken: before.data.versionToken, content: "# Agent", requestId: "stale" }); await expect(page.locator(".ai-confirmation")).toBeVisible();
  await alterStored(page, "overview", "# Remote winner", true); await page.getByRole("button", { name: "変更を適用", exact: true }).click(); expect((await finish(page)).error.code).toBe("CONFLICT"); expect((await stored(page)).documents.overview.content).toBe("# Remote winner");
});
test("a different document's remote save survives target update", async ({ page, context }) => {
  await install(page); await enable(page); const made = await create(page); const id = made.data.entryId; const state = await read(page, id);
  const other = await context.newPage(); await other.goto("/workspace"); await other.getByRole("button", { name: "overview.md", exact: true }).click(); await edit(other, "# Other tab saved"); await other.getByRole("button", { name: "保存", exact: true }).click(); await expect(other.getByText("保存済み", { exact: true })).toBeVisible();
  await begin(page, { workspaceId: "default", entryId: id, versionToken: state.data.versionToken, content: "# Target", requestId: "target-update" }); await page.getByRole("button", { name: "変更を適用", exact: true }).click(); expect((await finish(page)).ok).toBe(true);
  expect((await stored(page)).documents.overview.content).toBe("# Other tab saved"); await expect(other.locator(".cm-content")).toContainText("Other tab saved");
});
test("transaction failure never publishes draft content and permits same-ID retry", async ({ page }) => {
  await install(page); await enable(page); const before = await read(page);
  const input = { workspaceId: "default", entryId: "overview", versionToken: before.data.versionToken, content: "# Retried", requestId: "retry" };
  await begin(page, input); await expect(page.locator(".ai-confirmation")).toBeVisible();
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(value, key) { if (this.name === "workspace") { IDBObjectStore.prototype.put = original; throw new DOMException("simulated write failure", "QuotaExceededError"); } return original.call(this, value, key); }; });
  await page.getByRole("button", { name: "変更を適用", exact: true }).click(); expect((await finish(page)).error.code).toBe("SAVE_FAILED"); await expect(page.locator(".cm-content")).toContainText("Overview"); expect((await stored(page)).documents.overview.content).toBe(before.data.content);
  await begin(page, input); await page.getByRole("button", { name: "変更を適用", exact: true }).click(); expect((await finish(page)).ok).toBe(true);
  const replay = await call(page, "uft_update_document", input); expect(replay.replayed).toBe(true); await expect(page.locator(".ai-confirmation")).toHaveCount(0);
});
test("write validation rejects wrong workspace, missing/type/deleted entries, duplicate names and size", async ({ page }) => {
  await install(page); await enable(page);
  for (const [name, input, code] of [
    ["uft_list_documents", { workspaceId: "other" }, "WORKSPACE_CHANGED"],
    ["uft_list_documents", { workspaceId: "default", extra: "bad" }, "INVALID_INPUT"],
    ["uft_read_document", { workspaceId: "default", entryId: "docs" }, "NOT_FOUND"],
    ["uft_read_document", { workspaceId: "default", entryId: "missing" }, "NOT_FOUND"],
    ["uft_create_document", { workspaceId: "default", name: "bad/path", content: "", requestId: "bad" }, "INVALID_INPUT"],
    ["uft_create_document", { workspaceId: "default", name: "bad", parentId: "overview", content: "", requestId: "bad" }, "INVALID_INPUT"],
    ["uft_create_document", { workspaceId: "default", name: "bad", content: "🤖".repeat(262145), requestId: "large" }, "INVALID_INPUT"],
  ] as const) expect((await call(page, name, input)).error.code).toBe(code);
  expect((await create(page)).ok).toBe(true); expect((await create(page, "Agent", "body", "duplicate")).error.code).toBe("INVALID_INPUT");
});
test("workspace changes revoke old tools, disable consent and cancel waiting update", async ({ page }) => {
  await install(page); await enable(page); const before = await read(page);
  await begin(page, { workspaceId: "default", entryId: "overview", versionToken: before.data.versionToken, content: "# Old workspace", requestId: "old" }); await expect(page.locator(".ai-confirmation")).toBeVisible();
  await page.getByRole("button", { name: "新規 WS" }).click(); await page.locator("#text-input-dialog-value").fill("Other workspace"); await page.getByRole("button", { name: "作成", exact: true }).click();
  await expect(page.locator(".ai-confirmation")).toHaveCount(0); expect((await finish(page)).error.code).toBe("CANCELLED"); expect(await page.evaluate(() => Object.keys(window.uftTools))).toHaveLength(0); await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("checkbox").check(); await expect(page.getByText("5 ツール利用可能", { exact: true })).toBeVisible(); expect((await call(page, "uft_list_documents", { workspaceId: "default" })).error.code).toBe("WORKSPACE_CHANGED");
});

test("concurrent retries from separate tabs create exactly one document", async ({ page, context }) => {
  await install(page); await enable(page); const other = await context.newPage(); await install(other); await enable(other);
  const [left, right] = await Promise.all([create(page, "Concurrent", "# One document", "same-create"), create(other, "Concurrent", "# One document", "same-create")]);
  expect(left.ok).toBe(true); expect(right.ok).toBe(true); expect(left.data.entryId).toBe(right.data.entryId);
  expect((await stored(page)).entries.filter(item => item.name === "Concurrent.md")).toHaveLength(1);
});
test("long existing content pages, range outside content, deleted/diagram IDs and busy updates", async ({ page }) => {
  await install(page); await enable(page); const content = "a".repeat(999) + "🤖" + "b".repeat(1200);
  await alterStored(page, "overview", content); await page.reload(); await page.locator(".ai-integration summary").click(); await page.getByRole("checkbox").check(); await expect(page.getByText("5 ツール利用可能", { exact: true })).toBeVisible();
  let offset = 0; let assembled = ""; let token = "";
  do { const part = await call(page, "uft_read_document", { workspaceId: "default", entryId: "overview", offset }); assembled += part.data.content; if (token) expect(part.data.versionToken).toBe(token); token = part.data.versionToken; offset = part.data.nextOffset; } while (offset !== null);
  expect(assembled).toBe(content); expect((await call(page, "uft_read_document", { workspaceId: "default", entryId: "overview", offset: 10000 })).data).toMatchObject({ content: "", nextOffset: null });
  const list = await call(page, "uft_list_documents", { workspaceId: "default", offset: 100 }); expect(list.data.documents).toEqual([]); expect(list.data.folders).toEqual([]);
  await begin(page, { workspaceId: "default", entryId: "overview", versionToken: token, content: "# Waiting", requestId: "waiting" }); await expect(page.locator(".ai-confirmation")).toBeVisible(); expect((await create(page, "Busy", "", "busy")).error.code).toBe("BUSY"); await page.keyboard.press("Escape"); expect((await finish(page)).error.code).toBe("CANCELLED");
  await page.evaluate(() => new Promise<void>(resolve => { const r = indexedDB.open("uft-fallback", 2); r.onsuccess = () => { const db = r.result; const tx = db.transaction("workspace", "readwrite"); const store = tx.objectStore("workspace"); const get = store.get("default"); get.onsuccess = () => { const w = get.result; w.entries[1].kind = "diagram"; store.put(w, "default"); }; tx.oncomplete = () => { db.close(); resolve(); }; }; }));
  await page.reload(); await page.locator(".ai-integration summary").click(); await page.getByRole("checkbox").check(); await expect(page.getByText("5 ツール利用可能", { exact: true })).toBeVisible(); expect((await read(page)).error.code).toBe("NOT_FOUND");
});

test("existing documents above the write budget remain readable but cannot be replaced", async ({ page }) => {
  await install(page); await enable(page); const content = "a".repeat(1048577);
  await alterStored(page, "overview", content); await page.reload(); await page.locator(".ai-integration summary").click(); await page.getByRole("checkbox").check(); await expect(page.getByText("5 ツール利用可能", { exact: true })).toBeVisible();
  const state = await read(page); expect(state.data.content).toHaveLength(1000); expect(state.data.totalLength).toBe(content.length); expect(state.data.nextOffset).toBe(1000);
  const response = await call(page, "uft_update_document", { workspaceId: "default", entryId: "overview", content: "small replacement", versionToken: state.data.versionToken, requestId: "too-large" }); expect(response.error.code).toBe("INVALID_INPUT"); expect((await stored(page)).documents.overview.content).toHaveLength(content.length);
});
test("an update retried in another tab after approval replays the committed result", async ({ page, context }) => {
  await install(page); await enable(page); const other = await context.newPage(); await install(other); await enable(other);
  const state = await read(page); const input = { workspaceId: "default", entryId: "overview", content: "# Concurrent update", versionToken: state.data.versionToken, requestId: "same-update" };
  await begin(page, input); await begin(other, input); await expect(other.locator(".ai-confirmation")).toBeVisible();
  await page.getByRole("button", { name: "変更を適用", exact: true }).click(); expect((await finish(page)).ok).toBe(true);
  await other.getByRole("button", { name: "変更を適用", exact: true }).click(); const replay = await finish(other); expect(replay.ok).toBe(true); expect(replay.replayed).toBe(true); expect((await stored(page)).documents.overview.revision).toBe(2);
});

test("creation uses the latest parent path when another tab renames the folder before commit", async ({ page }) => {
  await install(page); await enable(page);
  await page.evaluate(() => {
    const original = SubtleCrypto.prototype.digest; let calls = 0;
    (window as any).restoreDigest = () => { SubtleCrypto.prototype.digest = original; };
    SubtleCrypto.prototype.digest = async function(algorithm, data) {
      if (++calls === 2) await new Promise<void>(resolve => { const request = indexedDB.open("uft-fallback", 2); request.onsuccess = () => { const db = request.result; const tx = db.transaction("workspace", "readwrite"); const store = tx.objectStore("workspace"); const get = store.get("default"); get.onsuccess = () => { const workspace = get.result; workspace.entries[0].name = "renamed"; workspace.entries[0].path = "renamed"; workspace.entries[0].updatedAt = new Date(Date.now() + 20).toISOString(); workspace.entries[1].path = "renamed/overview.md"; store.put(workspace, "default"); }; tx.oncomplete = () => { db.close(); resolve(); }; }; });
      return original.call(this, algorithm, data);
    };
  });
  let created;
  try { created = await call(page, "uft_create_document", { workspaceId: "default", name: "Race", parentId: "docs", content: "# Race", requestId: "parent-race" }); }
  finally { await page.evaluate(() => (window as any).restoreDigest()); }
  expect(created.ok).toBe(true); expect(created.data.path).toBe("renamed/Race.md"); expect((await stored(page)).entries.find(item => item.id === created.data.entryId)?.path).toBe("renamed/Race.md"); expect((await read(page, created.data.entryId)).data.versionToken).toBe(created.data.versionToken);
});

test("updating an unselected document preserves the visible document and manual edits", async ({ page }) => {
  await install(page); await enable(page); const created = await create(page); const id = created.data.entryId;
  await call(page, "uft_open_document", { workspaceId: "default", entryId: "overview" }); const state = await read(page, id);
  await begin(page, { workspaceId: "default", entryId: id, versionToken: state.data.versionToken, content: "# Background target", requestId: "unselected" }); await expect(page.locator(".ai-confirmation")).toBeVisible();
  await edit(page, "# Visible manual edit"); await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "変更を適用", exact: true }).click(); expect((await finish(page)).ok).toBe(true); await expect(page.locator(".cm-content")).toContainText("Visible manual edit");
  const saved = await stored(page); expect(saved.documents[id].content).toBe("# Background target"); expect(saved.documents.overview.content).toBe("# Visible manual edit"); expect(saved.lastOpenedEntryId).toBe("overview");
});

test("partial registration failure cancels a tool already invoked during registration", async ({ page }) => {
  await page.addInitScript(() => {
    window.uftTools = {};
    Object.defineProperty(document, "modelContext", { value: {
      registerTool: async (tool: ModelContextTool, options: { signal: AbortSignal }) => {
        if (tool.name === "uft_update_document") throw new Error("last tool failed");
        window.uftTools[tool.name] = tool;
        options.signal.addEventListener("abort", () => { delete window.uftTools[tool.name]; }, { once: true });
        if (tool.name === "uft_create_document") window.uftPending = tool.execute({ workspaceId: "default", name: "Must cancel", content: "# Cancel registration", requestId: "registration-race" }, { signal: new AbortController().signal });
      },
    } });
  });
  await page.goto("/workspace"); await expect(page.locator(".cm-content")).toBeVisible(); await page.locator(".ai-integration summary").click(); await page.getByRole("checkbox").check();
  await expect(page.getByText("登録失敗。通常編集を利用できます。", { exact: true })).toBeVisible(); expect((await finish(page)).error.code).toBe("CANCELLED"); expect((await stored(page)).entries.filter(item => item.kind === "markdown")).toHaveLength(1); expect(await page.evaluate(() => Object.keys(window.uftTools))).toHaveLength(0);
});

test("an already open rename dialog cannot change the target during its commit guard", async ({ page }) => {
  await install(page); await enable(page); const state = await read(page);
  await begin(page, { workspaceId: "default", entryId: "overview", versionToken: state.data.versionToken, content: "# Guarded target", requestId: "guard-modal" }); await expect(page.locator(".ai-confirmation")).toBeVisible();
  await page.getByRole("button", { name: "名前変更", exact: true }).click(); await page.locator("#text-input-dialog-value").fill("Changed during commit.md");
  await page.evaluate(() => {
    const original = SubtleCrypto.prototype.digest;
    (window as any).releaseGuardHash = null;
    SubtleCrypto.prototype.digest = async function(algorithm, data) {
      SubtleCrypto.prototype.digest = original;
      await new Promise<void>(resolve => { (window as any).releaseGuardHash = resolve; });
      return original.call(this, algorithm, data);
    };
    (document.querySelector(".ai-confirm-actions button:last-child") as HTMLButtonElement).click();
  });
  await expect.poll(() => page.evaluate(() => typeof (window as any).releaseGuardHash)).toBe("function");
  await page.getByRole("button", { name: "変更", exact: true }).click();
  await expect(page.getByText("AI 連携の保存中です。完了後に再試行してください。", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).releaseGuardHash()); expect((await finish(page)).ok).toBe(true);
  const saved = await stored(page); expect(saved.entries.find(item => item.id === "overview")?.name).toBe("overview.md"); expect(saved.documents.overview.content).toBe("# Guarded target");
});

test("local edits to another document during target hashing are persisted in the same commit", async ({ page }) => {
  await install(page); await enable(page); const made = await create(page); const id = made.data.entryId; const state = await read(page, id);
  await call(page, "uft_open_document", { workspaceId: "default", entryId: "overview" });
  await begin(page, { workspaceId: "default", entryId: id, versionToken: state.data.versionToken, content: "# Target saved", requestId: "late-other" }); await expect(page.locator(".ai-confirmation")).toBeVisible();
  await page.evaluate(() => {
    const original = SubtleCrypto.prototype.digest;
    (window as any).releaseOtherHash = null;
    SubtleCrypto.prototype.digest = async function(algorithm, data) {
      SubtleCrypto.prototype.digest = original;
      await new Promise<void>(resolve => { (window as any).releaseOtherHash = resolve; });
      return original.call(this, algorithm, data);
    };
  });
  await page.getByRole("button", { name: "変更を適用", exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).releaseOtherHash)).toBe("function");
  await edit(page, "# Latest other document"); await page.evaluate(() => (window as any).releaseOtherHash()); expect((await finish(page)).ok).toBe(true);
  const saved = await stored(page); expect(saved.documents.overview.content).toBe("# Latest other document"); expect(saved.documents[id].content).toBe("# Target saved");
  await expect(page.locator(".cm-content")).toContainText("Latest other document");
});

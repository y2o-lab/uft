import { expect, test } from "@playwright/test";

test("IDB transactions merge independent saves without Web Locks and retain 100 receipts", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "locks", { configurable: true, value: undefined }));
  await page.goto("/workspace"); await expect(page.locator(".cm-content")).toBeVisible();
  const result = await page.evaluate(async () => {
    // Import the real Vite-served repository: no in-memory storage double.
    const { createWorkspaceRepository } = await import("/src/lib/storage/workspace-repository.ts");
    const a = createWorkspaceRepository(); const b = createWorkspaceRepository();
    const base = await a.read("default");
    const other = { ...base.entries[1], id: "other", name: "other.md", path: "docs/other.md" };
    base.entries.push(other); base.documents.other = { ...base.documents.overview, entryId: "other" }; await a.save(base);
    const left = JSON.parse(JSON.stringify(base)); const right = JSON.parse(JSON.stringify(base));
    left.documents.overview.content = "left"; left.documents.overview.updatedAt = new Date().toISOString();
    right.documents.other.content = "right"; right.documents.other.updatedAt = new Date().toISOString();
    await Promise.all([a.mergeSave(left), b.mergeSave(right)]);
    for (let i = 0; i < 105; i++) await a.atomic("default", (stored: any) => ({ workspace: stored, result: true, receipt: { requestId: `request-${i}`, fingerprint: `${i}`, result: { ok: true, data: { i } } } }));
    const saved = await a.read("default"); const receipts = await b.receipts("default");
    return { left: saved.documents.overview.content, right: saved.documents.other.content, receiptCount: receipts.length, first: receipts[0].requestId, last: receipts.at(-1).requestId };
  });
  expect(result).toEqual({ left: "left", right: "right", receiptCount: 100, first: "request-5", last: "request-104" });
});
test("abort during write rolls back content and receipt, cancellation after commit preserves success", async ({ page }) => {
  await page.goto("/workspace"); await expect(page.locator(".cm-content")).toBeVisible();
  const result = await page.evaluate(async () => {
    const { createWorkspaceRepository } = await import("/src/lib/storage/workspace-repository.ts");
    const repository = createWorkspaceRepository();
    const before = await repository.read("default"); const controller = new AbortController();
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value: any, key: any) {
      const result = original.call(this, value, key); if (this.name === "workspace") controller.abort(); return result;
    };
    let code;
    try { await repository.atomic("default", (stored: any) => { stored.documents.overview.content = "cancelled content"; return { workspace: stored, result: true, receipt: { requestId: "cancel", fingerprint: "cancel", result: { ok: true, data: {} } } }; }, controller.signal); }
    catch (error: any) { code = error.code; }
    finally { IDBObjectStore.prototype.put = original; }
    const cancelled = await repository.read("default"); const receiptsAfterAbort = await repository.receipts("default");
    const afterCommit = new AbortController();
    IDBObjectStore.prototype.put = function(value: any, key: any) {
      if (this.name === "workspace") this.transaction.addEventListener("complete", () => afterCommit.abort(), { once: true });
      return original.call(this, value, key);
    };
    let saved;
    try { saved = await repository.atomic("default", (stored: any) => { stored.documents.overview.content = "committed content"; return { workspace: stored, result: { saved: true }, receipt: { requestId: "commit", fingerprint: "commit", result: { ok: true, data: {} } } }; }, afterCommit.signal); }
    finally { IDBObjectStore.prototype.put = original; }
    return { code, unchanged: cancelled.documents.overview.content === before.documents.overview.content, receiptsAfterAbort: receiptsAfterAbort.length, saved, content: (await repository.read("default")).documents.overview.content, receipts: (await repository.receipts("default")).map((item: any) => item.requestId), abortedAfterCommit: afterCommit.signal.aborted };
  });
  expect(result).toEqual({ code: "CANCELLED", unchanged: true, receiptsAfterAbort: 0, saved: { saved: true }, content: "committed content", receipts: ["commit"], abortedAfterCommit: true });
});

test("a same-version local body change after hashing is rechecked inside the commit", async ({ page }) => {
  await page.goto("/workspace"); await expect(page.locator(".cm-content")).toBeVisible();
  const result = await page.evaluate(async () => {
    const { createWorkspaceRepository } = await import("/src/lib/storage/workspace-repository.ts");
    const { createWorkspaceCommands } = await import("/src/lib/workspace/workspace-commands.ts");
    const { createMarkdownTools } = await import("/src/lib/webmcp/markdown-tools.ts");
    const { versionToken } = await import("/src/lib/webmcp/version.ts");
    const repository = createWorkspaceRepository(); const local = await repository.read("default"); const before = local.documents.overview.content;
    const token = await versionToken(local, local, "overview");
    const commands = createWorkspaceCommands({ getWorkspace: () => local, getRepository: () => repository, isEnabled: () => true, getSelection: () => "overview", applySaved: () => { throw new Error("A conflicting result must never be applied"); }, confirm: async () => true, guard: () => {}, enqueue: async (operation: () => Promise<any>) => operation() });
    const tool = createMarkdownTools("default", commands, new AbortController().signal)[4];
    const original = SubtleCrypto.prototype.digest; let calls = 0;
    SubtleCrypto.prototype.digest = async function(algorithm, data) { if (++calls === 3) local.documents.overview.content = "local changed without revision/time change"; return original.call(this, algorithm, data); };
    let response;
    try { response = await tool.execute({ workspaceId: "default", entryId: "overview", versionToken: token, content: "agent replacement", requestId: "local-race" }, { signal: new AbortController().signal }); }
    finally { SubtleCrypto.prototype.digest = original; }
    return { response, unchanged: (await repository.read("default")).documents.overview.content === before, receipts: (await repository.receipts("default")).length };
  });
  expect(result.response.error.code).toBe("CONFLICT"); expect(result.unchanged).toBe(true); expect(result.receipts).toBe(0);
});

import { expect, test, type Page } from "@playwright/test";

const executablePath = process.env.WEBMCP_NATIVE_EXECUTABLE_PATH;
test.skip(!process.env.WEBMCP_NATIVE, "Run explicitly with a headed Chrome with native WebMCP enabled");
test.use({ headless: false, launchOptions: { ...(executablePath ? { executablePath } : {}), args: ["--enable-experimental-web-platform-features"] } });
async function invoke(page: Page, name: string, input: Record<string, unknown>) {
  return page.evaluate(async ({ name, input }) => {
    const context = (document as any).modelContext;
    const tool = (await context.getTools()).find((tool: any) => tool.name === name);
    const major = Number(navigator.userAgent.match(/Chrome\/(\d+)/)?.[1]);
    const result = await context.executeTool(tool, major >= 155 ? input : JSON.stringify(input));
    return typeof result === "string" ? JSON.parse(result) : result;
  }, { name, input });
}
test("native Document API discovers five tools, persists writes, supports Undo and revokes registration", async ({ page, browser }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/workspace"); await expect(page.getByRole("button", { name: "overview.md", exact: true })).toBeVisible();
  expect(await page.evaluate(() => Boolean((document as any).modelContext))).toBe(true);
  expect(await page.evaluate(async () => (await (document as any).modelContext.getTools()).length)).toBe(0);
  await page.locator(".ai-integration summary").click(); await page.getByRole("checkbox").check(); await expect(page.getByText("5 ツール利用可能", { exact: true })).toBeVisible();
  const names = await page.evaluate(async () => (await (document as any).modelContext.getTools()).map((tool: any) => tool.name));
  expect(names).toEqual(["uft_create_document", "uft_list_documents", "uft_open_document", "uft_read_document", "uft_update_document"]);
  const list = await invoke(page, "uft_list_documents", { workspaceId: "default" }); expect(list.data.documents[0].entryId).toBe("overview");
  const created = await invoke(page, "uft_create_document", { workspaceId: "default", name: "Native integration", content: "# Native before\n\n🤖 body", requestId: "native-create" }); expect(created.ok).toBe(true);
  const entryId = created.data.entryId;
  const read = await invoke(page, "uft_read_document", { workspaceId: "default", entryId }); expect(read.data.versionToken).toBe(created.data.versionToken);
  const update = invoke(page, "uft_update_document", { workspaceId: "default", entryId, versionToken: read.data.versionToken, content: "# Native after\n\nSaved", requestId: "native-update" });
  await page.getByRole("button", { name: "変更を適用", exact: true }).click(); expect((await update).ok).toBe(true);
  await expect(page.locator(".preview-pane h1")).toHaveText("Native after"); await page.locator(".cm-content").click(); await page.keyboard.press("Meta+z"); await expect(page.locator(".cm-content")).toContainText("Native before"); await page.keyboard.press("Meta+Shift+z"); await expect(page.locator(".cm-content")).toContainText("Native after");
  await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  expect((await invoke(page, "uft_open_document", { workspaceId: "default", entryId: "overview" })).ok).toBe(true);
  await expect(page.locator(".preview-pane h1")).toHaveText("Overview");
  expect((await invoke(page, "uft_open_document", { workspaceId: "default", entryId })).ok).toBe(true);
  await page.getByRole("checkbox").uncheck(); expect(await page.evaluate(async () => (await (document as any).modelContext.getTools()).length)).toBe(0);
  await page.reload(); await expect(page.locator(".cm-content")).toContainText("Native after");
  await page.screenshot({ path: testInfo.outputPath("native-webmcp.png"), fullPage: true });
  await testInfo.attach("native-browser", { body: JSON.stringify({ version: browser.version(), date: new Date().toISOString(), names, errors }), contentType: "application/json" });
  expect(errors).toEqual([]);
});
test("native execution cancellation leaves content unchanged on signal-capable Chrome", async ({ page, browser }) => {
  test.skip(Number(browser.version().split(".")[0]) < 153, "Older native callbacks do not receive a cancellation signal");
  await page.goto("/workspace"); await expect(page.locator(".cm-content")).toBeVisible(); await page.locator(".ai-integration summary").click(); await page.getByRole("checkbox").check(); await expect(page.getByText("5 ツール利用可能", { exact: true })).toBeVisible();
  const before = await invoke(page, "uft_read_document", { workspaceId: "default", entryId: "overview" });
  await page.evaluate(async (token) => {
    const context = (document as any).modelContext;
    const tool = (await context.getTools()).find((tool: any) => tool.name === "uft_update_document");
    const controller = new AbortController();
    (window as any).nativeAbort = controller;
    const args = { workspaceId: "default", entryId: "overview", versionToken: token, content: "# Should not save", requestId: "native-cancel" };
    const major = Number(navigator.userAgent.match(/Chrome\/(\d+)/)?.[1]);
    (window as any).nativePending = context.executeTool(tool, major >= 155 ? args : JSON.stringify(args), { signal: controller.signal }).then((result: any) => ({ result }), (error: Error) => ({ error: error.name }));
  }, before.data.versionToken);
  await expect(page.locator(".ai-confirmation")).toBeVisible(); await page.evaluate(() => (window as any).nativeAbort.abort());
  await expect(page.locator(".ai-confirmation")).toHaveCount(0); expect((await page.evaluate(() => (window as any).nativePending)).error).toBe("AbortError");
  const after = await invoke(page, "uft_read_document", { workspaceId: "default", entryId: "overview" }); expect(after.data.content).toBe(before.data.content); await page.reload(); await expect(page.locator(".preview-pane h1")).toHaveText("Overview");
});

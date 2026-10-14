import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const trialUrl = process.env.WEBMCP_TRIAL_URL;
const expected = process.env.WEBMCP_TRIAL_EXPECTED ?? "enabled";
const executablePath = process.env.WEBMCP_NATIVE_EXECUTABLE_PATH;
test.skip(!trialUrl, "Requires the deployed trial URL, never substitute a flag-enabled browser");
test.use({ headless: false, launchOptions: { ...(executablePath ? { executablePath } : {}), args: [] } });

test("public trial works without flags, or falls back when disabled/expired", async ({ page, browser, context }, testInfo) => {
  expect(["enabled", "disabled", "expired"]).toContain(expected);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(trialUrl!);
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.locator(".ai-integration summary").click();
  const environment = await page.evaluate(() => ({
    secure: isSecureContext, modelContext: Boolean((document as any).modelContext),
    tokens: document.querySelectorAll('meta[http-equiv="origin-trial"]').length,
  }));
  expect(environment.secure).toBe(true);
  const cdp = await context.newCDPSession(page);
  const { frameTree } = await cdp.send("Page.getFrameTree");
  const trials = await cdp.send("Page.getOriginTrials", { frameId: frameTree.frame.id });
  if (expected === "enabled") {
    expect(environment.modelContext).toBe(true);
    expect(trials.originTrials.some(trial => /WebMCP/i.test(trial.trialName) && trial.status === "Enabled")).toBe(true);
    await page.getByRole("checkbox").check();
    await expect(page.getByText("5 ツール利用可能", { exact: true })).toBeVisible();
    const created = await page.evaluate(async () => {
      const c = (document as any).modelContext;
      const tools = await c.getTools();
      const tool = tools.find((item: any) => item.name === "uft_create_document");
      const args = { workspaceId: "default", name: "Trial verification", content: "# Trial verified", requestId: "trial-create" };
      const major = Number(navigator.userAgent.match(/Chrome\/(\d+)/)?.[1]);
      const raw = await c.executeTool(tool, major >= 155 ? args : JSON.stringify(args));
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    });
    expect(created.ok).toBe(true);
    await page.reload();
    await expect(page.locator(".cm-content")).toContainText("Trial verified");
  } else {
    expect(environment.modelContext).toBe(false);
    await expect(page.getByRole("checkbox")).toBeDisabled();
    if (expected === "expired") {
      // A malformed/absent token cannot prove a genuinely expired enrollment.
      const statuses = trials.originTrials.filter(trial => /WebMCP/i.test(trial.trialName)).flatMap(trial => trial.tokensWithStatus.map(token => token.status));
      expect(statuses).toContain("Expired");
    }
    await page.locator(".cm-content").click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
    await page.keyboard.insertText("# Trial fallback works");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator(".cm-content")).toContainText("Trial fallback works");
  }
  expect(errors).toEqual([]);
  const evidencePath = testInfo.outputPath("origin-trial.json");
  await writeFile(evidencePath, JSON.stringify({ date: new Date().toISOString(), browser: browser.version(), url: trialUrl, expected, environment, trials, errors }, null, 2));
  await testInfo.attach("origin-trial", { path: evidencePath, contentType: "application/json" });
});

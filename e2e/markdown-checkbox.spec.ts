import { expect, test } from "@playwright/test";

test("checkbox shortcut toggles selected source lines and persists tasks", async ({ page }) => {
  await page.goto("/workspace");
  const source = page.locator(".cm-content");
  await expect(source).toBeVisible();
  await source.fill("First task\nSecond task");
  await source.press("Control+a");
  const button = page.locator(".markdown-source-editor").getByRole("button", { name: "チェックボックス", exact: true });
  await button.click();
  await expect(source.locator(".cm-line")).toHaveText(["- [ ] First task", "- [ ] Second task"]);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  const tasks = page.locator('.preview-content input[type="checkbox"]');
  await expect(tasks).toHaveCount(2);
  await tasks.first().check();
  await expect(source).toContainText("- [x] First task");
  await expect(page.locator(".status")).toContainText("保存済み");
  await page.reload();
  await expect(page.locator('.preview-content input[type="checkbox"]').first()).toBeChecked();
  await source.click();
  await source.press("Control+a");
  await button.click();
  await expect(source.locator(".cm-line")).toHaveText(["- First task", "- Second task"]);
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(tasks).toHaveCount(0);
});

test("checkbox shortcut works in the editable preview", async ({ page }) => {
  await page.goto("/workspace");
  const source = page.locator(".cm-content");
  await expect(source).toBeVisible();
  await source.fill("Preview task");
  await expect(page.locator(".preview-content p")).toHaveText("Preview task");
  await page.getByRole("button", { name: "プレビューを編集", exact: true }).click();
  const preview = page.getByLabel("編集可能な Markdown プレビュー");
  await preview.locator("p").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  const button = page.locator(".preview-editor-bar").getByRole("button", { name: "チェックボックス", exact: true });
  await button.click();
  await expect(preview.locator('input[type="checkbox"]')).toHaveCount(1);
  await expect(source).toContainText("[ ] Preview task");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await preview.locator('input[type="checkbox"]').check();
  await expect(source).toContainText("[x] Preview task");
  await button.click();
  await expect(preview.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(source).not.toContainText("[x]");
  await expect(button).toHaveAttribute("aria-pressed", "false");
});

test("preview shortcut converts multiple list items without resetting completed tasks", async ({ page }) => {
  await page.goto("/workspace");
  const source = page.locator(".cm-content");
  await expect(source).toBeVisible();
  await source.fill("- First\n- [x] Done\n- Last");
  const preview = page.locator(".preview-content");
  await expect(preview.locator("li")).toHaveCount(3);
  await page.getByRole("button", { name: "プレビューを編集", exact: true }).click();
  await preview.locator("ul").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  const button = page.locator(".preview-editor-bar").getByRole("button", { name: "チェックボックス", exact: true });
  await button.click();
  const tasks = preview.locator('input[type="checkbox"]');
  await expect(tasks).toHaveCount(3);
  await expect(tasks.nth(1)).toBeChecked();
  await expect(source).toContainText("[x] Done");
  await button.click();
  await expect(tasks).toHaveCount(0);
  await expect(preview.locator("li")).toHaveText([" First", " Done", " Last"]);
});

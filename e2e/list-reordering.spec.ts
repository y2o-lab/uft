import { expect, test, type Locator, type Page } from "@playwright/test";

async function prepare(page: Page, markdown: string): Promise<Locator> {
  await page.goto("/workspace");
  const source = page.locator(".cm-content");
  await expect(source).toBeVisible();
  await source.fill(markdown);
  const preview = page.locator(".preview-content");
  await expect(preview.locator("li").first()).toBeVisible();
  await expect(preview.locator("[data-list-handle]")).toHaveCount(0);
  await page.getByRole("button", { name: "プレビューを編集" }).click();
  await expect(preview.locator("[data-list-handle]").first()).toBeVisible();
  return preview;
}

async function drag(page: Page, item: Locator, target: Locator, after: boolean) {
  const handle = item.locator(":scope > [data-list-handle]");
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error("Drop target is not visible");
  await handle.dragTo(target, { targetPosition: { x: 70, y: after ? bounds.height - 2 : 2 } });
  await expect(page.locator("[data-list-drop], .list-dragging")).toHaveCount(0);
}

test("drags bullet items with their nested tasks and persists Markdown after reload", async ({ page }) => {
  const preview = await prepare(page, "# Reorder lists\n\n- **Parent**\n  - [x] Completed child\n  - [ ] Pending child\n- Second\n- Third\n\nKeep this paragraph.\n");
  const items = preview.locator(":scope > ul > li");
  await drag(page, items.nth(0), items.nth(2), true);
  await expect(items).toHaveText(["Second", "Third", "Parent\nCompleted child\nPending child"]);
  await expect(preview.locator('input[type="checkbox"]').first()).toBeChecked();
  await expect(page.locator(".cm-content")).toContainText("**Parent**");
  await expect(page.locator(".cm-content")).not.toContainText("uft-list-item");
  await drag(page, items.nth(2), items.nth(0), false);
  await expect(items.first()).toContainText("Parent");
  await drag(page, items.nth(2), items.nth(0), false);
  await page.getByRole("button", { name: "編集を終了" }).click();
  await expect(preview.locator("[data-list-handle]")).toHaveCount(0);
  await expect(page.getByText("保存済み", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(items).toHaveCount(3);
  await expect(items.first()).toHaveText("Third");
  await expect(items.nth(1).locator("li")).toHaveCount(2);
  await expect(preview.locator('input[type="checkbox"]').first()).toBeChecked();
  await expect(preview).toContainText("Keep this paragraph.");
});

test("reorders numbered and task lists and moves items between lists", async ({ page }) => {
  const preview = await prepare(page, "# Numbered and task lists\n\n3. First\n4. Second\n5. Third\n\nTasks\n\n- [x] Done\n- [ ] Todo\n");
  const ordered = preview.locator(":scope > ol > li");
  await drag(page, ordered.nth(2), ordered.nth(0), false);
  await expect(ordered).toHaveText(["Third", "First", "Second"]);
  const tasks = preview.locator(":scope > ul > li");
  await drag(page, tasks.nth(1), tasks.nth(0), false);
  await expect(tasks).toHaveText([" Todo", " Done"]);
  await expect(tasks.nth(1).locator("input")).toBeChecked();
  await drag(page, tasks.nth(0), ordered.nth(1), true);
  await expect(ordered).toHaveCount(4);
  await expect(ordered.nth(2)).toContainText("Todo");
  await drag(page, tasks.nth(0), ordered.nth(3), true);
  await expect(preview.locator(":scope > ul")).toHaveCount(0);
  await expect(page.locator(".cm-content")).toContainText("7.");
  await page.getByRole("button", { name: "編集を終了" }).click();
  await expect(preview.locator(":scope > ol")).toHaveAttribute("start", "3");
  await expect(preview.locator('input[type="checkbox"]').last()).toBeChecked();
});

test("keeps nested items safe on invalid drops and supports keyboard movement", async ({ page }) => {
  const preview = await prepare(page, "- Parent\n  - Child A\n  - Child B\n- Other\n");
  const parent = preview.locator(":scope > ul > li").first();
  const child = parent.locator("li").first();
  await drag(page, parent, child, true);
  await expect(preview.locator(":scope > ul > li")).toHaveCount(2);
  await expect(parent.locator("li")).toHaveText(["Child A", "Child B"]);
  await parent.locator("li").last().locator("[data-list-handle]").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(parent.locator("li")).toHaveText(["Child B", "Child A"]);
  await expect(page.locator(".cm-content")).not.toContainText("uft-list-item");
  await drag(page, parent.locator("li").first(), parent, false);
  await expect(preview.locator(":scope > ul > li")).toHaveCount(3);
  await expect(preview.locator(":scope > ul > li").first()).toHaveText("Child B");
  await expect(preview.locator(":scope > ul > li").nth(1).locator("li")).toHaveText(["Child A"]);
});

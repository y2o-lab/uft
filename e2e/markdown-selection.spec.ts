import { expect, test } from "@playwright/test";

test("renumbers ordered lists after deleting source items", async ({ page }) => {
  await page.goto("/workspace");
  const source = page.locator(".cm-content");
  await expect(source).toBeVisible();
  await source.fill("1. first\n2. middle\n3. last");
  await page.locator(".cm-gutterElement").filter({ hasText: /^2$/ }).click();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Backspace");
  await expect(source.locator(".cm-line")).toHaveText(["1. first", "2. last"]);
  await page.locator(".cm-gutterElement").filter({ hasText: /^1$/ }).click();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Backspace");
  await expect(source.locator(".cm-line")).toHaveText(["1. last"]);
  await expect(page.locator(".preview-content ol")).not.toHaveAttribute("start", "2");

  await expect(page.locator(".status")).toHaveText("保存済み");
  await page.reload();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(["1. last"]);
});

test("selects source lines and the whole Markdown document", async ({ page }) => {
  await page.goto("/workspace");
  const source = page.locator(".cm-content");
  await expect(source).toBeVisible();
  await source.fill("first line\nsecond line\nthird line");

  const firstLine = await source.locator(".cm-line").first().boundingBox();
  const secondLine = await source.locator(".cm-line").nth(1).boundingBox();
  if (!firstLine || !secondLine) throw new Error("Source lines are not visible");
  await page.mouse.move(firstLine.x + 10, firstLine.y + firstLine.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondLine.x + 50, secondLine.y + secondLine.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain("second");

  await page.locator(".cm-gutterElement").filter({ hasText: "2" }).click();
  await page.keyboard.type("replacement");
  await expect(source.locator(".cm-line")).toHaveText(["first line", "replacement", "third line"]);

  await source.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("all selected");
  await expect(source.locator(".cm-line")).toHaveText(["all selected"]);
});

test("selects a preview line, a range, and the whole preview", async ({ page }) => {
  await page.goto("/workspace");
  const source = page.locator(".cm-content");
  await expect(source).toBeVisible();
  await source.fill("first paragraph\n\nsecond paragraph");

  const preview = page.locator(".preview-content");
  await expect(preview.getByText("second paragraph")).toBeVisible();
  await preview.getByText("second paragraph").click();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("second paragraph");

  const first = await preview.getByText("first paragraph").boundingBox();
  const second = await preview.getByText("second paragraph").boundingBox();
  if (!first || !second) throw new Error("Preview paragraphs are not visible");
  await page.mouse.move(first.x + 5, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + 50, second.y + second.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain("irst paragraph");

  await preview.focus();
  await page.keyboard.press("Control+a");
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain("second paragraph");

  await page.getByRole("button", { name: "プレビューを編集" }).click();
  await preview.getByText("second paragraph").click();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("second paragraph");
  await page.keyboard.press("Control+a");
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain("first paragraph");
});

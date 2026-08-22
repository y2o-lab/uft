import { expect, test } from "@playwright/test";

test("a canvas diagram saves its SVG and can be embedded in Markdown", async ({
  page,
}) => {
  const promptValues = ["System flow", "flow"];
  await page.addInitScript((values) => {
    window.prompt = () => values.shift() ?? null;
  }, promptValues);

  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/workspace");
  await expect(page.getByRole("button", { name: "▤ overview.md" })).toBeVisible();
  await expect(page.getByText("このブラウザに安全に保存されます")).toBeVisible();
  await page.keyboard.press("Meta+Shift+K");
  await page.getByRole("button", { name: "新しい図表" }).click();

  await expect(page.getByRole("heading", { name: "System flow" })).toBeVisible();
  await expect(page.locator(".svelte-flow")).toBeVisible();
  await expect(page.getByText("保存済み")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Markdown に SVG を挿入" }).click();
  await expect(page.getByRole("button", { name: "▤ overview.md" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText(
    "assets/diagrams/System flow.svg",
  );
  await expect(page.getByText("保存済み")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("保存に失敗しました")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "◇ System flow" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText(
    "assets/diagrams/System flow.svg",
  );
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator('.preview-content img[alt="System flow"]')).toHaveAttribute(
    "src",
    /^blob:/,
  );
  expect(pageErrors).toEqual([]);
});

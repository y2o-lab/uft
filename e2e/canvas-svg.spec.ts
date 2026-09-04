import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

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
  await expect(page.getByRole("button", { name: "overview.md" })).toBeVisible();
  await expect(page.getByText("複数タブ同期モードで動作中")).toBeVisible();
  await page.keyboard.press("Meta+Shift+K");
  await page.getByRole("button", { name: "新しい図表" }).click();

  await expect(page.getByRole("heading", { name: "System flow" })).toBeVisible();
  await expect(page.locator(".svelte-flow")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Markdown に SVG を挿入" }).locator("svg.lucide-file-output"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ノードを追加" }).locator("svg.lucide-plus"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "選択を削除" }).locator("svg.lucide-trash-2"),
  ).toBeVisible();

  // Insertion must wait for SVG persistence instead of leaving a reference to
  // a generated-but-not-yet-stored asset.
  await page.getByRole("button", { name: "Markdown に SVG を挿入" }).click();
  await expect(page.getByRole("button", { name: "overview.md" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText(
    /assets\/diagrams\/System-flow-diagram-[^\s)]+\.svg/,
  );
  await expect(page.getByText("保存済み")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("保存に失敗しました")).toHaveCount(0);

  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "ZIP バックアップ" }).click();
  const exported = await backupDownload;
  const exportedPath = await exported.path();
  expect(exportedPath).not.toBeNull();

  await page.locator('input[accept="application/zip,.zip"]').setInputFiles({
    name: "diagram-backup.zip",
    mimeType: "application/zip",
    buffer: await readFile(exportedPath as string),
  });
  await expect(page.getByText("新しいワークスペースとして復元しました")).toBeVisible();
  await expect(page.getByRole("button", { name: "System flow" })).toBeVisible();
  await page.getByRole("button", { name: "overview.md" }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(
    page.locator('.preview-content img[alt="System flow"]'),
  ).toHaveAttribute("src", /^blob:/);

  await page.reload();
  await expect(page.getByRole("button", { name: "System flow" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText(
    /assets\/diagrams\/System-flow-diagram-[^\s)]+\.svg/,
  );
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator('.preview-content img[alt="System flow"]')).toHaveAttribute(
    "src",
    /^blob:/,
  );
  expect(pageErrors).toEqual([]);
});

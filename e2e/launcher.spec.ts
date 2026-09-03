import { expect, test } from "@playwright/test";

test("launcher gives direct access to the workspace and document conversion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "作業を始めるツールを選択" }),
  ).toBeVisible();

  const workspace = page.getByRole("link", {
    name: "Markdown ワークスペース 文書の作成、編集、プレビュー、ZIP バックアップ",
  });
  const converter = page.getByRole("link", {
    name: "文書を Markdown に変換 ローカルの Word、PDF、表計算ファイルなどを imports/ へ追加",
  });
  await expect(workspace).toHaveAttribute("href", "/workspace");
  await expect(converter).toHaveAttribute("href", "/convert-to-markdown");
});

test("launcher filters tools and opens its search with the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "ツールを検索 ⌘ K" });
  await page.keyboard.press("Meta+K");
  await expect(search).toBeFocused();
  await search.fill("変換");
  await expect(
    page.getByRole("link", { name: "文書を Markdown に変換 ローカルの Word、PDF、表計算ファイルなどを imports/ へ追加" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Markdown ワークスペース 文書の作成、編集、プレビュー、ZIP バックアップ",
    }),
  ).toHaveCount(0);
});

test("global launcher shortcut opens an overlay without leaving the workspace", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.keyboard.press("Meta+K");
  const launcher = page.getByRole("dialog", { name: "ツールランチャー" });
  const search = launcher.getByRole("textbox");
  await expect(launcher).toBeVisible();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(search).toBeFocused();
  await search.fill("変換");
  await expect(
    launcher.getByRole("link", {
      name: "文書を Markdown に変換 ローカルの Word、PDF、表計算ファイルなどを imports/ へ追加 ↵",
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(launcher).toBeHidden();
  await expect(page.locator(".cm-content")).toBeVisible();
});

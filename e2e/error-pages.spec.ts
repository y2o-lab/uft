import { expect, test } from "@playwright/test";

test("unknown paths show the custom 404 page", async ({ page }) => {
  await page.goto("/missing-page");

  await expect(page).toHaveTitle("404 — UFT");
  await expect(
    page.getByRole("heading", { name: "ページが見つかりません" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "ホームへ戻る" }).first()).toHaveAttribute(
    "href",
    "/",
  );
});

test("unexpected client errors show the recovery page", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        error: new Error("Test error"),
        message: "Test error",
      }),
    );
  });

  await expect(page).toHaveTitle("UNEXPECTED ERROR — UFT");
  await expect(
    page.getByRole("heading", { name: "問題が発生しました" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "再読み込み" })).toBeVisible();
});

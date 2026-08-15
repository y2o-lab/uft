import { expect, test } from "@playwright/test";
import path from "node:path";

test("converts a selected CSV into an editable imports Markdown document", async ({
  page,
}) => {
  await page.goto("/convert-to-markdown");
  await expect(
    page.getByRole("heading", { name: "文書を Markdown に変換" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "複数の文書を選択" })).toBeEnabled();

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.join(import.meta.dirname, "fixtures/project-plan.csv"));

  await expect(page).toHaveURL(/\/workspace\?entry=/, { timeout: 25_000 });
  await expect(page.getByText("project-plan.md", { exact: true })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("Import documents");
});

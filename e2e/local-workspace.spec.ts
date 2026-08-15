import { expect, test } from "@playwright/test";

test("edits are persisted after reload", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# Persisted\n\nSaved locally.");
  await page.getByRole("button", { name: /保存/ }).click();
  await expect(page.locator(".status")).toContainText("保存済み");
  await page.reload();
  await expect(page.locator(".preview-content")).toContainText("Saved locally.");
});

test("command templates remain separate Markdown blocks", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# Overview\n\nA local-first design document.");

  await page.getByRole("button", { name: /コマンド/ }).click();
  await page.getByRole("button", { name: "表テンプレートを挿入" }).click();

  await expect(page.locator(".preview-content h1")).toHaveText("Overview");
  await expect(page.locator(".preview-content table")).toBeVisible();
});

test("long documents scroll inside the editor and preview panes", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(
    "# Scroll test\n\n" +
      Array.from(
        { length: 80 },
        (_, index) =>
          `## Section ${index + 1}\n\nLong-form content for scroll testing.\n`,
      ).join("\n") +
      "\n## Final section\n\nEnd of the document.",
  );

  const dimensions = await page.evaluate(() => {
    const editorScroller = document.querySelector(".cm-scroller");
    const previewPane = document.querySelector(".preview-pane");
    return {
      page: [
        document.scrollingElement?.scrollHeight,
        document.scrollingElement?.clientHeight,
      ],
      editor: [editorScroller?.scrollHeight, editorScroller?.clientHeight],
      preview: [previewPane?.scrollHeight, previewPane?.clientHeight],
    };
  });
  expect(dimensions.page[0]).toBe(dimensions.page[1]);
  expect(dimensions.editor[0]).toBeGreaterThan(dimensions.editor[1] ?? 0);
  expect(dimensions.preview[0]).toBeGreaterThan(dimensions.preview[1] ?? 0);

  await page.locator(".preview-pane").evaluate((pane) => {
    pane.scrollTop = pane.scrollHeight;
  });
  await expect(
    page.getByRole("heading", { name: "Final section" }),
  ).toBeInViewport();
});

test("sidebar scrolls independently from the fixed application frame", async ({
  page,
}) => {
  let documentNumber = 0;
  page.on("dialog", (dialog) => {
    documentNumber += 1;
    void dialog.accept(`scroll-test-${documentNumber}`);
  });

  await page.goto("/");
  const newDocument = page.getByRole("button", { name: "新しい文書" });
  for (let index = 0; index < 36; index += 1) await newDocument.click();

  const beforeScroll = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const topbar = document.querySelector<HTMLElement>(".topbar");
    const footer = document.querySelector<HTMLElement>(".footer");
    return {
      sidebar: sidebar ? [sidebar.scrollHeight, sidebar.clientHeight] : null,
      topbarTop: topbar?.getBoundingClientRect().top,
      footerBottom: footer?.getBoundingClientRect().bottom,
    };
  });
  expect(beforeScroll.sidebar?.[0]).toBeGreaterThan(
    beforeScroll.sidebar?.[1] ?? 0,
  );

  await page.locator(".sidebar").evaluate((sidebar) => {
    sidebar.scrollTop = sidebar.scrollHeight;
  });
  const afterScroll = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const topbar = document.querySelector<HTMLElement>(".topbar");
    const footer = document.querySelector<HTMLElement>(".footer");
    return {
      sidebarTop: sidebar?.scrollTop,
      sidebarMax: sidebar ? sidebar.scrollHeight - sidebar.clientHeight : null,
      topbarTop: topbar?.getBoundingClientRect().top,
      footerBottom: footer?.getBoundingClientRect().bottom,
    };
  });
  expect(afterScroll.sidebarTop).toBe(afterScroll.sidebarMax);
  expect(afterScroll.topbarTop).toBe(beforeScroll.topbarTop);
  expect(afterScroll.footerBottom).toBe(beforeScroll.footerBottom);
});

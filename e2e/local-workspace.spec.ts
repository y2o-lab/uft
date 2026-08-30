import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

function backupArchive(name: string, path: string, content: string): Uint8Array {
  const markdown = strToU8(content);
  const manifest = {
    formatVersion: 1,
    workspace: {
      id: "backup-source",
      name,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    files: [
      {
        path,
        mime: "text/markdown",
        checksum: createHash("sha256").update(markdown).digest("hex"),
        size: markdown.byteLength,
      },
    ],
  };
  return zipSync({
    [path]: markdown,
    "uft-manifest.json": strToU8(JSON.stringify(manifest)),
  });
}

test("downloads a ZIP backup", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "ZIP バックアップ" }).click();
  const exported = await download;

  expect(exported.suggestedFilename()).toMatch(/\.zip$/);
  await expect(page.locator(".status")).toContainText(
    "ZIP バックアップをダウンロードしました",
  );
});

test("downloads the open Markdown document", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();

  await page.keyboard.press("Meta+Shift+K");
  const markdownDownloadCommand = page.getByRole("button", {
    name: "開いている Markdown をダウンロード",
  });
  await expect(markdownDownloadCommand).toBeVisible();
  const download = page.waitForEvent("download");
  await markdownDownloadCommand.click();
  const exported = await download;

  expect(exported.suggestedFilename()).toBe("overview.md");
  await expect(page.locator(".status")).toContainText(
    "Markdown をダウンロードしました",
  );
});

test("edits are persisted after reload", async ({ page }) => {
  await page.goto("/workspace");
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

test("falls back to IndexedDB when OPFS is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/workspace");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await expect(page.locator(".status")).toContainText("互換保存モード");
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# Fallback\n\nSaved in IndexedDB.");
  await page.getByRole("button", { name: /保存/ }).click();
  await expect(page.locator(".status")).toContainText("保存済み");

  await page.reload();
  await expect(page.locator(".preview-content")).toContainText(
    "Saved in IndexedDB.",
  );
});

test("a second tab is visibly read-only while another tab holds the writer lock", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.getByText("このブラウザに安全に保存されます")).toBeVisible();

  const secondTab = await page.context().newPage();
  await secondTab.goto("/workspace");
  await expect(
    secondTab.getByText("別の UFT タブが書き込み中です（読み取り専用）"),
  ).toBeVisible();
  await expect(
    secondTab.getByRole("button", { name: "新しい文書" }),
  ).toBeDisabled();
  await expect(secondTab.locator(".cm-content")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await secondTab.close();
});

test("a read-only tab acquires the writer lock after the original tab closes", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();

  const secondTab = await page.context().newPage();
  await secondTab.goto("/workspace");
  const newDocument = secondTab.getByRole("button", { name: "新しい文書" });
  await expect(newDocument).toBeDisabled();

  await page.close();
  await secondTab.bringToFront();
  await expect(newDocument).toBeEnabled();
  await expect(secondTab.locator(".cm-content")).toHaveAttribute(
    "contenteditable",
    "true",
  );
  await secondTab.close();
});

test("restored workspaces remain saveable after reloading alongside another workspace", async ({
  page,
}) => {
  await page.goto("/workspace");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# Existing workspace");
  await page.getByRole("button", { name: /保存/ }).click();
  await expect(page.locator(".status")).toContainText("保存済み");

  await page
    .locator('input[accept="application/zip,.zip"]')
    .setInputFiles({
      name: "restored.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(
        backupArchive("Restored workspace", "restored.md", "# Restored"),
      ),
    });
  await expect(page.locator(".status")).toContainText(
    "新しいワークスペースとして復元しました",
  );

  await page.reload();
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("# Restored");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("\n\nPersisted after reload.");
  await page.getByRole("button", { name: /保存/ }).click();
  await expect(page.locator(".status")).toContainText("保存済み");
  await expect(page.getByText("保存に失敗しました")).toHaveCount(0);
});

test("switching workspaces remains selected after reloading", async ({ page }) => {
  await page.goto("/workspace");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# Original workspace");
  await page.getByRole("button", { name: /保存/ }).click();

  await page
    .locator('input[accept="application/zip,.zip"]')
    .setInputFiles({
      name: "newer.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(
        backupArchive("Newer workspace", "newer.md", "# Newer workspace"),
      ),
    });
  await expect(page.locator(".status")).toContainText(
    "新しいワークスペースとして復元しました",
  );

  page.once("dialog", (dialog) => void dialog.accept("default"));
  await page.getByRole("button", { name: /コマンド/ }).click();
  await page.getByRole("button", { name: "ワークスペースを切り替える" }).click();
  await expect(editor).toContainText("# Original workspace");

  await page.reload();
  await expect(editor).toContainText("# Original workspace");
});

test("command templates remain separate Markdown blocks", async ({ page }) => {
  await page.goto("/workspace");
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

test("compares the current Markdown document with another local document", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept("baseline.md"));

  await page.goto("/workspace");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# Plan\n\nShared\n\n- Keep\n- Added");

  await page.getByRole("button", { name: "新しい文書" }).click();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# Plan\n\nShared\n\n- Keep\n- Removed");

  await page.getByRole("button", { name: /overview\.md/ }).click();
  await page.getByRole("button", { name: "Diff" }).click();

  await expect(page.getByLabel("Markdown comparison")).toBeVisible();
  await expect(page.locator(".diff-line.added")).toContainText("- Added");
  await expect(page.locator(".diff-line.removed")).toContainText("- Removed");
  await expect(page.locator(".diff-summary")).toContainText("+1 additions");
  await expect(page.locator(".diff-summary")).toContainText("−1 removals");
});

test("searches comparison documents before switching the diff target", async ({
  page,
}) => {
  const names = ["baseline.md", "release-notes.md"];
  page.on("dialog", (dialog) => void dialog.accept(names.shift()));

  await page.goto("/workspace");
  await page.getByRole("button", { name: "新しい文書" }).click();
  await page.getByRole("button", { name: "新しい文書" }).click();
  await page.getByRole("button", { name: /overview\.md/ }).click();
  await page.getByRole("button", { name: "Diff" }).click();

  const targetPicker = page.getByRole("button", {
    name: /比較元:/,
  });
  await targetPicker.click();
  const search = page.getByRole("textbox", { name: "比較元を検索" });
  await search.fill("release");
  await page.getByRole("option", { name: "release-notes.md" }).click();

  await expect(targetPicker).toContainText("release-notes.md");
  await expect(search).toBeHidden();
});

test("selects a searched comparison document with the keyboard", async ({
  page,
}) => {
  const names = ["baseline.md", "release-notes.md"];
  page.on("dialog", (dialog) => void dialog.accept(names.shift()));

  await page.goto("/workspace");
  await page.getByRole("button", { name: "新しい文書" }).click();
  await page.getByRole("button", { name: "新しい文書" }).click();
  await page.getByRole("button", { name: /overview\.md/ }).click();
  await page.getByRole("button", { name: "Diff" }).click();
  await page.getByRole("button", { name: /比較元:/ }).click();

  const search = page.getByRole("textbox", { name: "比較元を検索" });
  await search.press("ArrowDown");
  await search.press("Enter");

  await expect(page.getByRole("button", { name: /比較元:/ })).toContainText(
    "release-notes.md",
  );
  await expect(search).toBeHidden();
});

test("switching Markdown documents replaces the source editor content", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept("second.md"));

  await page.goto("/workspace");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# First document");

  await page.getByRole("button", { name: "新しい文書" }).click();
  await expect(editor).toContainText("# Untitled");
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# Second document");

  await page.getByRole("button", { name: /overview\.md/ }).click();
  await expect(editor).toContainText("# First document");
});

test("long documents scroll inside the editor and preview panes", async ({ page }) => {
  await page.goto("/workspace");
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

  await page.goto("/workspace");
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

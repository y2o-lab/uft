import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
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

async function submitTextInputDialog(page: Page, value: string): Promise<void> {
  const input = page.locator("#text-input-dialog-value");
  await expect(input).toBeVisible();
  await input.fill(value);
  await input.press("Enter");
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

test("uses Lucide icons for workspace actions", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();

  const save = page.getByRole("button", { name: /保存/ });
  await expect(save.locator("svg.lucide-save")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ZIP バックアップ" }).locator("svg.lucide-download"),
  ).toBeVisible();

});

test("uses the site modal instead of a browser prompt for Markdown names", async ({ page }) => {
  let browserDialogOpened = false;
  page.on("dialog", (dialog) => {
    browserDialogOpened = true;
    void dialog.dismiss();
  });

  await page.goto("/workspace");
  await page.getByRole("button", { name: "新しい文書" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "新しいMarkdown 文書名" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Markdown 文書名" })).toBeFocused();
  await submitTextInputDialog(page, "modal-name.md");

  await expect(page.locator('[data-entry-path="docs/modal-name.md"]')).toBeVisible();
  expect(browserDialogOpened).toBe(false);
});

test("moves files and folders by dragging them onto folders", async ({ page }) => {
  const names = ["Drop target", "nested", "dragged.md"];

  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();

  for (const name of names) {
    await page.getByRole("button", { name: name.endsWith(".md") ? "新しい文書" : "新しいフォルダ" }).click();
    await submitTextInputDialog(page, name);
  }

  const target = page.locator('[data-entry-path="docs/Drop target"]');
  const nested = page.locator('[data-entry-path="docs/Drop target/nested"]');
  const file = page.locator(
    '[data-entry-path="docs/Drop target/nested/dragged.md"]',
  );
  const docs = page.locator('[data-entry-path="docs"]');

  await expect(file).toBeVisible();
  await file.dragTo(target);
  await expect(
    page.locator('[data-entry-path="docs/Drop target/dragged.md"]'),
  ).toBeVisible();
  await page.waitForTimeout(400);

  await nested.dragTo(docs);
  await expect(page.locator('[data-entry-path="docs/nested"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "移動" })).toHaveCount(0);
  await page.waitForTimeout(400);
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

test("closes command modals when their backdrop is clicked", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();

  await page.keyboard.press("Meta+K");
  await expect(page.getByRole("dialog", { name: "ツールランチャー" })).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(page.getByRole("dialog", { name: "ツールランチャー" })).toBeHidden();

  await page.keyboard.press("Meta+Shift+K");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeHidden();
});

test("the command palette scrolls within the modal when its contents are tall", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 320 });
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();

  await page.keyboard.press("Meta+Shift+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect
    .poll(() =>
      palette.evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true);

  await palette.hover();
  await page.mouse.wheel(0, 1_000);
  await expect.poll(() => palette.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(
    palette.getByRole("button", { name: "プレビューを印刷 / PDF 保存" }),
  ).toBeVisible();
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

test("restores a deleted document after its deletion has been saved", async ({
  page,
}) => {
  await page.goto("/workspace");
  const overview = page.locator('[data-entry-path="docs/overview.md"]');
  await expect(overview).toBeVisible();

  await page.getByRole("button", { name: "削除" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "削除" }).click();
  await expect(overview).toBeHidden();
  await expect(page.locator(".status")).toContainText("保存済み");

  await page
    .getByRole("button", { name: "削除しました。取り消す" })
    .click();
  await expect(overview).toBeVisible();
  await expect(
    page.getByRole("button", { name: "削除しました。取り消す" }),
  ).toBeHidden();
  await expect(page.locator(".status")).toContainText("保存済み");

  await page.reload();
  await expect(overview).toBeVisible();
});

test("shows a live character count on the Markdown editor", async ({ page }) => {
  await page.goto("/workspace");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# 日本語🙂\n\ntext");

  await expect(page.getByTestId("markdown-character-count")).toHaveText(
    "文字数: 12（改行を含む）",
  );
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
  await expect(page.locator(".status")).toContainText("複数タブ同期モード");
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

test("multiple tabs remain editable and synchronize saved Markdown", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.getByText("複数タブ同期モードで動作中")).toBeVisible();

  const secondTab = await page.context().newPage();
  await secondTab.goto("/workspace");
  await expect(secondTab.getByRole("button", { name: "新しい文書" })).toBeEnabled();
  await expect(secondTab.locator(".cm-content")).toHaveAttribute(
    "contenteditable",
    "true",
  );

  const firstEditor = page.locator(".cm-content");
  await firstEditor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# Shared\n\nSaved from the first tab.");
  await page.getByRole("button", { name: /保存/ }).click();
  await expect(secondTab.locator(".preview-content")).toContainText(
    "Saved from the first tab.",
  );
  await expect(secondTab.locator(".cm-content")).toContainText(
    "Saved from the first tab.",
  );

  const secondEditor = secondTab.locator(".cm-content");
  await secondEditor.click();
  await secondTab.keyboard.press("Meta+A");
  await secondTab.keyboard.insertText("# Shared\n\nSaved from the second tab.");
  await secondTab.getByRole("button", { name: /保存/ }).click();
  await expect(page.locator(".preview-content")).toContainText(
    "Saved from the second tab.",
  );
  await expect(page.locator(".cm-content")).toContainText(
    "Saved from the second tab.",
  );
  await secondTab.close();
});

test("ZIP restore adds files to the current workspace and remains saveable after reload", async ({
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
    "現在のワークスペースへ ZIP を復元しました",
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

test("a newly created workspace can be switched away from and remains selected", async ({ page }) => {
  await page.goto("/workspace");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# Original workspace");

  await page.getByRole("button", { name: /新規 WS/ }).click();
  await submitTextInputDialog(page, "Newer workspace");
  await expect(page.locator(".status")).toContainText("「Newer workspace」を作成しました");
  await expect(editor).toContainText("# Newer workspace");

  await page.getByRole("button", { name: /コマンド/ }).click();
  await page.getByRole("button", { name: "ワークスペースを切り替える" }).click();
  const workspaceIdSelect = page.getByRole("combobox", {
    name: "ワークスペース ID",
  });
  await expect(workspaceIdSelect).toBeVisible();
  await expect(workspaceIdSelect).toHaveText(/default/);
  await expect(page.getByRole("dialog")).not.toContainText("My workspace");
  await workspaceIdSelect.selectOption("default");
  await page.getByRole("dialog").getByRole("button", { name: "開く" }).click();
  await expect(editor).toContainText("# Original workspace");

  await page.reload();
  await expect(editor).toContainText("# Original workspace");
});

test("creates a workspace with the keyboard shortcut", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.locator(".cm-content")).toBeVisible();

  await page.keyboard.press("Meta+Alt+N");
  await submitTextInputDialog(page, "Shortcut workspace");

  await expect(page.locator(".status")).toContainText("「Shortcut workspace」を作成しました");
  await expect(page.locator(".cm-content")).toContainText("# Shortcut workspace");
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
  await page.goto("/workspace");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# Plan\n\nShared\n\n- Keep\n- Added");

  await page.getByRole("button", { name: "新しい文書" }).click();
  await submitTextInputDialog(page, "baseline.md");
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

  await page.goto("/workspace");
  for (const name of names) {
    await page.getByRole("button", { name: "新しい文書" }).click();
    await submitTextInputDialog(page, name);
  }
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

  await page.goto("/workspace");
  for (const name of names) {
    await page.getByRole("button", { name: "新しい文書" }).click();
    await submitTextInputDialog(page, name);
  }
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
  await page.goto("/workspace");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText("# First document");

  await page.getByRole("button", { name: "新しい文書" }).click();
  await submitTextInputDialog(page, "second.md");
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
  await page.goto("/workspace");
  const newDocument = page.getByRole("button", { name: "新しい文書" });
  for (let index = 0; index < 36; index += 1) {
    await newDocument.click();
    await submitTextInputDialog(page, `scroll-test-${index + 1}`);
  }

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

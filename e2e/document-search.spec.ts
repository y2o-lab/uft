import { expect, test } from "@playwright/test";

test.use({
  launchOptions: process.env.PLAYWRIGHT_VIDEO === "1" ? { slowMo: 350 } : {},
  video: process.env.PLAYWRIGHT_VIDEO === "1" ? { mode: "on", size: { width: 1280, height: 720 } } : "off",
});

const documentText = '# 文書内検索の検証\n\n検索対象の最初の段落です。\n\n検索**対象**は強調表示の境界も検索できます。\n\n最後の検索対象です。';

test('searches source and preview with shortcuts without changing the document', async ({ page }, testInfo) => {
  await page.goto('/workspace');
  const source = page.locator('.cm-content');
  await expect(source).toBeVisible();
  await source.fill(documentText);
  await source.press('Control+f');
  const sourceSearch = page.getByRole('search', { name: 'エディタ内を検索' });
  const sourceInput = sourceSearch.getByRole('textbox');
  await expect(sourceInput).toBeFocused();
  await sourceInput.fill('検索対象');
  await expect(sourceSearch.locator('output')).toHaveText('1 / 2');
  await expect(page.locator('.document-match')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("source-search.png") });
  await sourceInput.press('Enter');
  await expect(sourceSearch.locator('output')).toHaveText('2 / 2');
  await sourceInput.press('Enter');
  await expect(sourceSearch.locator('output')).toHaveText('1 / 2');
  await sourceInput.press('Shift+Enter');
  await expect(sourceSearch.locator('output')).toHaveText('2 / 2');
  await sourceInput.fill('一致しない検索語');
  await expect(sourceSearch.locator('output')).toHaveText('一致なし');
  await expect(sourceSearch.getByRole('button', { name: '次の一致' })).toBeDisabled();
  await sourceInput.press('Escape');
  await expect(sourceSearch).toHaveCount(0);
  await expect(source).toBeFocused();
  await expect(page.locator('.document-match')).toHaveCount(0);

  const preview = page.locator('.preview-content');
  await expect(preview).toContainText('検索対象は強調表示');
  await preview.focus();
  await preview.press('Meta+f');
  const previewSearch = page.getByRole('search', { name: 'プレビュー内を検索' });
  const previewInput = previewSearch.getByRole('textbox');
  await expect(previewInput).toBeFocused();
  await previewInput.fill('検索対象');
  await expect(previewSearch.locator('output')).toHaveText('1 / 3');
  await previewInput.press('Enter');
  await expect(previewSearch.locator('output')).toHaveText('2 / 3');
  await previewSearch.getByRole('button', { name: '前の一致' }).click();
  await expect(previewSearch.locator('output')).toHaveText('1 / 3');
  await expect.poll(() => page.evaluate(() => {
    const registry = (CSS as unknown as { highlights: Map<string, { size: number }> }).highlights;
    return [registry.get('uft-find-preview')?.size, registry.get('uft-find-preview-active')?.size];
  })).toEqual([3, 1]);
  await page.screenshot({ path: testInfo.outputPath("preview-search.png") });
  await expect(preview.locator('mark')).toHaveCount(0);
  await previewInput.press('Escape');
  await expect(preview).toBeFocused();
  await expect(source.locator('.cm-line')).toHaveText(documentText.split('\n'));
  await expect(page.locator('.status')).toContainText('保存済み');
  await page.reload();
  await expect(source.locator('.cm-line')).toHaveText(documentText.split('\n'));
});

test('search stays usable in source-only, preview-only and mobile layouts', async ({ page }) => {
  await page.goto('/workspace');
  const source = page.locator('.cm-content');
  await expect(source).toBeVisible();
  await source.fill('Alpha alpha\n\n日本語の検索');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page.keyboard.press('Control+f');
  await page.getByLabel('エディタ内の検索語').fill('ALPHA');
  await expect(page.getByRole('search').locator('output')).toHaveText('1 / 2');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.keyboard.press('Control+f');
  await page.getByLabel('プレビュー内の検索語').fill('日本語');
  await expect(page.getByRole('search').locator('output')).toHaveText('1 / 1');
  await page.getByLabel('プレビュー内の検索語').press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'プレビュー内を検索', exact: true }).click();
  await page.getByLabel('プレビュー内の検索語').fill('alpha');
  await expect(page.getByRole('search').locator('output')).toHaveText('1 / 2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('refreshes matches while editing, scrolls to distant results and resets on document switch', async ({ page }) => {
  await page.goto('/workspace');
  const source = page.locator('.cm-content');
  await expect(source).toBeVisible();
  await source.fill(['needle at start', ...Array.from({ length: 100 }, (_, i) => `Paragraph ${i}`), 'needle at end'].join('\n\n'));
  await source.press('Control+f');
  const input = page.getByLabel('エディタ内の検索語');
  await input.fill('needle');
  await input.press('Enter');
  await expect(page.getByRole('search').locator('output')).toHaveText('2 / 2');
  await expect.poll(() => page.locator('.cm-scroller').evaluate((node) => node.scrollTop)).toBeGreaterThan(500);
  await source.fill('needle changed');
  await expect(page.getByRole('search').locator('output')).toHaveText('1 / 1');
  await input.press('Escape');
  await expect(page.locator('.preview-content')).toContainText('needle changed');
  await page.getByRole('button', { name: 'プレビューを編集', exact: true }).click();
  const preview = page.getByLabel('編集可能な Markdown プレビュー');
  await preview.focus();
  await preview.press('Control+f');
  const previewInput = page.getByLabel('プレビュー内の検索語');
  await expect(previewInput).toBeVisible();
  await previewInput.fill('needle');
  await expect(page.getByRole('search').locator('output')).toHaveText('1 / 1');
  await preview.fill('needle needle');
  await expect(page.getByRole('search').locator('output')).toHaveText('1 / 2');
  await previewInput.focus();
  await previewInput.fill('needle');
  await page.getByRole('button', { name: '新しい文書', exact: true }).click();
  const name = page.locator('#text-input-dialog-value');
  await name.fill('search-next.md');
  await name.press('Enter');
  await expect(page.getByRole('search')).toHaveCount(0);
  await expect(source).not.toContainText('needle');
});

test('does not scan preview text while search is closed or empty', async ({ page }) => {
  await page.goto('/workspace');
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.evaluate(() => {
    const original = document.createTreeWalker.bind(document);
    let scans = 0;
    document.createTreeWalker = (...args) => {
      if (args[0] instanceof HTMLElement && args[0].classList.contains('preview-content')) scans++;
      return original(...args);
    };
    Object.defineProperty(window, '__previewSearchScans', { get: () => scans });
  });
  const scans = () => page.evaluate(() => (window as unknown as { __previewSearchScans: number }).__previewSearchScans);
  await page.getByRole('button', { name: 'プレビューを編集', exact: true }).click();
  const preview = page.getByLabel('編集可能な Markdown プレビュー');
  await preview.fill('needle first');
  await expect(page.locator('.cm-content')).toContainText('needle first');
  expect(await scans()).toBe(0);
  await preview.press('Control+f');
  const input = page.getByLabel('プレビュー内の検索語');
  await preview.fill('needle second');
  await expect(page.locator('.cm-content')).toContainText('needle second');
  expect(await scans()).toBe(0);
  await input.fill('needle');
  await expect(page.getByRole('search').locator('output')).toHaveText('1 / 1');
  expect(await scans()).toBeGreaterThan(0);
  await input.fill('');
  const afterClear = await scans();
  await preview.fill('needle third');
  await expect(page.locator('.cm-content')).toContainText('needle third');
  expect(await scans()).toBe(afterClear);
  await input.fill('needle');
  await input.press('Escape');
  const afterClose = await scans();
  await preview.fill('needle fourth');
  await expect(page.locator('.cm-content')).toContainText('needle fourth');
  expect(await scans()).toBe(afterClose);
});

test('resets preview search when switching workspaces with identical document paths', async ({ page }) => {
  await page.goto('/workspace');
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByRole('button', { name: /新規 WS/ }).click();
  const name = page.locator('#text-input-dialog-value');
  await name.fill('Search workspace');
  await name.press('Enter');
  await expect(page.locator('.cm-content')).toContainText('# Search workspace');
  const originalPath = await page.locator('.document-chip').textContent();
  await page.locator('.preview-content').press('Control+f');
  await page.getByLabel('プレビュー内の検索語').fill('workspace');
  await expect(page.getByRole('search')).toBeVisible();
  await page.getByRole('button', { name: /コマンド/ }).click();
  await page.getByRole('button', { name: 'ワークスペースを開く', exact: true }).click();
  await page.getByRole('combobox', { name: 'ワークスペース ID' }).selectOption('default');
  await page.getByRole('dialog').getByRole('button', { name: '開く', exact: true }).click();
  await expect(page.locator('.document-chip')).toHaveText(originalPath ?? '');
  await expect(page.locator('.cm-content')).not.toContainText('# Search workspace');
  await expect(page.getByRole('search')).toHaveCount(0);
});

for (const width of [1280, 390]) {
  test(`keeps preview search below the toolbar when scrolled at width ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/workspace');
    const source = page.locator('.cm-content');
    await expect(source).toBeVisible();
    await source.fill(Array.from({ length: 80 }, (_, index) => `Paragraph ${index} needle`).join('\n\n'));
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.locator('.preview-content').press('Control+f');
    await page.getByLabel('プレビュー内の検索語').fill('needle');
    await expect(page.getByRole('search').locator('output')).toHaveText('1 / 80');
    await page.locator('.preview-pane').evaluate((pane) => { pane.scrollTop = pane.scrollHeight; });
    await expect.poll(async () => {
      const toolbar = await page.locator('.preview-editor-bar').boundingBox();
      const search = await page.locator('.markdown-preview > .document-search').boundingBox();
      return toolbar && search ? search.y - (toolbar.y + toolbar.height) : -100;
    }).toBeGreaterThanOrEqual(-1);
    await page.getByRole('search').getByRole('button', { name: '次の一致' }).click();
    await expect(page.getByRole('search').locator('output')).toHaveText('2 / 80');
    await page.screenshot({ path: testInfo.outputPath(`sticky-search-${width}.png`) });
  });
}

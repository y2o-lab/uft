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

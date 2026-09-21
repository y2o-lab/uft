import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("a canvas diagram saves its SVG and can be embedded in Markdown", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/workspace");
  await expect(page.getByRole("button", { name: "overview.md" })).toBeVisible();
  await expect(page.getByText("複数タブ同期モードで動作中")).toBeVisible();
  await page.keyboard.press("Meta+Shift+K");
  await page.getByRole("button", { name: "新規図表" }).click();
  const dialogValue = page.locator("#text-input-dialog-value");
  await dialogValue.fill("System flow");
  await dialogValue.press("Enter");
  await expect(dialogValue).toBeVisible();
  await dialogValue.selectOption("flow");
  await page.getByRole("button", { name: "適用", exact: true }).click();

  await expect(page.getByRole("heading", { name: "System flow" })).toBeVisible();
  await expect(page.locator(".svelte-flow")).toBeVisible();
  await expect(page.locator(".diagram-node.decision")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Markdown に SVG を挿入" }).locator("svg.lucide-file-output"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ノードを追加" }).locator("svg.lucide-plus"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "選択を削除" }).locator("svg.lucide-trash-2"),
  ).toBeVisible();
  await expect(page.getByLabel("追加するノードの種類")).toContainText("AWS Lambda");
  await expect(page.getByLabel("要素を追加")).toBeVisible();
  await expect(page.getByLabel("選択項目の設定")).toContainText("要素を選択");
  await expect(page.getByText("⌘/Ctrl ＋ スクロールでズーム")).toBeVisible();

  await page.getByLabel("図表テンプレート").selectOption("aws-web");
  await page.getByRole("button", { name: "展開" }).click();
  await expect(page.locator(".diagram-node.aws")).toHaveCount(6);
  await expect(
    page.locator(".diagram-node.aws .svelte-flow__handle"),
  ).toHaveCount(24);
  await expect(page.locator(".diagram-node.aws img").first()).toHaveAttribute(
    "src",
    /^data:image\/svg\+xml/,
  );

  const firstNode = page.locator(".svelte-flow__node").first();
  const nodeBeforeDrag = await firstNode.boundingBox();
  const viewportBeforeDrag = await page
    .locator(".svelte-flow__viewport")
    .getAttribute("style");
  expect(nodeBeforeDrag).not.toBeNull();
  await page.mouse.move(
    (nodeBeforeDrag?.x ?? 0) + (nodeBeforeDrag?.width ?? 0) / 2,
    (nodeBeforeDrag?.y ?? 0) + (nodeBeforeDrag?.height ?? 0) / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    (nodeBeforeDrag?.x ?? 0) + (nodeBeforeDrag?.width ?? 0) / 2 + 160,
    (nodeBeforeDrag?.y ?? 0) + (nodeBeforeDrag?.height ?? 0) / 2 + 80,
    { steps: 8 },
  );
  await page.mouse.up();
  const nodeAfterDrag = await firstNode.boundingBox();
  expect(nodeAfterDrag?.x).toBeGreaterThan((nodeBeforeDrag?.x ?? 0) + 10);
  expect(nodeAfterDrag?.y).toBeGreaterThan((nodeBeforeDrag?.y ?? 0) + 5);
  await expect(page.locator(".svelte-flow__viewport")).toHaveAttribute(
    "style",
    viewportBeforeDrag ?? "",
  );

  await firstNode.click();
  const selectedNodeLabel = page.getByLabel("選択ノードの表示名");
  await expect(selectedNodeLabel).toHaveValue("DNS");
  await selectedNodeLabel.fill("Public DNS");
  await selectedNodeLabel.press("Tab");
  await expect(firstNode).toContainText("Public DNS");
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(firstNode).toContainText("DNS");
  await page.getByRole("button", { name: "やり直す" }).click();
  await expect(firstNode).toContainText("Public DNS");

  const canvas = page.locator(".flow-canvas");
  await canvas.hover();
  const zoomBeforeScroll = await canvas.evaluate((element) => {
    const transform = element.querySelector<SVGGElement>(
      ".svelte-flow__viewport",
    )?.getAttribute("style");
    return Number(transform?.match(/scale\(([^)]+)\)/)?.[1]);
  });
  await page.mouse.wheel(0, 180);
  const zoomAfterScroll = await canvas.evaluate((element) => {
    const transform = element.querySelector<SVGGElement>(
      ".svelte-flow__viewport",
    )?.getAttribute("style");
    return Number(transform?.match(/scale\(([^)]+)\)/)?.[1]);
  });
  expect(zoomAfterScroll).toBe(zoomBeforeScroll);

  const canvasEdges = page.locator(".svelte-flow__edge");
  await expect(canvasEdges).toHaveCount(5);
  await canvasEdges.first().press("Enter");
  await expect(canvasEdges.first()).toHaveClass(/selected/);
  await expect(page.getByLabel("接続線の向き")).toContainText("双方向");
  await expect(page.getByLabel("接続線の形")).toContainText("角丸直交");
  await page.getByLabel("接続線の向き").selectOption("both");
  await page.getByLabel("接続線の線種").selectOption("dashed");
  await page.getByLabel("接続線のラベル").fill("request / response");
  await page.getByRole("button", { name: "選択線に適用" }).click();
  const updatedPath = page.locator(
    '.svelte-flow__edge[data-id="route53-cloudfront"] path.svelte-flow__edge-path',
  );
  await expect(updatedPath).toHaveAttribute("marker-start", /^url\(/);
  await expect(updatedPath).toHaveAttribute(
    "style",
    /stroke-dasharray: 7, 5/,
  );

  // Insertion must wait for SVG persistence instead of leaving a reference to
  // a generated-but-not-yet-stored asset.
  await page.getByRole("button", { name: "Markdown に SVG を挿入" }).click();
  await expect(page.getByRole("button", { name: "overview.md" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText(
    /assets\/diagrams\/System-flow-diagram-.*\.svg/,
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
  await expect(page.getByText("現在のワークスペースへ ZIP を復元しました")).toBeVisible();
  await expect(page.getByRole("button", { name: "System flow", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "overview.md" }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(
    page.locator('.preview-content img[alt="System flow"]'),
  ).toHaveAttribute("src", /^blob:/);

  await page.reload();
  await expect(page.getByRole("button", { name: "System flow", exact: true })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText(
    /assets\/diagrams\/System-flow-diagram-.*\.svg/,
  );
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator('.preview-content img[alt="System flow"]')).toHaveAttribute(
    "src",
    /^blob:/,
  );
  expect(pageErrors).toEqual([]);
});

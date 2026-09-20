import { expect, test } from "@playwright/test";

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("launcher uses one readable column without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/");

    const cards = page.locator(".tool-launcher-card");
    await expect(cards).toHaveCount(3);
    const boxes = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      }),
    );

    expect(new Set(boxes.map((box) => box.left)).size).toBe(1);
    expect(boxes.every((box) => box.width >= 340 && box.right <= 390)).toBe(
      true,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === window.innerWidth,
      ),
    ).toBe(true);
  });

  test("workspace keeps editing, preview, navigation, and search usable", async ({
    page,
  }) => {
    await page.goto("/workspace");
    await expect(page.locator(".cm-content")).toBeVisible();

    const explorerButton = page.getByRole("button", { name: "文書一覧を開く" });
    await expect(explorerButton).toBeVisible();
    await explorerButton.click();

    const sidebar = page.getByRole("complementary", { name: "Explorer" });
    await expect(sidebar).toHaveClass(/mobile-open/);
    await expect(page.getByRole("button", { name: "新しい文書" })).toBeVisible();
    await page.getByRole("button", { name: "overview.md" }).click();
    const closedSidebar = page.locator("#workspace-sidebar");
    await expect(closedSidebar).not.toHaveClass(/mobile-open/);
    await expect(closedSidebar).toHaveCSS("visibility", "hidden");

    const source = await page.locator(".source-pane").boundingBox();
    const preview = await page.locator(".preview-pane").boundingBox();
    expect(source).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(preview?.y).toBeGreaterThan(source?.y ?? 0);
    expect(source?.width).toBeLessThanOrEqual(390);
    expect(preview?.width).toBeLessThanOrEqual(390);

    const modeTargetHeights = await page
      .locator(".mode-switch button")
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getBoundingClientRect().height),
      );
    expect(modeTargetHeights.every((height) => height >= 40)).toBe(true);

    await page.getByRole("button", { name: "コマンドを開く" }).click();
    const commandPalette = page.getByRole("dialog", {
      name: "Command palette",
    });
    await expect(commandPalette).toBeVisible();
    await expect(
      commandPalette.getByRole("button", { name: "新規図表" }),
    ).toBeVisible();
    await expect(
      commandPalette.getByRole("button", { name: "バックアップを作成" }),
    ).toBeVisible();
    await commandPalette.getByRole("button", { name: "新規図表" }).click();
    const diagramDialogValue = page.locator("#text-input-dialog-value");
    await diagramDialogValue.fill("Mobile flow");
    await diagramDialogValue.press("Enter");
    await diagramDialogValue.selectOption("flow");
    await page.getByRole("button", { name: "適用", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mobile flow" })).toBeVisible();
    await expect(page.locator(".svelte-flow")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === window.innerWidth,
      ),
    ).toBe(true);

    await page.getByRole("button", { name: "ツールを検索" }).click();
    const launcher = page.getByRole("dialog", { name: "ツールランチャー" });
    await expect(launcher).toBeVisible();
    const launcherBox = await launcher.boundingBox();
    expect(launcherBox?.width).toBe(390);
    expect(launcherBox?.y).toBeGreaterThan(300);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === window.innerWidth,
      ),
    ).toBe(true);
  });

  test("converter and IP toolkit fit the viewport with touch-sized actions", async ({
    page,
  }) => {
    for (const path of ["/convert-to-markdown", "/ip-toolkit"]) {
      await page.goto(path);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth === window.innerWidth,
        ),
      ).toBe(true);

      const primaryActions = page.locator(
        ".import-picker, .ip-primary, .ip-secondary",
      );
      const heights = await primaryActions.evaluateAll((elements) =>
        elements
          .filter((element) => element.getBoundingClientRect().height > 0)
          .map((element) => element.getBoundingClientRect().height),
      );
      expect(heights.length).toBeGreaterThan(0);
      expect(heights.every((height) => height >= 44)).toBe(true);
    }
  });
});

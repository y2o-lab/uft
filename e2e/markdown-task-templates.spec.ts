import { expect, test } from "@playwright/test";

test("keeps a kanban board intact when formatting a preview selection", async ({ page }) => {
  await page.goto("/workspace");
  const source = page.locator(".cm-content");
  const preview = page.locator(".preview-content");
  await source.fill("# リリース計画");
  await page.getByRole("button", { name: "カンバンを挿入", exact: true }).click();
  const board = preview.getByRole("region", { name: "リリース準備" });
  await expect(board).toBeVisible();
  const original = await source.innerText();

  await page.getByRole("button", { name: "プレビューを編集", exact: true }).click();
  await preview.press("ControlOrMeta+a");
  await page.locator(".preview-editor-bar").getByRole("button", { name: "太字", exact: true }).click();
  await expect.poll(() => source.innerText()).toBe(original);
  await board.getByLabel("告知文を作る の優先度").selectOption("high");
  await expect(source).toContainText('"priority": "high"');
  await expect(preview.locator("strong .board")).toHaveCount(0);
});

test("renders imported board titles and tasks as literal text", async ({ page }) => {
  await page.goto("/workspace");
  const payload = '<img src=x onerror="window.__boardScriptRan = true">';
  const board = { title: payload, tasks: [{ text: payload, status: "todo" }] };
  const markdown = ["```uft-kanban", JSON.stringify(board), "```"].join("\n");
  const source = page.locator(".cm-content");
  await source.fill(markdown);

  const preview = page.locator(".preview-content");
  const widget = preview.getByRole("region", { name: payload, exact: true });
  await expect(widget.getByRole("heading", { name: payload, exact: true })).toBeVisible();
  await widget.getByLabel(`${payload} の優先度`, { exact: true }).selectOption("high");
  await expect(source).toContainText('"priority": "high"');
  await expect(preview.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => "__boardScriptRan" in window)).toBe(false);
});

test("keeps native tasks and embedded boards in the document across preview edits and reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/workspace");
  const source = page.locator(".cm-content");
  const preview = page.locator(".preview-content");
  await expect(source).toBeVisible();
  await source.fill("# リリース計画 ###\n\n公開前の準備。");

  const shortcuts = page.getByRole("group", { name: "タスクテンプレート" });
  const todo = shortcuts.getByRole("button", { name: "TODO リストを挿入" });
  const kanban = shortcuts.getByRole("button", { name: "カンバンを挿入" });
  await todo.click();
  await expect(preview.getByRole("heading", { name: "TODO リスト" })).toBeVisible();
  await kanban.click();
  await kanban.press("Enter");

  const nativeTask = preview.locator('input[type="checkbox"]').nth(1);
  const boards = preview.getByRole("region", { name: "リリース準備" });
  await expect(boards).toHaveCount(2);
  const first = boards.first();
  const second = boards.nth(1);
  const draft = first.getByLabel("新しいタスク", { exact: true });
  await draft.fill("入力中のタスク");
  await nativeTask.check();
  await expect(source).toContainText("[x] 下書きを作成する");
  await expect(draft).toHaveValue("入力中のタスク");
  await draft.clear();
  const todoLane = first.getByRole("region", { name: "未着手", exact: true });
  const todoCards = todoLane.getByRole("button", { name: / を編集$/ });
  const releasePriority = first.getByLabel("リリースノートを書く の優先度");
  const announcementPriority = first.getByLabel("告知文を作る の優先度");
  await expect(releasePriority).toHaveValue("");
  await expect(todoCards).toHaveText(["リリースノートを書く", "告知文を作る"]);
  await releasePriority.selectOption("medium");
  await announcementPriority.focus();
  await announcementPriority.selectOption("high");
  await expect(todoCards).toHaveText(["告知文を作る", "リリースノートを書く"]);
  await expect(announcementPriority).toBeFocused();
  await announcementPriority.selectOption("");
  await expect(todoCards).toHaveText(["リリースノートを書く", "告知文を作る"]);
  await announcementPriority.selectOption("low");

  const handle = first.locator("article").filter({ hasText: "リリースノートを書く" }).locator(".grip");
  const doing = first.getByRole("region", { name: "進行中", exact: true });
  await handle.dragTo(doing.getByRole("heading"));
  await expect(first.getByRole("region", { name: "進行中", exact: true })).toContainText("リリースノートを書く");
  await expect(second.getByRole("region", { name: "未着手", exact: true })).toContainText("リリースノートを書く");

  await page.getByRole("button", { name: "プレビューを編集", exact: true }).click();
  const secondPriority = second.getByLabel("告知文を作る の優先度");
  await secondPriority.selectOption("medium");
  await expect(source.locator(".cm-line").first()).toHaveText("# リリース計画 ###");
  await secondPriority.selectOption("");
  await preview.locator("p").first().fill("公開前の準備を確認する。");
  const addForm = second.getByRole("form", { name: "タスクを追加" });
  const addTask = addForm.getByLabel("新しいタスク", { exact: true });
  const priority = addForm.getByRole("combobox", { name: "優先度", exact: true });
  const dueDate = addForm.getByLabel("期限", { exact: true });
  await addTask.fill("公開日時を確定する");
  await priority.selectOption("high");
  await dueDate.fill("2099-12-31");
  await addForm.getByRole("button", { name: "追加", exact: true }).click();
  await expect(addTask).toHaveValue("");
  await expect(priority).toHaveValue("");
  await expect(dueDate).toHaveValue("");
  await expect(source).toContainText("公開前の準備を確認する。");
  await expect(source).toContainText("公開日時を確定する");
  await expect(first).not.toContainText("公開日時を確定する");

  await expect(page.locator(".status")).toContainText("保存済み");
  await page.reload();
  await expect(nativeTask).toBeChecked();
  await expect(releasePriority).toHaveValue("medium");
  await expect(announcementPriority).toHaveValue("low");
  await expect(second.getByLabel("告知文を作る の優先度")).toHaveValue("");
  await expect(first.getByRole("region", { name: "進行中", exact: true })).toContainText("リリースノートを書く");
  const added = second.getByRole("region", { name: "未着手", exact: true }).locator("article").first();
  await expect(added).toContainText("公開日時を確定する");
  await expect(added.getByLabel("公開日時を確定する の優先度")).toHaveValue("high");
  await expect(added.getByRole("button", { name: /の期限を編集/ }).locator("time")).toHaveAttribute("datetime", "2099-12-31");

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "プレビュー内を検索", exact: true }).click();
  const search = page.getByRole("search", { name: "プレビュー内を検索" });
  const query = search.getByRole("textbox", { name: "プレビュー内の検索語" });
  await query.fill("公開日時を確定する");
  await expect(search.locator("output")).toHaveText("1 / 1");
  await query.fill("優先度");
  await expect(search.locator("output")).toHaveText("一致なし");
});

test("switches kanban sort modes without rewriting the source", async ({ page }) => {
  await page.goto("/workspace");
  const source = page.locator(".cm-content");
  const board = {
    title: "公開準備",
    tasks: [
      { text: "画像", status: "todo", dueDate: "2099-11-01" },
      { text: "手順", status: "todo", priority: "high" },
      { text: "公開", status: "todo", priority: "medium", dueDate: "2099-12-31" },
      { text: "原稿", status: "todo", priority: "low", dueDate: "2099-11-01" },
      { text: "検証", status: "todo", priority: "high", dueDate: "2100-01-01" },
      { text: "校正", status: "doing", priority: "high", dueDate: "2099-11-20" },
      { text: "確認", status: "doing", dueDate: "2099-11-05" },
    ],
  };
  await source.fill(["```uft-kanban", JSON.stringify(board, null, 2), "```"].join("\n"));
  const original = await source.innerText();
  const widget = page.getByRole("region", { name: board.title });
  const sort = widget.getByRole("combobox", { name: "並べ替え", exact: true });
  const todo = widget.getByRole("region", { name: "未着手", exact: true }).getByRole("button", { name: / を編集$/ });
  const doing = widget.getByRole("region", { name: "進行中", exact: true }).getByRole("button", { name: / を編集$/ });

  await expect(sort).toHaveValue("priority");
  await expect(todo).toHaveText(["手順", "検証", "公開", "原稿", "画像"]);
  await expect(doing).toHaveText(["校正", "確認"]);
  await page.getByRole("button", { name: "プレビューを編集", exact: true }).click();
  await sort.selectOption("dueDate");
  await expect(todo).toHaveText(["画像", "原稿", "公開", "検証", "手順"]);
  await expect(doing).toHaveText(["確認", "校正"]);
  await sort.selectOption("priorityThenDueDate");
  await expect(todo).toHaveText(["検証", "手順", "公開", "原稿", "画像"]);
  await expect(doing).toHaveText(["校正", "確認"]);
  await sort.selectOption("priority");
  await expect(todo).toHaveText(["手順", "検証", "公開", "原稿", "画像"]);
  await expect(doing).toHaveText(["校正", "確認"]);
  expect(await source.innerText()).toBe(original);

  await sort.selectOption("priorityThenDueDate");
  await widget.getByRole("button", { name: /手順 の期限を編集/ }).click();
  const edit = widget.locator("form.edit-form");
  await edit.getByLabel("期限", { exact: true }).fill("2099-10-31");
  await edit.getByRole("button", { name: "保存", exact: true }).click();
  await expect(todo).toHaveText(["手順", "検証", "公開", "原稿", "画像"]);
  await expect(source).toContainText('"dueDate": "2099-10-31"');

  const imagePriority = widget.getByRole("combobox", { name: "画像 の優先度", exact: true });
  await imagePriority.focus();
  await imagePriority.selectOption("high");
  await expect(todo).toHaveText(["手順", "画像", "検証", "公開", "原稿"]);
  await expect(imagePriority).toBeFocused();
});

test("closes foreground overlays before cancelling a kanban edit with Escape", async ({ page }) => {
  await page.goto("/workspace");
  await page.getByRole("button", { name: "カンバンを挿入", exact: true }).click();
  const source = page.locator(".cm-content");
  await expect(source).toContainText("告知文を作る");
  const original = await source.innerText();
  const editButton = page.getByRole("button", { name: "告知文を作る を編集", exact: true });
  await editButton.click();
  const title = page.getByRole("textbox", { name: "タスク名を変更" });
  await title.fill("保存前の変更");
  await title.dispatchEvent("keydown", { key: "Escape", isComposing: true });
  await expect(title).toHaveValue("保存前の変更");

  await page.keyboard.press("ControlOrMeta+Shift+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect(title).toBeFocused();
  await page.keyboard.press("ControlOrMeta+k");
  const launcher = page.getByRole("dialog", { name: "ツールランチャー" });
  await expect(launcher.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(launcher).toBeHidden();
  await expect(palette).toBeVisible();
  await expect(title).toBeFocused();

  await page.keyboard.down("Escape");
  await expect(palette).toBeHidden();
  await page.keyboard.down("Escape");
  await expect(title).toHaveValue("保存前の変更");
  await page.keyboard.up("Escape");
  await page.keyboard.press("Escape");
  await expect(title).toBeHidden();
  await expect(editButton).toBeFocused();
  await expect.poll(() => source.innerText()).toBe(original);
});

test("closes the native date picker before cancelling a kanban edit with Escape", async ({ page }) => {
  await page.goto("/workspace");
  await page.getByRole("button", { name: "カンバンを挿入", exact: true }).click();
  const deadline = page.getByRole("button", { name: /告知文を作る の期限を編集/ });
  await deadline.click();
  const date = page.locator(".edit-form").getByLabel("期限", { exact: true });
  await date.fill("2026-11-09");
  await date.evaluate((input: HTMLInputElement) => input.showPicker());
  await expect(page.locator('.edit-form input[type="date"]:open')).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(page.locator('.edit-form input[type="date"]:open')).toHaveCount(0);
  await expect(date).toHaveValue("2026-11-09");
  await page.keyboard.press("Escape");
  await expect(date).toBeHidden();
  await expect(deadline).toBeFocused();
  await expect(deadline.locator("time")).toHaveCount(0);
});

test("edits, stores, and clears kanban deadlines from the full-width preview", async ({ browser }) => {
  const page = await browser.newPage({ timezoneId: "Asia/Tokyo" });
  try {
    await page.clock.install({ time: new Date("2026-11-08T15:01:00Z") });
    await page.goto("/workspace");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("button", { name: "カンバンを挿入", exact: true }).click();

    const board = page.getByRole("region", { name: "リリース準備" });
    const card = board.locator("article").filter({ hasText: "告知文を作る" });
    const deadline = card.getByRole("button", { name: /告知文を作る の期限を編集/ });
    await deadline.click();
    const edit = board.locator("form.edit-form");
    const date = edit.getByLabel("期限", { exact: true });
    const save = edit.getByRole("button", { name: "保存", exact: true });
    await expect(date).toBeFocused();
    await date.fill("2026-11-09");
    await save.click();
    await expect(deadline.locator("time")).toHaveAttribute("datetime", "2026-11-09");
    await expect(deadline).toBeFocused();
    await expect(deadline).not.toContainText("期限切れ");

    await deadline.click();
    await date.fill("2026-11-08");
    await save.click();
    await expect(deadline).toContainText("期限切れ");
    const status = card.getByLabel("告知文を作る のステータス");
    await status.focus();
    await status.selectOption("done");
    await expect(status).toBeFocused();
    await expect(deadline).not.toContainText("期限切れ");
    await expect(page.locator(".status")).toContainText("保存済み");

    await page.reload();
    const source = page.locator(".cm-content");
    await expect(source).toContainText(/"dueDate":\s*"2026-11-08"/);
    await expect(deadline.locator("time")).toHaveAttribute("datetime", "2026-11-08");
    await deadline.click();
    await edit.getByRole("button", { name: "期限を解除", exact: true }).click();
    await save.click();
    await expect(deadline.locator("time")).toHaveCount(0);
    await expect(source).not.toContainText('"dueDate"');
  } finally {
    await page.close();
  }
});

test("keeps the board usable on a wide touch phone", async ({ browser }) => {
  const page = await browser.newPage({
    viewport: { width: 430, height: 900 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    await page.goto("/workspace");
    await page.getByRole("button", { name: "Preview", exact: true }).tap();
    await page.getByRole("button", { name: "カンバンを挿入", exact: true }).tap();

    const board = page.getByRole("region", { name: "リリース準備" });
    const lanes = board.locator("[data-lane]");
    await expect(lanes).toHaveCount(3);
    const bounds = await lanes.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().x));
    expect(new Set(bounds).size).toBe(1);
    const task = board.locator("article").filter({ hasText: "告知文を作る" });
    const status = task.getByLabel("告知文を作る のステータス");
    await expect(task.locator(".grip")).toBeHidden();
    expect(await status.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await status.selectOption("doing");
    await expect(board.getByRole("region", { name: "進行中", exact: true })).toContainText("告知文を作る");
    expect(await board.evaluate((element) => {
      const pane = element.closest(".preview-pane")!;
      return pane.scrollWidth <= pane.clientWidth;
    })).toBe(true);
  } finally {
    await page.close();
  }
});

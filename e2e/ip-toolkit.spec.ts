import { expect, test } from "@playwright/test";

test("IP Toolkit is discoverable and its local tools work without an API token", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", {
      name: "IP Toolkit IP 判定、CIDR 計算、IPv4 / IPv6 変換、ログ抽出と Lookup",
    }),
  ).toHaveAttribute("href", "/ip-toolkit");

  await page.goto("/ip-toolkit");
  await expect(page.getByRole("heading", { name: "IP Toolkit" })).toBeVisible();
  await expect(page.getByRole("link", { name: "UFT ホーム" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(page.locator(".ip-home .brand-mark")).toHaveText("u");

  await page.getByRole("button", { name: "Inspect" }).click();
  const inspectInput = page.getByRole("textbox", { name: "IP address" });
  await inspectInput.fill("10.20.30.40");
  await expect(page.getByText("Private", { exact: true })).toBeVisible();
  await expect(page.getByText("Kept local", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Network" }).click();
  await page
    .getByRole("button", { name: "CIDR Calculator / Subnet Calculator" })
    .click();
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.locator(".ip-output pre")).toContainText("Broadcast: 192.168.1.255");

  await page.getByRole("button", { name: "Convert" }).click();
  await page.getByRole("textbox", { name: "Value" }).fill("c0000201");
  await expect(page.getByText("192.0.2.1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("3221225985", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Bulk" }).click();
  const textareas = page.locator("textarea");
  await textareas.nth(0).fill("8.8.8.8\n8.8.8.8\nnot-an-ip");
  await expect(page.getByText("Valid: 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Duplicate: 1", { exact: true })).toBeVisible();
  await textareas.nth(1).fill("connected from 2001:db8::7 and 192.0.2.9");
  await expect(page.getByText("2 IP を抽出", { exact: true })).toBeVisible();
});

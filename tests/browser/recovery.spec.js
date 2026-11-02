import { test, expect } from "@playwright/test";

async function enableEmail(page) {
  await page.route("**/api/meta", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), email_configured: true } });
  });
}

test("recovery shows a durable confirmation with inbox guidance, resend and edit paths", async ({ page }) => {
  await enableEmail(page);
  let sends = 0;
  await page.route("**/api/auth/forgot", async route => {
    sends++;
    expect(route.request().postDataJSON().email).toBe("customer@example.test");
    await route.fulfill({ json: { message: "Nếu email hợp lệ, hướng dẫn sẽ được gửi qua email." } });
  });
  await page.goto("/forgot");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page.getByRole("button", { name: "Gửi hướng dẫn" }).click();
  await expect(page).toHaveURL(/\/forgot\/sent$/);
  await expect(page.getByRole("heading", { name: "Vui lòng kiểm tra email" })).toBeFocused();
  await expect(page.locator(".recovery-address")).toHaveText("customer@example.test");
  await expect(page.locator(".recovery-guidance")).toContainText("Thư rác / Spam");
  await expect(page.locator(".recovery-guidance")).toContainText("no-reply@mail.hnquan.io.vn");
  await expect(page.locator(".recovery-discreet")).toContainText("Nếu địa chỉ này liên kết");
  await expect(page.locator("[data-recovery-resend]")).toBeDisabled();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/recovery-confirmation-${width}.png`, fullPage: true });
  }
  await page.reload();
  await expect(page.locator(".recovery-address")).toHaveText("customer@example.test");
  expect(sends).toBe(1);
  await page.clock.install();
  await page.clock.fastForward(61000);
  await expect(page.locator("[data-recovery-resend]")).toBeEnabled();
  await page.getByRole("button", { name: "Gửi lại hướng dẫn", exact: true }).click();
  await expect(page.locator("[data-recovery-resend]")).toBeDisabled();
  await expect.poll(() => sends).toBe(2);
  await page.getByRole("link", { name: "Nhập sai địa chỉ? Sử dụng email khác" }).click();
  await expect(page).toHaveURL(/\/forgot$/);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});

test("failed recovery stays on the form with a clear error", async ({ page }) => {
  await enableEmail(page);
  await page.route("**/api/auth/forgot", route => route.fulfill({
    status: 503, json: { error: { code: "unavailable", message: "Chưa thể tiếp nhận yêu cầu. Vui lòng thử lại." } },
  }));
  await page.goto("/forgot");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page.getByRole("button", { name: "Gửi hướng dẫn" }).click();
  await expect(page.locator(".form-error")).toBeVisible();
  await expect(page).toHaveURL(/\/forgot$/);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("customer@example.test");
});

test("direct confirmation URL offers a new request without inventing a recipient", async ({ page }) => {
  await page.goto("/forgot/sent");
  await expect(page.locator(".recovery-panel")).toBeVisible();
  await expect(page.locator(".recovery-address")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Yêu cầu hướng dẫn mới" })).toHaveAttribute("href", "/forgot");
});

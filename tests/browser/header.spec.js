import { test, expect } from "@playwright/test";

test("compact header, keyboard menu and search focus fit all supported widths", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".market-copy h1")).toBeVisible();
  for (const width of [375, 390, 768, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const input = page.getByRole("searchbox", { name: "Tìm sản phẩm" });
    await input.focus();
    await input.press("Tab");
    await page.getByRole("button", { name: "Tìm kiếm", exact: true }).press("Shift+Tab");
    const dimensions = await page.evaluate(() => {
      const header = document.querySelector(".masthead");
      const input = document.querySelector(".search input");
      const form = input.closest("form");
      const rect = form.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        height: header.getBoundingClientRect().height,
        inputOutline: getComputedStyle(input).outlineStyle,
        formOutline: getComputedStyle(form).outlineStyle,
        fits: rect.left >= 0 && rect.right <= innerWidth,
      };
    });
    expect(dimensions.overflow).toBe(false);
    expect(dimensions.fits).toBe(true);
    expect(dimensions.inputOutline).toBe("none");
    expect(dimensions.formOutline).toBe("solid");
    if (width >= 768) expect(dimensions.height).toBeLessThanOrEqual(126);
    const summary = page.locator(".header-account summary");
    await summary.focus();
    await summary.press("Enter");
    await expect(page.getByRole("link", { name: "Đơn mua của tôi", exact: true })).toBeVisible();
    const menu = await page.locator(".account-menu").boundingBox();
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width);
    await summary.press("Escape");
    await expect(summary).toBeFocused();
    await expect(page.locator(".header-account")).not.toHaveAttribute("open", "");
    await summary.click();
    await page.locator(".masthead").click({ position: { x: 2, y: 2 } });
    await expect(page.locator(".header-account")).not.toHaveAttribute("open", "");
  }
});

test("search Enter and submit agree, typing adds no API requests and navigation closes the account menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".market-copy h1")).toBeVisible();
  const reads = [];
  page.on("request", request => { if (request.url().includes("/api/")) reads.push(request.url()); });
  const input = page.getByRole("searchbox", { name: "Tìm sản phẩm" });
  await input.fill("áo thun");
  expect(reads).toHaveLength(0);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=%C3%A1o\+thun$/);
  await expect(page.locator(".product-card")).toHaveCount(1);
  const first = page.url();
  await page.locator('header a[href="/"]').first().click();
  await expect(page.locator(".market-copy h1")).toBeVisible();
  await input.fill("áo thun");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(page).toHaveURL(first);
  await page.locator(".header-account summary").click();
  await page.locator('.account-menu a[href="/login"]').click();
  await expect(page.locator(".header-account")).not.toHaveAttribute("open", "");
});

test("unconfigured email explains the limitation and prevents verification/recovery requests", async ({ page }) => {
  await page.request.post("/api/auth/login", {
    headers: { Origin: "http://127.0.0.1:18147" },
    data: { email: "buyer@shoppe.local", password: "BrowserFixture123!" },
  });
  await page.route("**/api/auth/me**", async route => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.user) Object.assign(body.user, { verified: false, name: "Nguyễn Thị Tên Tài Khoản Rất Dài Để Kiểm Tra Bố Cục" });
    if (body.cart_summary) body.cart_summary.quantity = 120;
    await route.fulfill({ response, json: body });
  });
  const sends = [];
  page.on("request", request => { if (/\/api\/auth\/(resend|forgot)/.test(request.url())) sends.push(request.url()); });
  await page.goto("/account");
  await expect(page.getByText("Email chưa xác minh. Website chưa cấu hình dịch vụ gửi email.", { exact: false })).toBeVisible();
  await expect(page.locator('[data-action="resend-verification"]')).toHaveCount(0);
  await expect(page.locator(".head-main")).toBeVisible();
  await expect(page.locator(".header-cart .count")).toHaveText("99+");
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.goto("/forgot");
  await expect(page.locator(".email-unavailable")).toContainText("Chưa thể gửi liên kết khôi phục");
  await expect(page.locator('[data-action="retry-email-status"]')).not.toBeVisible();
  await expect(page.locator('[data-form="auth"] button')).toBeDisabled();
  expect(sends).toHaveLength(0);
});

test("configured verification enqueues once without claiming delivery or changing verified state", async ({ page }) => {
  await page.request.post("/api/auth/login", {
    headers: { Origin: "http://127.0.0.1:18147" },
    data: { email: "buyer@shoppe.local", password: "BrowserFixture123!" },
  });
  await page.route("**/api/auth/me**", async route => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.user) body.user.verified = false;
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/meta", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), email_configured: true } });
  });
  let sends = 0;
  await page.route("**/api/auth/resend", async route => {
    sends++;
    await route.fulfill({ json: { message: "Nếu email hợp lệ, hướng dẫn sẽ được gửi qua email." } });
  });
  await page.goto("/account");
  await page.getByRole("button", { name: "Gửi lại email xác minh", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("Email sẽ được gửi sau khi hệ thống xử lý");
  await expect(page.getByText("Email chưa xác minh.", { exact: false })).toBeVisible();
  expect(sends).toBe(1);
});

test("a slow email configuration read does not block registration or recovery form paint", async ({ browser }) => {
  for (const kind of ["register", "forgot"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route("**/api/meta", async route => {
      await held;
      await route.continue();
    });
    await page.goto("/" + kind);
    await expect(page.locator('[data-form="auth"]')).toBeVisible();
    await expect(page.locator(".email-unavailable")).toHaveText("Đang kiểm tra dịch vụ gửi email…");
    const submit = page.locator('[data-form="auth"] button[type=submit]');
    if (kind === "register") await expect(submit).toBeEnabled();
    else await expect(submit).toBeDisabled();
    release();
    await expect(page.locator(".email-unavailable")).toContainText("Website chưa cấu hình");
    await context.close();
  }
});

test("email configuration can retry and recovery remains single-submit while processing", async ({ page }) => {
  let checks = 0;
  await page.route("**/api/meta", async route => {
    if (++checks === 1) return route.fulfill({ status: 400, json: { message: "fixture metadata unavailable" } });
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), email_configured: true } });
  });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let sends = 0;
  await page.route("**/api/auth/forgot", async route => {
    sends++;
    await held;
    await route.fulfill({ json: { message: "Nếu email hợp lệ, hướng dẫn sẽ được gửi qua email." } });
  });
  await page.goto("/forgot");
  await expect(page.locator(".email-unavailable")).toContainText("Chưa thể kiểm tra");
  const submit = page.locator('[data-form="auth"] button[type=submit]');
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: "Kiểm tra lại dịch vụ email" }).click();
  await expect(submit).toBeEnabled();
  await expect(page.locator('[data-action="retry-email-status"]')).not.toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("buyer@shoppe.local");
  await submit.click();
  await expect.poll(() => sends).toBe(1);
  await expect(submit).toBeDisabled();
  await page.getByLabel("Email", { exact: true }).press("Enter");
  expect(sends).toBe(1);
  release();
  await expect(page.locator("#toast")).toContainText("Nếu email hợp lệ");
  await expect(submit).toBeEnabled();
});

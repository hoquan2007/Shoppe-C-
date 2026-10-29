import { test, expect } from "@playwright/test";

test("shop identity and service information stay consistent across product and storefront", async ({ page }) => {
  const base = "http://127.0.0.1:18147";
  const session = await (await page.request.get("/api/session")).json();
  const login = await page.request.post("/api/auth/login", {
    headers: { Origin: base, "X-CSRF-Token": session.csrf },
    data: { email: "admin@shoppe.local", password: "BrowserFixture123!" },
  });
  expect(login.ok()).toBe(true);
  const { csrf } = await login.json();
  const response = await page.request.post("/api/admin/catalog/import", {
    headers: { Origin: base, "X-CSRF-Token": csrf }, data: {},
  });
  expect(response.ok()).toBe(true);
  const { shop_id } = await response.json();
  await page.goto("/product/demo-dummyjson-1");
  await expect(page.locator(".product-seller")).toContainText("Mộc An Select");
  await expect(page.locator(".product-seller")).toContainText("TP. Hồ Chí Minh");
  await expect(page.locator(".product-description")).not.toContainText(/demo|mô phỏng|bài tập/i);
  await page.getByRole("link", { name: "Xem shop", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/shop/" + shop_id));
  await expect(page.getByRole("heading", { name: "Mộc An Select", exact: true })).toBeVisible();
  await expect(page.locator(".shop-service-details")).toContainText("08:30–21:00");
  await expect(page.locator(".shop-service-details")).toContainText("Giao hàng toàn quốc");
  await expect(page.locator(".shop-service-details")).toContainText("7 ngày");
  await page.screenshot({ path: "artifacts/storefront-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 844 });
  await expect(page.locator(".shop-service-details")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/storefront-mobile.png", fullPage: true });
});

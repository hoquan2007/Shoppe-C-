import { test, expect } from "@playwright/test";
const base = "http://127.0.0.1:18147";
async function session(page, email = "buyer@shoppe.local") {
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: base },
    data: { email, password: "BrowserFixture123!" },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).csrf;
}
async function cart(page, csrf, items) {
  const current = await (await page.request.get("/api/cart")).json();
  const response = await page.request.put("/api/cart", {
    headers: { Origin: base, "X-CSRF-Token": csrf },
    data: { expected_revision: current.cart.revision, items },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
const item = (variant_id, quantity = 1) => ({
  variant_id,
  quantity,
  selected: true,
});

test("a voucher edited during an in-flight quote cannot restore an old confirmation", async ({
  page,
}) => {
  const csrf = await session(page);
  await cart(page, csrf, [item("product-1-0")]);
  await page.goto("/checkout");
  await expect(page.locator("#place-order")).toBeEnabled();
  let release, entered, finished;
  const gate = new Promise((resolve) => (release = resolve)),
    started = new Promise((resolve) => (entered = resolve)),
    completed = new Promise((resolve) => (finished = resolve));
  let delayed = true;
  await page.route("**/api/checkout/quote", async (route) => {
    const response = await route.fetch();
    const first = delayed;
    if (first) {
      delayed = false;
      entered();
      await gate;
    }
    await route.fulfill({ response }).catch(() => {});
    if (first) finished();
  });
  await page.getByLabel("Voucher toàn sàn").fill("CHAO10");
  await page.getByRole("button", { name: "Áp dụng & tính lại đơn" }).click();
  await started;
  await page.getByLabel("Voucher toàn sàn").fill("");
  release();
  await completed;
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(page.locator("#place-order")).toBeDisabled();
  await expect(page.locator("#checkout-summary")).not.toContainText("875.000");
  await page.getByRole("button", { name: "Áp dụng & tính lại đơn" }).click();
  await expect(page.locator("#place-order")).toBeEnabled();
  await expect(page.locator("#checkout-summary")).toContainText("925.000");
});

test("a changed cart requires a new confirmation and does not silently create an order", async ({
  page,
  context,
}) => {
  const csrf = await session(page);
  await cart(page, csrf, [item("product-1-0")]);
  const before = await (await page.request.get("/api/orders")).json();
  await page.goto("/checkout");
  await expect(page.locator("#place-order")).toBeEnabled();
  const other = await context.newPage();
  await cart(other, csrf, [item("product-1-0", 2)]);
  await page.locator("#place-order").click();
  await expect(page.getByText("Nguyên bản × 2", { exact: true })).toBeVisible();
  await expect(page.locator("#place-order")).toBeEnabled();
  const after = await (await page.request.get("/api/orders")).json();
  expect(after.total).toBe(before.total);
});

test("a stale cart tab rebases a quantity change and preserves another added product", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    globalThis.BroadcastChannel = undefined;
  });
  const csrf = await session(page);
  await cart(page, csrf, [item("product-1-0")]);
  await page.goto("/cart");
  await expect(page.locator(".cart-line")).toHaveCount(1);
  const other = await context.newPage();
  await cart(other, csrf, [item("product-1-0"), item("product-2-0")]);
  const committed = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/cart") &&
      response.request().method() === "PUT" &&
      response.status() === 200,
  );
  await page.getByRole("button", { name: "Tăng số lượng" }).click();
  await committed;
  await expect(page.locator(".cart-line")).toHaveCount(2);
  const current = await (await page.request.get("/api/cart")).json();
  expect(
    current.lines.find((line) => line.variant_id === "product-1-0").quantity,
  ).toBe(2);
  expect(
    current.lines.some((line) => line.variant_id === "product-2-0"),
  ).toBeTruthy();
});

test("admin users are paginated and searched on the server", async ({
  page,
}) => {
  await session(page, "admin@shoppe.local");
  await page.goto("/admin/users");
  await expect(page.locator("tbody tr")).toHaveCount(50);
  await page
    .getByPlaceholder("Tên hoặc email")
    .fill("browser-999@example.invalid");
  await page.locator('[data-form="list-filter"] button').click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText(
    "browser-999@example.invalid",
  );
  await expect(
    page.getByRole("textbox", { name: "Tìm sản phẩm", exact: true }),
  ).toHaveValue("");
});

test("public query keys omit debug and tracking, and a fresh Back reuses memory", async ({
  page,
}) => {
  const calls = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/products")
      calls.push(request.url());
  });
  await page.goto("/search?debug-perf=1&utm_source=fixture&page=1&sort=new");
  await expect(page.locator(".product-card")).toHaveCount(12);
  expect(calls).toHaveLength(1);
  expect(new URL(calls[0]).search).toBe("?include=meta");
  await page.locator("a.product-name").first().click();
  await expect(page.locator(".detail-info h1")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".product-card")).toHaveCount(12);
  expect(calls).toHaveLength(1);
});

test("signed-in startup uses summary and checkout loads one context before quote", async ({
  page,
}) => {
  const csrf = await session(page);
  await cart(page, csrf, [item("product-1-0")]);
  const paths = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) paths.push(url.pathname + url.search);
  });
  await page.goto("/");
  await expect(page.locator(".head-icon .count")).toHaveText("1");
  expect(paths.filter((p) => p.startsWith("/api/auth/me"))).toHaveLength(1);
  expect(paths.filter((p) => p === "/api/cart")).toHaveLength(0);
  paths.length = 0;
  await page.goto("/checkout");
  await expect(page.locator("#place-order")).toBeEnabled();
  expect(paths.filter((p) => p === "/api/checkout/context")).toHaveLength(1);
  expect(paths.filter((p) => p === "/api/checkout/quote")).toHaveLength(1);
  expect(
    paths.filter((p) =>
      ["/api/cart", "/api/addresses", "/api/meta"].includes(p),
    ),
  ).toHaveLength(0);
});

import { test, expect } from "@playwright/test";

test("product imagery has no demo caption, structured copy is escaped, and purchase controls retain their wiring", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", {
    headers: { Origin: "http://127.0.0.1:18147" },
    data: { email: "buyer@shoppe.local", password: "BrowserFixture123!" },
  });
  const { csrf } = await login.json();
  const { cart } = await (await page.request.get("/api/cart")).json();
  await page.request.put("/api/cart", {
    headers: { Origin: "http://127.0.0.1:18147", "X-CSRF-Token": csrf },
    data: { expected_revision: cart.revision, items: [] },
  });
  await page.route("**/api/home", async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.products.forEach(product => { product.is_demo = true; });
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/products/product-1?*", async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.product.is_demo = true;
    body.product.description = 'GIỚI THIỆU\nTên thật, <img src=x onerror="alert(1)"> không phải HTML.\n\nSỬ DỤNG VÀ BẢO QUẢN\nLau bằng khăn mềm.\n\nLƯU Ý VỀ CATALOG\nSản phẩm mô phỏng; nếu chọn payOS, giao dịch sử dụng tiền thật.';
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(12);
  await expect(page.locator(".demo-label")).toHaveCount(0);
  await page.goto("/product/product-1");
  await expect(page.locator(".detail-demo")).toHaveCount(0);
  await expect(page.locator(".detail-photo")).toHaveText("");
  await expect(page.locator(".detail-rating")).toHaveText("Chưa có đánh giá");
  await expect(page.locator(".product-description")).toContainText('<img src=x onerror="alert(1)">');
  await expect(page.locator(".product-description img")).toHaveCount(0);
  const care = page.locator(".product-copy-section").filter({ hasText: "Sử dụng và bảo quản" });
  await care.locator("summary").click();
  await expect(care.locator("p")).toBeVisible();
  const catalog = page.locator(".product-copy-section").filter({ hasText: "Thông tin catalog và thanh toán" });
  await expect(catalog.locator("p")).toBeVisible();
  await expect(catalog).toContainText("tiền thật");
  await page.getByRole("button", { name: "Xanh mint", exact: true }).click();
  await expect(page.locator('[data-action="variant"][aria-pressed=true]')).toHaveText("Xanh mint");
  await page.getByRole("button", { name: "Tăng số lượng", exact: true }).click();
  await expect(page.locator("#product-qty")).toHaveValue("2");
  await page.getByRole("button", { name: "Thêm vào giỏ", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("giỏ hàng");
  await page.locator(".header-cart").click();
  await expect(page.locator(".cart-line")).toHaveCount(1);
  await expect(page.locator(".cart-line")).toContainText("Xanh mint");
  await expect(page.locator(".cart-qty-input")).toHaveValue("2");
});

test("price and explicit page jump retain filters, reject invalid bounds and never request on typing", async ({ page }) => {
  await page.route("**/api/products?*", async route => {
    const response = await route.fetch();
    const body = await response.json();
    const current = Number(new URL(route.request().url()).searchParams.get("page") || 1);
    await route.fulfill({ response, json: { ...body, page: current, pages: 84, total: 1000, page_size: 12 } });
  });
  await page.goto("/search?q=%C3%A1o&category=Th%E1%BB%9Di+trang&sort=price-desc");
  await expect(page.locator(".catalog-pagination")).toBeVisible();
  const reads = [];
  page.on("request", request => { if (request.url().includes("/api/products?")) reads.push(request.url()); });
  await page.getByLabel("Giá tối thiểu", { exact: true }).fill("500000");
  await page.getByLabel("Giá tối đa", { exact: true }).fill("100000");
  expect(reads).toHaveLength(0);
  await page.getByRole("button", { name: "Áp dụng giá", exact: true }).click();
  await expect(page.locator(".price-filter .form-error")).toContainText("lớn hơn hoặc bằng");
  expect(reads).toHaveLength(0);
  await page.getByLabel("Giá tối thiểu", { exact: true }).fill("100000");
  await page.getByLabel("Giá tối đa", { exact: true }).fill("300000");
  await page.getByRole("button", { name: "Áp dụng giá", exact: true }).click();
  await expect(page).toHaveURL(/min=100000/);
  await expect(page.locator(".catalog-pagination")).toBeVisible();
  const beforeJump = reads.length;
  await page.getByLabel("Chọn trang", { exact: true }).fill("42");
  expect(reads).toHaveLength(beforeJump);
  await page.getByRole("button", { name: "Chuyển đến trang", exact: true }).click();
  await expect(page).toHaveURL(/page=42/);
  await expect(page.locator('.catalog-pagination [aria-current="page"]')).toHaveText("42");
  let query = new URL(page.url()).searchParams;
  expect(Object.fromEntries(query)).toMatchObject({ q: "áo", category: "Thời trang", sort: "price-desc", min: "100000", max: "300000" });
  await page.setViewportSize({ width: 375, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("link", { name: "Trang sau", exact: true }).click();
  await expect(page).toHaveURL(/page=43/);
  await page.getByRole("button", { name: "Bộ lọc sản phẩm", exact: true }).click();
  await page.getByRole("link", { name: "Xóa khoảng giá", exact: true }).click();
  await expect(page).not.toHaveURL(/min=|max=|page=/);
  query = new URL(page.url()).searchParams;
  expect(Object.fromEntries(query)).toMatchObject({ q: "áo", category: "Thời trang", sort: "price-desc" });
});

test("product/footer layouts fit phone, tablet and desktop and footer disclosure works by keyboard", async ({ page }) => {
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/product/product-1");
    await expect(page.locator(".detail-info h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.locator(".footer").scrollIntoViewIfNeeded();
    const group = page.locator(".footer-group").first();
    if (width < 640) {
      await expect(group).not.toHaveAttribute("open", "");
      await group.locator("summary").focus();
      await group.locator("summary").press("Enter");
    }
    await expect(group.locator('a[href="/search"]')).toBeVisible();
    await expect(page.locator(".footer .payment-method")).toHaveCount(2);
    await expect(page.locator(".footer-bottom")).toContainText("Mua sắm mỗi ngày, an tâm trong từng lựa chọn.");
    await expect(page.locator(".footer-bottom")).not.toContainText(/demo|học tập/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

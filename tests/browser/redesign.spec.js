import { test, expect } from "@playwright/test";

test("public content and navigation survive an unavailable optional motion chunk", async ({ page }) => {
  await page.route("**/assets/motion-*.js", route => route.abort());
  await page.goto("/");
  await expect(page.locator(".market-copy h1")).toBeVisible();
  await expect(page.locator(".stage-tile")).toHaveCount(4);
  await page.locator('header a[href="/search"]').click();
  await expect(page.locator(".product-card")).toHaveCount(12);
  await page.locator('a[href="/product/product-1"]').first().click();
  await expect(page.locator('[data-action="add-cart"]')).toBeEnabled();
});

test("reduced-motion and save-data skip the animation download without hiding products", async ({ browser }) => {
  for (const policy of ["reduced", "save-data"]) {
    const context = await browser.newContext({ reducedMotion: policy === "reduced" ? "reduce" : "no-preference" });
    const page = await context.newPage();
    if (policy === "save-data") await page.addInitScript(() => Object.defineProperty(navigator, "connection", {
      configurable: true, value: { saveData: true, effectiveType: "4g" },
    }));
    const motion = [];
    page.on("request", request => { if (/\/assets\/motion-/.test(request.url())) motion.push(request.url()); });
    await page.goto("/");
    await expect(page.locator(".market-copy h1")).toBeVisible();
    await expect(page.locator("#content")).not.toHaveAttribute("aria-busy", "true");
    await page.locator(".product-card").last().scrollIntoViewIfNeeded();
    await expect(page.locator(".product-card").last()).toBeVisible();
    expect(motion).toHaveLength(0);
    await context.close();
  }
});

test("hero actions and catalog remain usable without horizontal overflow at phone, tablet and desktop sizes", async ({ page }) => {
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto("/");
    await expect(page.locator(".market-copy .btn")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const overlap = await page.locator(".stage-plane").evaluateAll(planes => planes.some(plane => {
      const art = plane.querySelector(".stage-art").getBoundingClientRect();
      const caption = plane.querySelector(".stage-caption").getBoundingClientRect();
      return art.bottom > caption.top + 1;
    }));
    expect(overlap).toBe(false);
    await page.locator('header a[href="/search"]').click();
    await expect(page.locator(".product-card")).toHaveCount(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width < 500) {
      await page.getByRole("button", { name: "Bộ lọc sản phẩm" }).click();
      await expect(page.locator("#catalog-filters")).toBeVisible();
      await page.getByRole("button", { name: "Bộ lọc sản phẩm" }).click();
      await expect(page.locator("#catalog-filters")).not.toBeVisible();
    }
  }
});

test("leaving a moving hero restores its old DOM styles and reduced-motion restores the active scene", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".stage-plane").first()).toBeVisible();
  await page.mouse.move(800, 400);
  await page.mouse.wheel(0, 350);
  const oldPlane = await page.locator(".stage-plane").first().elementHandle();
  await expect.poll(() => oldPlane.evaluate(node => node.style.transform)).not.toBe("");
  await page.locator('header a[href="/search"]').click();
  await expect(page.locator(".product-card")).toHaveCount(12);
  expect(await oldPlane.evaluate(node => ({ connected: node.isConnected, transform: node.style.transform })))
    .toEqual({ connected: false, transform: "" });
  await page.locator('header a[href="/"]').first().click();
  await expect(page.locator(".stage-plane").first()).toBeVisible();
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.locator(".stage-plane").first().evaluate(node => node.style.transform)).not.toBe("");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.locator(".stage-plane").first().evaluate(node => node.style.transform)).toBe("");
  await expect(page.locator(".market-copy h1")).toBeVisible();
});

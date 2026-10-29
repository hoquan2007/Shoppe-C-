import { test, expect } from "@playwright/test";

test("public content and navigation survive an unavailable optional motion chunk", async ({ page }) => {
  await page.route("**/assets/motion-*.js", route => route.abort());
  await page.goto("/");
  await expect(page.locator(".market-copy h1")).toBeVisible();
  await expect(page.locator(".spiral-card")).toHaveCount(8);
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

test("spiral keeps moving on hover and focus, stops offscreen and cleans up on navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const stage = page.locator(".infinite-spiral");
  const card = page.locator(".spiral-card").first();
  await expect(stage).toHaveClass(/is-spiraling/);
  const before = await card.getAttribute("style");
  await expect.poll(() => card.getAttribute("style")).not.toBe(before);
  await expect(stage).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".spiral-toggle")).toHaveCount(0);
  await stage.hover();
  const hovered = await card.getAttribute("style");
  await expect.poll(() => card.getAttribute("style")).not.toBe(hovered);
  await card.locator("a").focus();
  const focused = await card.getAttribute("style");
  await expect.poll(() => card.getAttribute("style")).not.toBe(focused);
  await page.setViewportSize({ width: 390, height: 844 });
  await stage.scrollIntoViewIfNeeded();
  const resized = await card.getAttribute("style");
  await expect.poll(() => card.getAttribute("style")).not.toBe(resized);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const offscreen = await card.getAttribute("style");
  await page.waitForTimeout(150);
  expect(await card.getAttribute("style")).toBe(offscreen);
  await page.locator(".market-copy .btn").scrollIntoViewIfNeeded();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(stage).not.toHaveClass(/is-spiraling/);
  expect(await card.getAttribute("style")).toBeNull();
  await expect(card).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(stage).toHaveClass(/is-spiraling/);
  const oldCard = await card.elementHandle();
  await page.locator('header a[href="/search"]').click();
  await expect(page.locator(".product-card")).toHaveCount(12);
  expect(await oldCard.evaluate(node => ({ connected: node.isConnected, style: node.getAttribute("style") })))
    .toEqual({ connected: false, style: null });
});

test("spiral products stay behind the sticky header while scrolling", async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const stage = page.locator(".infinite-spiral");
    await expect(stage).toHaveClass(/is-spiraling/);
    await stage.evaluate(root => {
      const header = document.querySelector(".masthead").getBoundingClientRect();
      window.scrollTo(0, window.scrollY + root.getBoundingClientRect().top - header.bottom + 180);
    });
    // Sample the actual overlap: moving cards have z-indices higher than the header.
    // They must be contained in the hero's own stacking context.
    const overlap = await stage.evaluate(root => {
      const header = document.querySelector(".masthead");
      const head = header.getBoundingClientRect(), rect = root.getBoundingClientRect();
      const x = (Math.max(head.left, rect.left) + Math.min(head.right, rect.right)) / 2;
      const y = (Math.max(head.top, rect.top) + Math.min(head.bottom, rect.bottom)) / 2;
      return { overlaps: rect.top < head.bottom && rect.bottom > head.top,
        headerOnTop: header.contains(document.elementFromPoint(x, y)) };
    });
    expect(overlap).toEqual({ overlaps: true, headerOnTop: true });
  }
});

test("clicking moving spiral images opens the product under the pointer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const index of [0, 1, 2]) {
    await page.goto("/");
    await expect(page.locator(".infinite-spiral")).toHaveClass(/is-spiraling/);
    const point = await page.locator(".spiral-card a").nth(index).evaluate(link => {
      const rect = link.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(point.x, point.y);
    const target = await page.evaluate(({ x, y }) => {
      const link = document.elementFromPoint(x, y)?.closest(".spiral-card a");
      return link && { href: link.getAttribute("href"), name: link.getAttribute("aria-label") };
    }, point);
    expect(target).toBeTruthy();
    await page.mouse.down();
    await page.mouse.up();
    await expect(page).toHaveURL(new RegExp(`${target.href}$`));
    await expect(page.locator("h1")).toHaveText(target.name);
  }
});

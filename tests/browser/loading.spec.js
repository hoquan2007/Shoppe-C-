import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("a slow home read leaves real navigation usable and preserves focus and scroll when data arrives", async ({ page }) => {
  let release, entered, calls = 0;
  const held = new Promise(resolve => release = resolve), started = new Promise(resolve => entered = resolve);
  await page.route("**/api/home", async route => {
    calls++;
    const response = await route.fetch();
    entered();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/?debug-perf");
    await started;
    const cta = page.locator(".market-copy .btn");
    await expect(page.locator(".market-copy h1")).toBeVisible();
    await expect(page.locator(".home-feature-placeholder")).toBeVisible();
    await expect(page.locator(".product-card")).toHaveCount(0);
    await expect(page.locator('[data-action="home-filter"]')).toHaveCount(3);
    await expect(page.locator('[data-action="home-filter"]').first()).toBeDisabled();
    expect(await page.locator("#content").evaluate(node => node.inert)).toBe(false);
    await expect(page.locator(".home-load-status")).toContainText("Kết nối chậm", { timeout: 5000 });
    await cta.focus();
    const originalCta = await cta.elementHandle();
    await page.locator("#home-products").scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => scrollY);
    release();
    await expect(page.locator(".product-card")).toHaveCount(12);
    await expect(cta).toBeFocused();
    expect(await originalCta.evaluate(node => node === document.querySelector(".market-copy .btn"))).toBe(true);
    expect(Math.abs(await page.evaluate(() => scrollY) - scroll)).toBeLessThan(80);
    expect(calls).toBe(1);
    await expect(page.locator("#content")).not.toHaveAttribute("aria-busy", "true");
    await expect(page.locator("#home-products")).not.toHaveAttribute("aria-busy", "true");
    const measurements = await page.evaluate(() => Object.fromEntries(
      ["shell", "data", "ready"].map(phase => [phase, performance.getEntriesByName("shoppe:readiness:" + phase).at(-1)?.duration])));
    expect(measurements.shell).toBeLessThan(measurements.data);
    expect(measurements.ready).toBeGreaterThanOrEqual(measurements.data);
  } finally { release(); }
});

test("leaving a pending home read never locks navigation or overwrites the new route", async ({ page }) => {
  let release, entered;
  const held = new Promise(resolve => release = resolve), started = new Promise(resolve => entered = resolve);
  await page.route("**/api/home", async route => {
    const response = await route.fetch(); entered(); await held;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.goto("/"); await started;
    await page.locator(".market-copy .btn").click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.locator(".product-card")).toHaveCount(12);
    release();
    await expect(page.locator("h1")).toHaveText("Khám phá sản phẩm");
    await expect(page.locator("[data-home-view]")).toHaveCount(0);
    expect(await page.locator("#content").evaluate(node => node.inert)).toBe(false);
  } finally { release(); }
});

test("home failure keeps its intro and offers a bounded same-page retry", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/home", route => {
    if (++calls <= 2) return route.fulfill({ status: 503, contentType: "text/html", body: "Unavailable" });
    return route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("heading", {name: "Chưa tải được sản phẩm"})).toBeVisible();
  await expect(page.locator(".market-copy .btn")).toBeVisible();
  expect(calls).toBe(2);
  await page.getByRole("button", {name: "Thử lại", exact: true}).click();
  await expect(page.locator(".product-card")).toHaveCount(12);
  expect(calls).toBe(3);
  await expect(page.locator(".load-error")).toHaveCount(0);
  await expect(page.locator("#route-progress")).toHaveCount(0);
});

test("retrying a failed search keeps every URL filter and requests the same API query", async ({ page }) => {
  const calls = [];
  await page.route("**/api/products?*", route => {
    calls.push(new URL(route.request().url()).search);
    if (calls.length <= 2) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({error:{message:"Tạm thời chưa khả dụng"}}) });
    return route.continue();
  });
  const path = "/search?sort=price&page=2&min=1000&max=9000000";
  await page.goto(path);
  await expect(page.getByRole("heading", {name:"Chưa thể mở trang"})).toBeVisible();
  await page.getByRole("button", {name:"Thử lại",exact:true}).click();
  await expect(page.locator(".catalog-toolbar")).toBeVisible();
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path);
  expect(calls).toHaveLength(3);
  expect(new Set(calls).size).toBe(1);
});

test("a failed session is fetched again on retry instead of staying permanently failed", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/auth/me?include=cart-view", route => {
    if (++calls <= 2) return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{message:"Session unavailable"}})});
    return route.continue();
  });
  await page.goto("/cart");
  await expect(page.getByRole("heading", {name:"Chưa thể mở trang"})).toBeVisible();
  await page.getByRole("button", {name:"Thử lại",exact:true}).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcart$/);
  await expect(page.locator('form[data-kind="login"]')).toBeVisible();
  expect(calls).toBe(3);
});

test("public routes skip workspace CSS and an interrupted admin stylesheet can retry", async ({ page }) => {
  let styles = 0;
  page.on("request", request => { if (/\/assets\/workspace-.*\.css$/.test(new URL(request.url()).pathname)) styles++; });
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(12);
  await page.locator('header a[href="/search"]').click();
  await expect(page.locator(".product-card")).toHaveCount(12);
  await page.locator("a.product-name").first().click();
  await expect(page.locator(".detail-info h1")).toBeVisible();
  expect(styles).toBe(0);
  const session = await (await page.request.get("/api/session")).json();
  const login = await page.request.post("/api/auth/login", {
    headers: {Origin:"http://127.0.0.1:18147","X-CSRF-Token":session.csrf},
    data:{email:"admin@shoppe.local",password:"BrowserFixture123!"},
  });
  expect(login.ok()).toBe(true);
  let attempts = 0;
  await page.route("**/assets/workspace-*.css", route => ++attempts === 1 ? route.abort() : route.continue());
  await page.goto("/admin/products");
  await expect(page.getByRole("heading",{name:"Chưa thể mở trang"})).toBeVisible();
  await page.getByRole("button",{name:"Thử lại",exact:true}).click();
  await expect(page.locator(".workspace .table-wrap")).toBeVisible();
  await expect(page.locator(".content-with-aside")).toHaveCSS("display","grid");
  expect(styles).toBe(2);
});

test("loading and loaded home retain their geometry at phone, tablet and desktop widths", async ({ page }) => {
  let release, held;
  const measurements = [];
  await page.route("**/api/home", async route => {
    const response = await route.fetch(); await held;
    await route.fulfill({response});
  });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({width,height:900});
    held = new Promise(resolve => release = resolve);
    try {
      await page.goto("/?debug-perf");
      await expect(page.locator(".home-feature-placeholder")).toBeVisible();
      await expect(page.locator(".market-copy .btn")).toBeInViewport();
      const before = await page.locator(".category-section").boundingBox();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({path:`artifacts/performance-audit-2026-10-30/home-loading-${width}.png`});
      release();
      await expect(page.locator(".product-card")).toHaveCount(12);
      await expect(page.locator("#content")).not.toHaveAttribute("aria-busy","true");
      // Both static fallback and optional motion must fit the reserved hero height.
      await expect.poll(async () => Math.abs((await page.locator(".category-section").boundingBox()).y - before.y)).toBeLessThan(80);
      await page.screenshot({path:`artifacts/performance-audit-2026-10-30/home-loaded-${width}.png`});
      measurements.push(await page.evaluate(width => ({width,
        readiness:performance.getEntriesByType("measure").filter(e=>e.name.startsWith("shoppe:readiness:")).map(e=>({name:e.name,duration:e.duration,detail:e.detail})),
      }),width));
    } finally { release(); }
  }
  await writeFile("artifacts/performance-audit-2026-10-30/local-readiness.json",JSON.stringify({scope:"Local fixture, held API for screenshots; not production speed",measurements},null,2));
});

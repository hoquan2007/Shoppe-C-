import { test, expect } from "@playwright/test";

async function login(page, role) {
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: "http://127.0.0.1:18147" },
    data: { email: `${role}@shoppe.local`, password: "BrowserFixture123!" },
  });
  expect(response.ok()).toBeTruthy();
}

test("Google shares the form width, follows resize and detaches without reinitializing the session", async ({ page }) => {
  let challenges = 0;
  await page.addInitScript(() => {
    window.googleProbe = { initialized: 0, renders: [] };
    window.google = { accounts: { id: {
      initialize() { window.googleProbe.initialized++; },
      renderButton(container, options) {
        window.googleProbe.renders.push(options.width);
        const button = document.createElement("button");
        button.style.cssText = `width:${options.width}px;height:40px`;
        button.textContent = "Google sizing fixture";
        container.replaceChildren(button);
      },
    } } };
  });
  await page.route("**/api/meta", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), google_configured: true } });
  });
  await page.route("**/api/products?*", async route => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.meta) body.meta.google_configured = true;
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/auth/google/challenge", route => {
    challenges++;
    return route.fulfill({ json: { client_id: "fixture.apps.googleusercontent.com", nonce: "fixture" } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await expect(page.locator("#google-signin button")).toBeVisible();
  for (const width of [1440, 768, 390, 768, 320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator("#google-signin").evaluate(container => {
      const form = document.querySelector('[data-form="auth"]').getBoundingClientRect();
      const button = container.firstElementChild.getBoundingClientRect();
      return Math.abs(button.width - form.width) <= 1 && Math.abs(button.x - form.x) <= 1 && button.right <= innerWidth;
    })).toBe(true);
  }
  expect(challenges).toBe(1);
  expect(await page.evaluate(() => googleProbe.initialized)).toBe(1);
  await page.locator('header a[href="/search"]').click();
  await expect(page.locator(".product-card").first()).toBeVisible();
  const calls = await page.evaluate(() => googleProbe.renders.length);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => googleProbe.renders.length)).toBe(calls);
  await page.locator(".header-account summary").click();
  await page.locator('.account-menu a[href="/login"]').click();
  await expect(page.locator("#google-signin button")).toBeVisible();
  expect(challenges).toBe(1);
  expect(await page.evaluate(() => googleProbe.initialized)).toBe(1);
});

test("authentication artwork stays below copy and small text has readable contrast", async ({ page }) => {
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(page.locator(".auth-form h1")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.locator(".auth-art").evaluate(art => {
      const img = art.querySelector("img").getBoundingClientRect();
      return [...art.querySelectorAll("h2,p")].every(text => text.getBoundingClientRect().bottom <= img.top);
    });
    expect(layout).toBe(true);
    const contrast = await page.evaluate(() => {
      const rgb = color => color.match(/[\d.]+/g).slice(0,3).map(Number).map(v => {
        v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
      });
      const luminance = color => rgb(color).reduce((sum, v, i) => sum + v * [.2126,.7152,.0722][i],0);
      return [".auth-form .footnote", ".auth-form .footnote a", ".auth-welcome"].map(selector => {
        const element = document.querySelector(selector);
        let parent = element, background;
        do { background = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; } while (parent && background === "rgba(0, 0, 0, 0)");
        const a = luminance(getComputedStyle(element).color), b = luminance(background);
        return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      });
    });
    contrast.forEach(ratio => expect(ratio).toBeGreaterThanOrEqual(4.5));
  }
});

test("Google failure leaves email sign-in usable and its retry can mount the button", async ({ page }) => {
  let attempts = 0;
  await page.addInitScript(() => {
    window.google = { accounts: { id: {
      initialize() {},
      renderButton(container, options) {
        const button = document.createElement("button");
        button.style.width = `${options.width}px`;
        button.textContent = "Google retry fixture";
        container.replaceChildren(button);
      },
    } } };
  });
  await page.route("**/api/meta", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), google_configured: true } });
  });
  await page.route("**/api/auth/google/challenge", route => ++attempts === 1
    ? route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "Google fixture unavailable" } } })
    : route.fulfill({ json: { client_id: "fixture.apps.googleusercontent.com", nonce: "retry" } }));
  await page.goto("/login");
  await expect(page.locator("#google-error")).toContainText("Google fixture unavailable");
  await expect(page.locator('[data-form="auth"] [type="submit"]')).toBeEnabled();
  await page.locator("#google-retry").click();
  await expect(page.locator("#google-signin button")).toBeVisible();
  await expect(page.locator("#google-error")).not.toBeVisible();
  expect(attempts).toBe(2);
});

test("tablet workspace uses the full row and mobile variant prices show all digits", async ({ page }) => {
  await login(page, "seller");
  await page.goto("/seller/products");
  await expect(page.locator(".workspace h1")).toBeVisible();
  for (const width of [640, 768, 900, 1024, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    const aside = await page.locator(".aside").boundingBox();
    const work = await page.locator(".workspace").boundingBox();
    expect(work.y).toBeGreaterThan(aside.y + aside.height);
    expect(Math.abs(work.width - aside.width)).toBeLessThanOrEqual(1);
  }
  await page.locator('[data-action="edit-product"]').first().click();
  await expect(page.locator("dialog")).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('[name="variant_price"]').fill("100000000");
    await page.locator('[name="variant_stock"]').fill("1000000");
    for (const name of ["variant_price", "variant_stock"]) {
      await expect(page.locator(`[name="${name}"]`)).toBeVisible();
      expect(await page.locator(`[name="${name}"]`).evaluate(input => input.scrollWidth <= input.clientWidth)).toBe(true);
    }
    expect(await page.locator("dialog").evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
});

test("empty buttons keep small icons, breadcrumbs have no trailing separator and 404 has a title", async ({ page }) => {
  await page.goto("/search?q=zzzzzz");
  await expect(page.locator(".empty")).toBeVisible();
  await expect(page.locator(".empty .btn svg")).toHaveCSS("width", "15px");
  await expect(page.locator(".empty .btn svg")).toHaveCSS("margin-bottom", "0px");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/product/product-1");
  await expect(page.locator(".detail-info h1")).toBeVisible();
  expect((await page.locator(".breadcrumbs").innerText()).trim().endsWith("/")).toBe(false);
  await page.goto("/not-found");
  await expect(page.locator("#content h1")).toHaveText("Trang này chưa có ở đây");
  await expect(page).toHaveTitle(/Trang này chưa có ở đây/);
});

test("missing, expired, used and invalid account links offer recovery without leaving a useless form", async ({ page }) => {
  for (const kind of ["reset", "verify"]) {
    await page.goto(`/${kind}`);
    await expect(page.locator(".auth-link-error")).toContainText("thiếu mã xác nhận");
    await expect(page.locator('[data-form="auth"]')).toHaveCount(0);
    for (const [status,code] of [[422,"expired_token"],[404,"not_found"],[409,"password_changed"]]) {
      await page.route(`**/api/auth/${kind}`, route => route.fulfill({ status, json: { error: { code, message: "Fixture invalid account link" } } }));
      await page.goto(`/${kind}?token=fixture-${code}`);
      if (kind === "reset") {
        await expect(page.locator(".auth-form > p").first()).toContainText("12 ký tự");
        await page.getByLabel("Mật khẩu mới", { exact: true }).fill("FixturePassword123!");
      }
      await page.locator('[data-form="auth"] button[type="submit"]').click();
      await expect(page.locator(".auth-link-error")).toContainText("đã hết hạn hoặc đã được sử dụng");
      await expect(page.locator('[data-form="auth"]')).toHaveCount(0);
      await expect(page.locator('.auth-link-error a.btn')).toHaveAttribute("href", kind === "reset" ? "/forgot" : "/account");
      await page.unroute(`**/api/auth/${kind}`);
    }
  }
});

test("valid account forms can retry a service failure and complete successfully", async ({ page }) => {
  for (const kind of ["reset", "verify"]) {
    let attempts = 0;
    await page.route(`**/api/auth/${kind}`, route => ++attempts === 1
      ? route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "Thử lại sau ít phút." } } })
      : route.fulfill({ json: { ok: true } }));
    await page.goto(`/${kind}?token=valid-fixture`);
    if (kind === "reset") await page.getByLabel("Mật khẩu mới", { exact: true }).fill("FixturePassword123!");
    const submit = page.locator('[data-form="auth"] button[type="submit"]');
    await submit.click();
    await expect(page.locator('[data-form="auth"] .form-error')).toContainText("Thử lại sau ít phút.");
    await expect(submit).toBeEnabled();
    await expect(page.locator(".auth-link-error")).toHaveCount(0);
    await submit.click();
    await expect(page).toHaveURL(/\/login$/);
    expect(attempts).toBe(2);
    await page.unroute(`**/api/auth/${kind}`);
  }
});

test("voucher management titles and empty actions belong to the current role", async ({ page }) => {
  for (const role of ["seller", "admin"]) {
    await login(page, role);
    await page.route("**/api/vouchers?*", async route => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...await response.json(), vouchers: [] } });
    });
    await page.goto(`/${role}/vouchers`);
    await expect(page.locator(".workspace h1")).toHaveText(role === "seller" ? "Voucher của shop" : "Voucher toàn sàn");
    await page.locator('.empty [data-action="new-voucher"]').click();
    await expect(page.locator('dialog form[data-scope]')).toHaveAttribute("data-scope", role);
    await page.keyboard.press("Escape");
    await page.unroute("**/api/vouchers?*");
  }
});

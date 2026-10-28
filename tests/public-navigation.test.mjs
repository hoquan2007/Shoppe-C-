import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import { guestSession } from "../guest-session/handler.js";
import { publicRouteApi } from "../frontend/navigation-intent.js";
import { createApiClient } from "../frontend/api.js";
const request = (path = "/api/auth/me?include=cart", options = {}) =>
  new Request("https://shoppec.vercel.app" + path, options);
const response = () => ({ ok: true, headers: new Headers(), json: async () => ({ products: [] }) });

test("native guest HTTP server preserves HEAD, rejects writes and fails closed on cookies", async () => {
  const child = spawn(process.execPath, ["guest-session/server.js"], {
    env: { ...process.env, PORT: "0" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Guest server startup timeout")), 5000);
      child.once("error", reject);
      child.stdout.once("data", chunk => { clearTimeout(timer); resolve(JSON.parse(chunk).port); });
    });
    const send = (method, cookie = "", path = "/api/auth/me?include=checkout") => new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port, path, method, headers: { cookie } }, res => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on("error", reject); req.end();
    });
    const get = await send("GET");
    assert.equal(get.status, 200);
    assert.equal(get.headers["cache-control"], "private, no-store");
    assert.deepEqual(JSON.parse(get.body), {user:null, csrf:"", shop:null, cart_summary:{quantity:0,revision:0}});
    assert.equal((await send("HEAD")).body, "");
    for (const method of ["POST", "PUT", "TRACE"]) {
      const result = await send(method);
      assert.equal(result.status, 405);
      assert.equal(result.headers.allow, "GET, HEAD");
    }
    assert.equal((await send("GET", "shoppe_session=invalid")).status, 503);
    assert.equal((await send("GET", "", "/api/cart")).status, 404);
  } finally { child.kill(); }
});

test("guest routing preserves no-store contracts and never authenticates cookie holders", async () => {
  for (const include of ["", "cart", "cart-view", "checkout", "unknown"]) {
    const result = guestSession(request("/api/auth/me?include=" + include));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    assert.equal(result.headers.get("set-cookie"), null);
    const data = await result.json();
    assert.equal(data.user, null);
    assert.equal(data.bootstrap, undefined);
    assert.equal(!!data.cart_summary, ["cart", "cart-view", "checkout"].includes(include));
  }
  for (const cookie of ["shoppe_session=" + "a".repeat(64), "shoppe_session=expired", "other=1; shoppe_session="]) {
    const result = guestSession(request(undefined, { headers: { cookie } }));
    assert.equal(result.status, 503);
    assert.equal((await result.json()).user, undefined);
  }
  assert.equal(await guestSession(request(undefined, { method: "HEAD" })).text(), "");
  assert.equal(guestSession(request(undefined, { method: "POST" })).status, 405);
  assert.equal(guestSession(request("/api/cart")).status, 404);
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url)));
  assert.equal(config.proxy, undefined);
  assert.deepEqual(config.rewrites[0], {
    source: "/api/auth/me", missing: [{ type: "cookie", key: "shoppe_session" }],
    destination: { service: "guest" },
  });
  assert.deepEqual(config.rewrites[1], {source: "/api/(.*)",destination:{service:"shoppe"}});
});

test("intent maps only public pages to the same canonical route reads", () => {
  const path = value => publicRouteApi(new URL(value, "https://shoppec.vercel.app"));
  assert.equal(path("/"), "/home");
  assert.equal(path("/search?q=tai&debug-perf=1&page=1"), "/products?include=meta&q=tai");
  assert.equal(path("/shop/a?q=x"), "/products?include=meta&q=x&shop=a");
  assert.equal(path("/product/a?page=2&debug-perf=1"), "/products/a?page=2&view=public");
  for (const url of ["/cart", "/checkout", "/account", "/admin", "/login", "/payment/a"])
    assert.equal(path(url), null);
});

test("navigation shares prefetch across route controllers; abort affects only that waiter", async () => {
  let release, calls = 0;
  const state = { requestController: new AbortController() };
  const client = createApiClient({ state, fetcher: async (_path, options) => {
    calls++;
    assert.equal(options.credentials, "omit");
    assert.equal(options.priority, "low");
    await new Promise(resolve => release = resolve);
    return response();
  } });
  const warming = client.prefetch("/products?include=meta");
  const old = client.api("/products?include=meta");
  const aborted = assert.rejects(old, { name: "AbortError" });
  state.requestController.abort();
  state.requestController = new AbortController();
  const current = client.api("/products?include=meta");
  release();
  await Promise.all([warming, aborted, current]);
  assert.equal(calls, 1);
});

test("prefetch is bounded, public only, one attempt, and a failure permits normal navigation", async () => {
  let calls = 0, fail = false;
  const client = createApiClient({ state: {}, fetcher: async () => {
    calls++;
    if (fail) throw new Error("offline");
    return response();
  } });
  assert.equal(await client.prefetch("/cart"), false);
  fail = true;
  assert.equal(await client.prefetch("/products?q=fail"), false);
  assert.equal(calls, 1);
  fail = false;
  await client.api("/products?q=fail");
  for (let i = 0; i < 5; i++) await client.prefetch("/products?q=" + i);
  assert.equal(calls, 5); // failed speculation + navigation + remaining three slots
});

test("catalog invalidation rejects warmed cache and in-flight warming cannot refill it", async () => {
  let release, calls = 0;
  const client = createApiClient({ state: {}, fetcher: async () => {
    if (++calls === 1) await new Promise(resolve => release = resolve);
    return response();
  } });
  const warming = client.prefetch("/products");
  client.invalidate();
  release();
  await warming;
  await client.api("/products");
  assert.equal(calls, 2);
});

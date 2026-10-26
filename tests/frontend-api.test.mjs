import test from "node:test";
import assert from "node:assert/strict";
import { canonicalApiPath, createApiClient } from "../frontend/api.js";

const response = (data = { products: [{ id: "public" }] }, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => structuredClone(data),
});
test("catalog defaults and query ordering share a cache key", () => {
  assert.equal(
    canonicalApiPath("/products?sort=new&page=1&q=&category=A"),
    "/products?category=A",
  );
  assert.equal(
    canonicalApiPath("/products?sort=price&page=2"),
    "/products?page=2&sort=price",
  );
  assert.equal(canonicalApiPath("/products?max=0"), "/products?max=0");
});
test("public requests omit credentials, share in-flight work, and clone cached results", async () => {
  const calls = [];
  const { api } = createApiClient({
    state: { csrf: "secret" },
    fetcher: async (...args) => {
      calls.push(args);
      return response();
    },
  });
  const [first, second] = await Promise.all([
    api("/products?page=1"),
    api("/products?sort=new"),
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].credentials, "omit");
  assert.equal(calls[0][1].headers["X-CSRF-Token"], undefined);
  first.products[0].id = "changed";
  assert.equal(second.products[0].id, "public");
  assert.equal((await api("/products")).products[0].id, "public");
});
test("public detail is cacheable while privileged preview and account data remain private", async () => {
  const calls = [];
  const { api } = createApiClient({
    state: { csrf: "csrf" },
    fetcher: async (...args) => {
      calls.push(args);
      return response();
    },
  });
  await api("/products/p?view=public");
  await api("/products/p?view=public");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].credentials, "omit");
  await api("/products/p");
  await api("/products/p");
  await api("/auth/me");
  await api("/auth/me");
  assert.equal(calls.length, 5);
  assert.equal(calls[1][1].credentials, "same-origin");
});
test("cart writes preserve public cache, product updates invalidate it", async () => {
  const calls = [];
  const { api } = createApiClient({
    state: {},
    fetcher: async (path, options) => {
      calls.push([path, options]);
      return response();
    },
  });
  await api("/products");
  await api("/cart", { method: "PUT", body: { items: [] } });
  await api("/products");
  assert.equal(calls.length, 2);
  await api("/seller/products/p", { method: "PUT", body: {} });
  await api("/products");
  assert.equal(calls.length, 4);
});
test("requests started before invalidation cannot repopulate cache", async () => {
  let release,
    reads = 0;
  const { api } = createApiClient({
    state: {},
    fetcher: async (path) => {
      if (path === "/api/products") {
        reads++;
        if (reads === 1) await new Promise((r) => (release = r));
      }
      return response();
    },
  });
  const old = api("/products");
  await api("/admin/products/p", { method: "POST", body: { active: false } });
  release();
  await old;
  await api("/products");
  assert.equal(reads, 2);
});
test("cancelled routes do not retry, and a new route can request the same URL", async () => {
  const state = { requestController: new AbortController() };
  let calls = 0;
  const { api } = createApiClient({
    state,
    fetcher: async (_path, options) => {
      calls++;
      if (calls > 1) return response();
      return new Promise((_resolve, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      );
    },
  });
  const old = api("/products");
  state.requestController.abort();
  state.requestController = new AbortController();
  assert.equal((await api("/products")).products[0].id, "public");
  await assert.rejects(old, { name: "AbortError" });
  assert.equal(calls, 2);
});
test("only transient GET failures retry; mutations are sent once", async () => {
  let calls = 0;
  const { api } = createApiClient({
    state: {},
    fetcher: async () => {
      calls++;
      return response({ error: { message: "Unavailable" } }, 503);
    },
  });
  await assert.rejects(api("/products"));
  assert.equal(calls, 2);
  await assert.rejects(api("/checkout", { method: "POST", body: {} }));
  assert.equal(calls, 3);
});

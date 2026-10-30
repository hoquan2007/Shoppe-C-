import test from "node:test";
import assert from "node:assert/strict";
import { canonicalApiPath, createApiClient } from "../frontend/api.js";

test("an HTML gateway failure preserves status and retries a read within its budget", async () => {
  let calls = 0;
  const { api } = createApiClient({ state: {}, fetcher: async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 503, json: async () => { throw new SyntaxError("HTML gateway body"); } };
    return response({ products: [] });
  }});
  assert.deepEqual(await api("/products"), { products: [] });
  assert.equal(calls, 2);
});

test("non-JSON mutations are not repeated and network failures use actionable messages", async () => {
  let calls = 0;
  const invalid = createApiClient({ state: {}, fetcher: async () => {
    calls++;
    return { ok: false, status: 502, json: async () => { throw new SyntaxError("HTML body"); } };
  }});
  await assert.rejects(invalid.api("/cart", { method: "PUT", body: { items: [] } }), error =>
    error.status === 502 && /dữ liệu hợp lệ/.test(error.message));
  assert.equal(calls, 1);
  const offline = createApiClient({ state: {}, fetcher: async () => { throw new TypeError("Failed to fetch"); }});
  await assert.rejects(offline.api("/products"), error => error.status === 503 && /kết nối/.test(error.message));
});

const response = (
  data = { products: [{ id: "public" }] },
  status = 200,
  headers = {},
) => ({
  ok: status < 400,
  status,
  headers: new Headers(headers),
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
      if (path.split("?")[0] === "/api/products") {
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

test("public query allowlists remove debug/tracking without losing filters or review pagination", () => {
  assert.equal(
    canonicalApiPath(
      "/products?debug-perf=1&utm_source=x&q=tai&page=2&sort=price",
    ),
    "/products?page=2&q=tai&sort=price",
  );
  assert.equal(
    canonicalApiPath(
      "/products/p?debug-perf=1&view=public&page=2&page_size=10",
    ),
    "/products/p?page=2&page_size=10&view=public",
  );
  assert.equal(canonicalApiPath("/meta?debug-perf=1"), "/meta");
  assert.equal(
    canonicalApiPath("/auth/reset?token=keep"),
    "/auth/reset?token=keep",
  );
  assert.equal(
    canonicalApiPath("/admin/products?q=email&page=2"),
    "/admin/products?page=2&q=email",
  );
});

test("CDN age consumes the memory freshness budget and stale responses are never extended", async () => {
  let clock = 100000,
    calls = 0;
  const { api, freshUntil } = createApiClient({
    state: {},
    now: () => clock,
    fetcher: async () => {
      calls++;
      return response(undefined, 200, {
        Age: calls < 3 ? "14" : "20",
        "X-Data-Ttl": "15",
      });
    },
  });
  await api("/products");
  assert.equal(freshUntil("/products"), 101000);
  clock = 100999;
  await api("/products");
  assert.equal(calls, 1);
  clock = 101001;
  await api("/products");
  assert.equal(calls, 2);
  clock = 102002;
  await api("/products");
  await api("/products");
  assert.equal(calls, 4);
});

test("generation timestamp catches stale data even if a downstream cache omits Age", async () => {
  let calls = 0;
  const { api } = createApiClient({
    state: {},
    fetcher: async () => {
      calls++;
      return response(undefined, 200, {
        "X-Data-Generated-At": "100",
        Date: new Date(130000).toUTCString(),
        "X-Data-Ttl": "15",
      });
    },
  });
  await api("/products");
  await api("/products");
  assert.equal(calls, 2);
});

test("catalog mutation reads use a new public generation while unrelated writes do not", async () => {
  const paths = [];
  const { api } = createApiClient({
    state: {},
    fetcher: async (path) => {
      paths.push(path);
      return response();
    },
  });
  await api("/products");
  await api("/admin/products/p", { method: "PUT", body: {} });
  await api("/products");
  await api("/products?debug-perf=1");
  assert.match(paths[2], /^\/api\/products\?_fresh=[\d-]+$/);
  assert.equal(paths.length, 3);
});

test("GET retries share one total deadline", async () => {
  let clock = 0,
    calls = 0;
  const { api } = createApiClient({
    state: {},
    now: () => clock,
    timeoutMs: 100,
    fetcher: async () => {
      calls++;
      clock = 101;
      return response({ error: { message: "Unavailable" } }, 503);
    },
  });
  await assert.rejects(api("/products"), { status: 504 });
  assert.equal(calls, 1);
});

test("a private/no-store response never enters reusable public memory cache", async () => {
  let calls = 0;
  const { api } = createApiClient({
    state: {},
    fetcher: async () => {
      calls++;
      return response(undefined, 200, { "Cache-Control": "private, no-store" });
    },
  });
  await api("/products");
  await api("/products");
  assert.equal(calls, 2);
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

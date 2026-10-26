export function canonicalApiPath(path) {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const allowed =
    pathname === "/products"
      ? new Set([
          "q",
          "category",
          "shop",
          "sort",
          "min",
          "max",
          "page",
          "page_size",
          "limit",
          "include",
        ])
      : /^\/products\/[^/]+$/.test(pathname) && params.get("view") === "public"
        ? new Set(["view", "page", "page_size", "q"])
        : ["/home", "/meta"].includes(pathname)
          ? new Set()
          : null;
  if (allowed)
    for (const key of [...params.keys()])
      if (!allowed.has(key)) params.delete(key);
  for (const [key, value] of [...params]) if (!value) params.delete(key);
  if (pathname === "/products") {
    for (const [key, value] of [
      ["page", "1"],
      ["sort", "new"],
      ["min", "0"],
      ["max", "100000000"],
    ])
      if (params.get(key) === value) params.delete(key);
  }
  params.sort();
  return pathname + (params.size ? "?" + params : "");
}

export function createApiClient({
  state,
  fetcher = (...args) => fetch(...args),
  now = Date.now,
  timeoutMs = 12000,
  observe = () => {},
}) {
  const cache = new Map(),
    pending = new Map();
  let epoch = 0;
  let refreshKey = "",
    refreshUntil = 0;
  const invalidate = () => {
    cache.clear();
    epoch++;
    // A short, public cache generation lets the editing tab read its committed
    // changes immediately without purging unrelated visitors' CDN entries.
    refreshKey = `${now()}-${epoch}`;
    refreshUntil = now() + 30000;
  };
  const report = (detail) => {
    try {
      observe(detail);
    } catch {
      /* Debug must not fail a request. */
    }
  };
  async function transport(path, options, publicRead, signal, revalidate) {
    const method = options.method || "GET";
    const started = now(),
      deadline = started + timeoutMs;
    for (let attempt = 0; attempt < (method === "GET" ? 2 : 1); attempt++) {
      const remaining = deadline - now();
      if (remaining <= 0)
        throw Object.assign(
          new Error("Kết nối quá thời gian chờ. Bạn thử lại nhé."),
          { status: 504 },
        );
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) controller.abort();
      const timer = setTimeout(abort, remaining);
      try {
        const response = await fetcher(
          "/api" +
            path +
            (revalidate
              ? (path.includes("?") ? "&" : "?") + "_fresh=" + revalidate
              : ""),
          {
            ...options,
            method,
            credentials: publicRead ? "omit" : "same-origin",
            signal: controller.signal,
            headers: {
              ...(method !== "GET"
                ? { "Content-Type": "application/json" }
                : {}),
              ...(!publicRead && state.csrf
                ? { "X-CSRF-Token": state.csrf }
                : {}),
              ...options.headers,
            },
            ...(options.body ? { body: JSON.stringify(options.body) } : {}),
          },
        );
        const data = await response.json();
        if (!response.ok || data.error) {
          const error = new Error(
            data.error?.message || "Không thể hoàn tất yêu cầu.",
          );
          error.status = response.status;
          error.code = data.error?.code;
          throw error;
        }
        const header = (name) => response.headers?.get(name);
        const ttl = Number(header("X-Data-Ttl") || 15) * 1000;
        const generated = Number(header("X-Data-Generated-At")) * 1000;
        const dated = Date.parse(header("Date") || "");
        const age = Math.max(
          Number(header("Age") || 0) * 1000,
          generated > 0 && Number.isFinite(dated) ? dated - generated : 0,
          0,
        );
        const freshFor = /private|no-store/i.test(header("Cache-Control") || "")
          ? 0
          : Math.max(0, Math.min(15000, ttl - age - (now() - started)));
        report({
          path,
          source: revalidate ? "network-refresh" : "network",
          attempt,
          duration: now() - started,
          cache: header("X-Vercel-Cache") || "unknown",
          ageMs: age,
          freshFor,
        });
        return { data, freshFor };
      } catch (error) {
        if (signal?.aborted) {
          report({ path, source: "aborted", attempt });
          throw error;
        }
        if (error.name === "AbortError") {
          error = new Error("Kết nối quá thời gian chờ. Bạn thử lại nhé.");
          error.status = 504;
        }
        if (
          attempt ||
          method !== "GET" ||
          (error.status && ![502, 503, 504].includes(error.status))
        )
          throw error;
        report({
          path,
          source: "retry",
          attempt: attempt + 1,
          duration: now() - started,
        });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    }
  }
  async function api(rawPath, options = {}) {
    const path = canonicalApiPath(rawPath),
      method = options.method || "GET";
    const publicRead =
      method === "GET" &&
      (/^\/(meta|home|products)(?:\?|$)/.test(path) ||
        (/^\/products\/[^/?]+(?:\?|$)/.test(path) &&
          new URLSearchParams(path.split("?")[1]).get("view") === "public"));
    const routeRead =
      method === "GET" && !/^\/(auth\/me|meta)(?:\?|$)/.test(path);
    const signal =
      options.signal ||
      (routeRead && !options.background
        ? state.requestController?.signal
        : null);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    // Cart/chat/account changes don't invalidate unrelated public catalog pages.
    const affectsCatalog =
      method !== "GET" &&
      /^\/(checkout(?:$|\?)|seller\/(products|import)|admin\/(products|shops|settings|catalog|reviews)|payments\/[^/]+\/cancel|reviews|returns|orders\/)/.test(
        path,
      );
    if (affectsCatalog) invalidate();
    if (method !== "GET" && /^\/admin\/(settings|catalog)/.test(path)) {
      state.metaPromise = null;
      state.metaUntil = 0;
    }
    const saved = publicRead && cache.get(path);
    if (saved && saved.until > now()) {
      report({ path, source: "memory", freshFor: saved.until - now() });
      return structuredClone(saved.data);
    }
    const version = epoch;
    const existing = publicRead && pending.get(path);
    if (
      existing &&
      existing.epoch === version &&
      existing.signal === signal &&
      !signal?.aborted
    ) {
      report({ path, source: "shared" });
      return structuredClone(await existing.promise);
    }
    const promise = transport(
      path,
      options,
      publicRead,
      signal,
      publicRead && refreshUntil > now() ? refreshKey : "",
    ).then(({ data, freshFor }) => {
      if (publicRead && version === epoch && !signal?.aborted) {
        if (cache.size >= 64) cache.delete(cache.keys().next().value);
        cache.set(path, {
          data: structuredClone(data),
          until: now() + freshFor,
        });
      }
      if (affectsCatalog) invalidate();
      return data;
    });
    const entry = { promise, signal, epoch: version };
    if (publicRead) pending.set(path, entry);
    try {
      return await promise;
    } finally {
      if (pending.get(path) === entry) pending.delete(path);
    }
  }
  return {
    api,
    invalidate,
    freshUntil: (path) => cache.get(canonicalApiPath(path))?.until || 0,
  };
}

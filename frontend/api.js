export function canonicalApiPath(path) {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
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
}) {
  const cache = new Map(),
    pending = new Map();
  let epoch = 0;
  const invalidate = () => {
    cache.clear();
    epoch++;
  };
  async function transport(path, options, publicRead, signal) {
    const method = options.method || "GET";
    for (let attempt = 0; attempt < (method === "GET" ? 2 : 1); attempt++) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) controller.abort();
      const timer = setTimeout(abort, 12000);
      try {
        const response = await fetcher("/api" + path, {
          ...options,
          method,
          credentials: publicRead ? "omit" : "same-origin",
          signal: controller.signal,
          headers: {
            ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
            ...(!publicRead && state.csrf
              ? { "X-CSRF-Token": state.csrf }
              : {}),
            ...options.headers,
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        });
        const data = await response.json();
        if (!response.ok || data.error) {
          const error = new Error(
            data.error?.message || "Không thể hoàn tất yêu cầu.",
          );
          error.status = response.status;
          error.code = data.error?.code;
          throw error;
        }
        return data;
      } catch (error) {
        if (signal?.aborted) throw error;
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
    if (saved && saved.until > now()) return structuredClone(saved.data);
    const version = epoch;
    const existing = publicRead && pending.get(path);
    if (
      existing &&
      existing.epoch === version &&
      existing.signal === signal &&
      !signal?.aborted
    )
      return structuredClone(await existing.promise);
    const promise = transport(path, options, publicRead, signal).then(
      (data) => {
        if (publicRead && version === epoch && !signal?.aborted) {
          if (cache.size >= 64) cache.delete(cache.keys().next().value);
          cache.set(path, {
            data: structuredClone(data),
            until: now() + 15000,
          });
        }
        if (affectsCatalog) invalidate();
        return data;
      },
    );
    const entry = { promise, signal, epoch: version };
    if (publicRead) pending.set(path, entry);
    try {
      return await promise;
    } finally {
      if (pending.get(path) === entry) pending.delete(path);
    }
  }
  return { api, invalidate };
}

import { canonicalApiPath } from "./api.js";

export function publicRouteApi(url) {
  const query = new URLSearchParams(url.search);
  if (url.pathname === "/") return "/home";
  if (url.pathname === "/search" || /^\/shop\/[^/]+$/.test(url.pathname)) {
    if (url.pathname.startsWith("/shop/"))
      query.set("shop", decodeURIComponent(url.pathname.slice(6)));
    query.set("include", "meta");
    return canonicalApiPath("/products?" + query);
  }
  if (/^\/product\/[^/]+$/.test(url.pathname)) {
    query.set("view", "public");
    return canonicalApiPath("/products/" + url.pathname.slice(9) + "?" + query);
  }
  return null;
}

export function installNavigationIntent(prefetch) {
  let timer;
  const cancel = () => clearTimeout(timer);
  const anchor = event => event.target.closest?.("a[href]");
  const prepare = event => {
    cancel();
    if (document.hidden || navigator.connection?.saveData ||
        /(^|-)2g$/.test(navigator.connection?.effectiveType || "") ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        (event.type === "pointerdown" && event.button !== 0)) return;
    const link = anchor(event);
    if (!link || link.download || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin ||
        url.pathname + url.search === location.pathname + location.search) return;
    let path;
    try { path = publicRouteApi(url); } catch { return; }
    if (!path) return;
    const run = () => { void prefetch(path); };
    if (event.type === "pointerover") timer = setTimeout(run, 160);
    else run();
  };
  document.addEventListener("pointerover", prepare);
  document.addEventListener("pointerout", event => {
    if (anchor(event) !== event.relatedTarget?.closest?.("a[href]")) cancel();
  });
  document.addEventListener("focusin", prepare);
  document.addEventListener("focusout", cancel);
  document.addEventListener("pointerdown", prepare);
  window.addEventListener("pagehide", cancel);
}

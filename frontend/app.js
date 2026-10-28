import "./style.css";
import "./redesign.css";
import { recordRoute, recordApi } from "./performance.js";
import { createApiClient } from "./api.js";
import { createCartWriter, readSettledCart, createCartBootstrap } from "./cart-state.js";
import { createGoogleSession } from "./google-session.js";
import { afterPaint } from "./render-scheduling.js";

const state = {
  user: null,
  shop: null,
  csrf: "",
  meta: {},
  products: [],
  cart: [],
  route: 0,
  timer: null,
  quote: null,
  checkoutKey: "",
  product: null,
};
const cartBootstrap = createCartBootstrap();
const bootstrapKey = () => JSON.stringify([
  location.pathname + location.search, state.user?.id, state.cartContext || 0,
  state.cartRevision || 0, state.cartRemoteRevision || 0,
]);
const cartChannel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("shoppe-cart")
    : null;
const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const currencyFormat = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
const money = (n) => currencyFormat.format(n || 0);
const date = (n) =>
  new Date(n * 1000).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  });
const short = (id) => String(id).slice(0, 8).toUpperCase();
const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
  cart: '<path d="m3 3 2 2 2 12h12l2-9H6"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  truck:
    '<path d="M1 4h13v13H1zM14 8h4l4 5v4h-8"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>',
  shield:
    '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
  return: '<path d="M4 10a8 8 0 1 1 2 9M4 4v6h6"/>',
  chat: '<path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-1l-6 3 2-6a9 9 0 1 1 17-5Z"/><path d="M8 11h8"/>',
  shirt: '<path d="m8 3-6 4 3 6 3-2v10h8V11l3 2 3-6-6-4a4 4 0 0 1-8 0Z"/>',
  device:
    '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  home: '<path d="m2 11 10-9 10 9M5 9v12h14V9M9 21v-8h6v8"/>',
  beauty: '<path d="M8 9h8v12H8zM10 9V3h4v6M9 3h6M5 5l-2-2m16 2 2-2"/>',
  watch:
    '<circle cx="12" cy="12" r="6"/><path d="m8 7 1-6h6l1 6M8 17l1 6h6l1-6M12 9v3l2 1"/>',
  sport: '<path d="M5 3v18m14-18v18M2 6h6v12H2zM16 6h6v12h-6zM8 12h8"/>',
  store:
    '<path d="M3 9h18l-2-6H5L3 9ZM4 9v12h16V9M9 21v-7h6v7"/><path d="M3 9c0 4 5 4 5 0 0 4 8 4 8 0 0 4 5 4 5 0"/>',
  box: '<path d="m12 2 10 5-10 5L2 7l10-5Zm10 5v11l-10 5L2 18V7M12 12v11M7 5l10 5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  settings:
    '<path d="m10 2-.8 3-3 1L3 5 1 9l3 2v3l-2 2 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-3-2v-3l2-2-2-4-3 1-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  chart: '<path d="M3 3v18h18M7 16v-5m5 5V6m5 10V9"/>',
  ticket:
    '<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z"/><path d="M15 5v14"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 5 10 8L22 5"/>',
  logout: '<path d="M9 3H3v18h6m5-5 5-4-5-4m-7 4h12"/>',
};
const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`;
const logo = () =>
  `<a class="brand" href="/" aria-label="Shoppe trang chủ">${icon("bag", 38)}<div>shoppe<small>Niềm vui mỗi ngày</small></div></a>`;
const categoryIcons = {
  "Thời trang": "shirt",
  "Điện tử": "device",
  "Nhà cửa & Đời sống": "home",
  "Sức khỏe & Làm đẹp": "beauty",
  "Phụ kiện": "watch",
  "Thể thao": "sport",
  "Bách hóa": "bag",
};
const labels = {
  new: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  preparing: "Đang chuẩn bị",
  shipping: "Đang giao",
  delivered: "Đã giao",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  delivery_failed: "Giao thất bại",
  pending: "Đang chờ",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  suspended: "Tạm khóa",
  paid: "Đã thanh toán",
  unpaid: "Chưa thanh toán",
  expired: "Hết hạn",
  review: "Cần đối soát",
  refunded: "Đã hoàn tiền",
  cod: "Thu tiền COD",
  requested: "Chờ duyệt trả",
  received: "Đã nhận lại hàng",
  sent: "Đã gửi",
  queued: "Chờ gửi",
  failed: "Lỗi gửi",
  sending: "Đang gửi",
};
const badge = (s) =>
  `<span class="badge ${["paid", "completed", "approved", "delivered", "sent", "received"].includes(s) ? "green" : ["cancelled", "rejected", "expired", "suspended", "failed", "review"].includes(s) ? "red" : ["shipping", "preparing"].includes(s) ? "blue" : ""}">${esc(labels[s] || s)}</span>`;
const image = (p) =>
  esc(
    /^(https:\/\/|\/assets\/)/.test(p || "")
      ? p
      : "/assets/product-lifestyle.svg",
  );
const title = (h, p = "", action = "") =>
  `<div class="page-title row between"><div><h1>${esc(h)}</h1>${p ? `<p>${esc(p)}</p>` : ""}</div>${action}</div>`;
const empty = (h, p, link = "/", text = "Khám phá sản phẩm") =>
  `<div class="empty">${icon("bag", 42)}<h3>${esc(h)}</h3><p>${esc(p)}</p><a class="btn outline" href="${esc(link)}">${esc(text)} ${icon("arrow", 15)}</a></div>`;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove("show"), 4300);
}
const { api, freshUntil } = createApiClient({ state, observe: recordApi });
async function ensureMeta(fresh = false) {
  const available = Array.isArray(state.meta.categories);
  if (
    !state.metaPromise ||
    (!state.metaLoading && state.metaUntil < Date.now())
  ) {
    state.metaLoading = true;
    state.metaPromise = api("/meta")
      .then((meta) => {
        state.metaUntil = freshUntil("/meta");
        state.metaError = null;
        return (state.meta = meta);
      })
      .catch((e) => {
        state.metaPromise = null;
        state.metaError = e;
        throw e;
      })
      .finally(() => {
        state.metaLoading = false;
      });
    // Background refresh failures must not become unhandled rejections.
    void state.metaPromise.catch(() => {});
  }
  if (available && !fresh) return state.meta;
  return state.metaPromise;
}
function catalogSearchQuery() {
  return location.pathname === "/search" ||
    location.pathname.startsWith("/shop/")
    ? new URLSearchParams(location.search).get("q") || ""
    : "";
}
function refreshHeader() {
  const current = $(".masthead");
  if (!current) return;
  const identity = JSON.stringify([
    state.user?.id,
    state.user?.name,
    state.user?.role,
  ]);
  if (state.headerIdentity !== identity) {
    const template = document.createElement("div");
    template.innerHTML = header();
    current
      .querySelector(".head-actions")
      .replaceWith($(".head-actions", template));
    current.querySelector(".navrow").replaceWith($(".navrow", template));
    state.headerIdentity = identity;
  }
  const route = location.pathname + location.search;
  if (state.headerLocation !== route) {
    const input = $(".search input", current);
    if (input) input.value = catalogSearchQuery();
    state.headerLocation = route;
  }
  $$(".navrow a", current).forEach((a) =>
    a.classList.toggle("active", a.getAttribute("href") === route),
  );
  $$(".mobile-nav a").forEach((a) =>
    a.getAttribute("href") === location.pathname
      ? a.setAttribute("aria-current", "page")
      : a.removeAttribute("aria-current"),
  );
}
const post = (path, body = {}) => api(path, { method: "POST", body });
let googleScript;
const googleSession = createGoogleSession({
  challenge: () => post("/auth/google/challenge"),
  initialize: ({ client_id, nonce, callback }) =>
    window.google.accounts.id.initialize({
      client_id,
      nonce,
      callback,
      auto_select: false,
    }),
});
function googleSignInArea(link = false) {
  if (!state.meta.google_configured) return "";
  if (link && !new URLSearchParams(location.search).has("google"))
    return '<div class="google-auth"><button class="btn outline small" data-action="google-link" type="button">Liên kết đăng nhập Google</button></div>';
  return `<div class="google-auth"><p class="google-divider">${link ? "Liên kết đăng nhập Google" : "Hoặc tiếp tục với"}</p>${link ? '<p class="muted small-text">Chọn Google cùng email với tài khoản này.</p>' : ""}<div id="google-signin" aria-label="Đăng nhập bằng Google"></div><p id="google-status" class="muted small-text" role="status">Đang tải Google…</p><p id="google-error" class="form-error" role="alert" hidden></p><button type="button" class="btn outline small" id="google-retry" hidden>Thử lại Google</button></div>`;
}
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!googleScript)
    googleScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client?hl=vi";
      script.async = true;
      const timer = setTimeout(() => fail(), 15000);
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        googleScript = null;
        reject(
          new Error(
            "Chưa tải được Google. Bạn có thể thử lại hoặc đăng nhập bằng email.",
          ),
        );
      };
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = fail;
      document.head.append(script);
    });
  return googleScript;
}
async function mountGoogleSignIn(version) {
  const container = $("#google-signin");
  if (!container) return;
  const status = $("#google-status"),
    error = $("#google-error"),
    retry = $("#google-retry");
  const current = () => version === state.route && container.isConnected;
  const failed = (e) => {
    if (!current()) return;
    container.replaceChildren();
    status.hidden = true;
    error.textContent = e.message;
    error.hidden = false;
    retry.hidden = false;
  };
  retry.onclick = () => {
    if (retry.dataset.restart) {
      location.reload();
      return;
    }
    retry.hidden = true;
    error.hidden = true;
    status.hidden = false;
    status.textContent = "Đang tải Google…";
    mountGoogleSignIn(version);
  };
  try {
    await loadGoogleScript();
    if (!current()) return;
    const context = JSON.stringify([state.user?.id || "", state.csrf || ""]);
    await googleSession.ready(context, async ({ credential }) => {
      if (!current()) return;
      status.textContent = "Đang xác minh Google…";
      status.hidden = false;
      try {
        googleSession.consume(context);
        const result = await post("/auth/google", { credential });
        acceptSession(result);
        if (!current()) return;
        let next =
          new URLSearchParams(location.search).get("next") ||
          (location.pathname === "/account" ? "/account" : "/");
        if (!next.startsWith("/") || next.startsWith("//")) next = "/";
        toast("Đăng nhập Google thành công.");
        // A fresh document owns a fresh nonce and SDK instance after Google auth.
        location.assign(next);
      } catch (e) {
        retry.dataset.restart = "true";
        failed(e);
      }
    });
    if (!current()) return;
    window.google.accounts.id.renderButton(container, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      locale: "vi",
      width: Math.min(
        360,
        Math.max(200, Math.floor(container.getBoundingClientRect().width)),
      ),
    });
    status.hidden = true;
  } catch (e) {
    if (e.code === "google_document_restart") {
      if (!current()) return;
      if (location.pathname === "/account")
        location.replace("/account?google=1");
      else location.reload();
      return;
    }
    failed(e);
  }
}
async function mountAuthExtras(version, link = false) {
  try {
    await Promise.all([ensureMeta(true), state.sessionReady]);
    if (state.sessionError) throw state.sessionError;
    if (version !== state.route) return;
    const form = link ? $("[data-form=profile]") : $("[data-form=auth]");
    if (!form || form.parentElement.querySelector(".google-auth")) return;
    form.insertAdjacentHTML("afterend", googleSignInArea(link));
    void mountGoogleSignIn(version);
  } catch {
    if (version !== state.route) return;
    const form = link ? $("[data-form=profile]") : $("[data-form=auth]");
    if (form && !form.parentElement.querySelector(".auth-options-retry"))
      form.insertAdjacentHTML(
        "afterend",
        '<p class="small-text muted auth-options-retry">Chưa tải được lựa chọn Google. <button class="btn link small" data-action="retry-auth-options" type="button">Thử lại</button></p>',
      );
  }
}
function requireUser() {
  if (!state.user) {
    go(
      "/login?next=" + encodeURIComponent(location.pathname + location.search),
    );
    return false;
  }
  return true;
}
function acceptSession(me) {
  state.sessionError = null;
  if (state.user?.id !== me.user?.id || state.csrf !== me.csrf) {
    cartBootstrap.invalidate();
    state.cartReady = false;
    state.cart = [];
    state.cartLines = [];
    state.cartWriter = null;
    state.cart_summary = null;
    state.cartContext = (state.cartContext || 0) + 1;
  }
  Object.assign(state, me);
  if (
    me.cart_summary &&
    !state.cartWritePending &&
    me.cart_summary.revision !== state.cartServerRevision
  )
    state.cartReady = false;
  state.sessionRevision = (state.sessionRevision || 0) + 1;
  state.sessionError = null;
}
async function refreshUser({ include = "cart", route = "" } = {}) {
  const revision = state.sessionRevision || 0;
  const cartRevision = state.cartRevision || 0, seedVersion = cartBootstrap.version();
  try {
    const { bootstrap, ...me } = await api("/auth/me?include=" + include);
    if (revision === (state.sessionRevision || 0)) {
      const useBootstrap = bootstrap && me.user && route === location.pathname + location.search &&
        seedVersion === cartBootstrap.version() && cartRevision === (state.cartRevision || 0) &&
        !state.cartWritePending;
      acceptSession(me);
      // acceptSession can invalidate an older identity; this response is verified
      // for the newly accepted identity and has not crossed any async boundary.
      if (useBootstrap) cartBootstrap.save(bootstrap, bootstrapKey());
    }
  } catch (error) {
    if (revision === (state.sessionRevision || 0)) throw error;
  }
}
function header() {
  const cartCount = cartQuantity();
  return `<div class="topbar"><div class="wrap"><span class="left-top">Mỗi món đồ, một niềm vui mới.</span><div class="topbar-links"><a href="/seller">Kênh người bán</a><a href="/notifications">Thông báo</a><span>Tiếng Việt / VNĐ</span></div></div></div><header class="masthead"><div class="wrap head-main">${logo()}<form class="search" data-form="search"><input name="q" aria-label="Tìm sản phẩm" placeholder="Tìm món đồ bạn yêu thích" value="${esc(catalogSearchQuery())}"><button aria-label="Tìm kiếm">${icon("search", 21)}</button></form><div class="head-actions"><a class="head-icon" href="/wishlist" aria-label="Yêu thích">${icon("heart", 22)}<span>Yêu thích</span></a><a class="head-icon" href="${state.user ? "/account" : "/login"}" aria-label="Tài khoản">${icon("user", 22)}<span>${esc(state.user?.name.split(" ").slice(-2).join(" ") || "Đăng nhập")}</span></a><a class="head-icon" href="/cart" aria-label="Giỏ hàng">${icon("cart", 24)}<b class="count">${cartCount}</b><span>Giỏ hàng</span></a></div></div><nav class="wrap navrow" aria-label="Điều hướng chính"><a href="/search" class="all-categories">${icon("grid", 17)} Danh mục sản phẩm</a><a href="/" class="${location.pathname === "/" ? "active" : ""}">Khám phá</a><a href="/search?sort=new">Hàng mới về</a><a href="/vouchers">Ưu đãi hôm nay</a><a href="/orders">Đơn mua của tôi</a><a href="/chat">Tin nhắn</a>${state.user?.role === "admin" ? '<a href="/admin">Quản trị</a>' : ""}<a class="end-link" href="/vouchers">Ưu đãi chào bạn mới</a></nav></header>`;
}
function footer() {
  return `<footer class="footer"><div class="wrap"><div class="footer-grid"><div>${logo()}<p>Kết nối những shop bạn tin với những món đồ bạn yêu. Mua sắm giản đơn, mỗi ngày thêm vui.</p><div class="row muted">${icon("shield", 18)}<span class="small-text">Mua sắm với sự an tâm</span></div></div><div><h4>Khám phá Shoppe</h4><a class="footer-link" href="/search">Tất cả sản phẩm</a><a class="footer-link" href="/vouchers">Mã giảm giá</a><a class="footer-link" href="/seller">Trở thành người bán</a></div><div><h4>Đồng hành cùng bạn</h4><a class="footer-link" href="/orders">Theo dõi đơn hàng</a><a class="footer-link" href="/chat">Nhắn tin với shop</a><a class="footer-link" href="/account">Tài khoản của bạn</a></div><div><h4>Thanh toán</h4><div class="row"><span class="badge green">payOS</span><span class="badge gray">COD</span></div><p>Thanh toán chuyển khoản hoặc nhận hàng rồi thanh toán.</p></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} Shoppe. Một dự án học tập về thương mại điện tử.</span><span>Được tạo với sự chỉn chu, dành cho mỗi ngày của bạn.</span></div></div></footer>`;
}
function shell() {
  const destinations = [
    ["/", "home", "Trang chủ"],
    ["/search", "grid", "Khám phá"],
    ["/cart", "cart", "Giỏ hàng"],
    ["/orders", "box", "Đơn mua"],
    ["/account", "user", "Tài khoản"],
  ];
  $("#app").innerHTML =
    header() +
    '<main class="main"><div class="wrap" id="content"><div class="loading" role="status"><span class="spinner"></span><span>Đang tải nội dung…</span></div></div></main>' +
    footer() +
    `<nav class="mobile-nav" aria-label="Điều hướng điện thoại">${destinations.map(([href, i, label]) => `<a href="${href}" ${location.pathname === href ? 'aria-current="page"' : ""}>${icon(i, 21)}<span>${label}</span></a>`).join("")}</nav>`;
}
function card(p) {
  const variants = p.variants.filter((v) => v.active);
  const price = Math.min(...variants.map((v) => v.price));
  return `<article class="product-card"><a href="/product/${esc(p.id)}" class="product-image"><span class="product-tag">${esc(p.category)}</span><img src="${image(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async" width="400" height="400"></a><button class="favorite" data-action="favorite" data-id="${esc(p.id)}" aria-label="Yêu thích ${esc(p.name)}">${icon("heart", 19)}</button><div class="product-info"><a class="product-shop" href="/shop/${esc(p.shop_id)}">${esc(p.shop?.name || "")}</a><a class="product-name" href="/product/${esc(p.id)}">${esc(p.name)}</a><div class="product-bottom"><span class="price">${Number.isFinite(price) ? money(price) : "Ngừng bán"}</span><span class="rating">${p.review_count ? "★ " + p.rating.toFixed(1) : "Mới"}</span></div><div class="product-meta"><span>${esc(p.shop?.region || "Việt Nam")}</span><span>${variants.reduce((n, v) => n + v.stock, 0) ? "Sẵn hàng" : "Hết hàng"}</span></div>${p.is_demo ? '<span class="demo-label">Sản phẩm minh họa</span>' : ""}</div></article>`;
}
const cards = (products, home = false) =>
  `<div class="products ${home ? "home-products" : ""}">${products.map(card).join("")}</div>`;
async function home() {
  const { products, meta, category_previews } = await api("/home");
  state.products = products;
  state.meta = meta;
  state.metaPromise = Promise.resolve(meta);
  state.metaUntil = freshUntil("/home");
  const categories = meta.categories || [];
  const pick = (category) => category_previews[category] || products[0];
  const featured = pick("Điện tử"),
    homeProduct = pick("Nhà cửa & Đời sống"),
    accessory = pick("Phụ kiện");
  const heroTitle =
    meta.settings?.banner_title || "Một chút mới. Thêm nhiều vui.";
  const featureImage = featured
    ? `<a class="market-object" href="/product/${esc(featured.id)}"><img src="${image(featured.image)}" alt="${esc(featured.name)}" width="520" height="520" fetchpriority="high"><span>${esc(featured.name)}</span></a>`
    : "";
  const promo = (product, category, heading, text) =>
    `<a class="market-promo" href="/search?category=${encodeURIComponent(category)}"><div><h2>${heading}</h2><span>${text}</span></div>${product ? `<img src="${image(product.image)}" alt="${esc(product.name)}" width="200" height="200">` : ""}</a>`;
  return `<section class="market-hero"><div class="market-lead"><div class="market-copy"><h1>${esc(heroTitle)}</h1><p>${esc(meta.settings?.banner_subtitle || "Khám phá những món đồ bạn yêu, từ những shop bạn tin.")}</p><a class="btn" href="/search">Khám phá ngay</a></div>${featureImage}</div><div class="market-side">${promo(homeProduct, "Nhà cửa & Đời sống", "Đồ xinh cho góc nhỏ của bạn.", "Tìm cảm hứng")}${promo(accessory, "Phụ kiện", "Phụ kiện nhỏ. Trải nghiệm lớn.", "Xem bộ sưu tập")}</div></section><section class="category-section"><div class="section-head"><div><h2>Bạn muốn tìm gì?</h2><p>Mọi điều bạn cần, ở ngay đây.</p></div><a href="/search">Tất cả danh mục</a></div><div class="market-categories">${categories
    .map((c) => {
      const product = pick(c);
      return `<a class="market-category" href="/search?category=${encodeURIComponent(c)}">${product ? `<img src="${image(product.image)}" alt="" width="80" height="80" loading="lazy">` : icon(categoryIcons[c] || "grid", 24)}<span>${esc(c)}</span></a>`;
    })
    .join(
      "",
    )}</div></section><section class="home-catalog"><div class="section-head catalog-head"><div><h2>Dành riêng cho hôm nay</h2><p>Một vài gợi ý, biết đâu là món bạn đang tìm.</p></div><div class="discovery"><button class="chip active" data-action="home-filter" data-value="all">Gợi ý cho bạn</button><button class="chip" data-action="home-filter" data-value="new">Mới nhất</button><button class="chip" data-action="home-filter" data-value="price">Giá dễ yêu</button></div></div><div id="home-products">${products.length ? cards(products.slice(0, 12), true) : empty("Chưa có sản phẩm", "Các shop sẽ sớm mang những món đồ mới đến đây.", "/seller", "Mở shop của bạn")}</div><div class="catalog-more"><a class="btn outline" href="/search">Khám phá thêm</a></div></section><div class="benefits">${[
    ["truck", "Giao hàng tiện lợi", "Theo dõi từng bước hành trình"],
    ["shield", "Thanh toán an tâm", "payOS & thanh toán khi nhận hàng"],
    ["return", "Đổi trả dễ dàng", "Yêu cầu trả hàng trong 7 ngày"],
    ["chat", "Luôn có người lắng nghe", "Kết nối trực tiếp cùng shop"],
  ]
    .map(
      ([i, h, p]) =>
        `<div class="benefit">${icon(i, 23)}<div><strong>${h}</strong><small>${p}</small></div></div>`,
    )
    .join(
      "",
    )}</div><section class="newsletter"><div><h3>Shop nhỏ của bạn. Cơ hội lớn mỗi ngày.</h3><p>Mang sản phẩm của bạn đến với những người đang tìm kiếm.</p></div><a class="btn" href="/seller">Bắt đầu bán hàng</a></section>`;
}
function pagination(page) {
  if (!page.pages || page.pages < 2) return "";
  const link = (n) => {
    const q = new URLSearchParams(location.search);
    q.set("page", n);
    return location.pathname + "?" + esc(q);
  };
  const pages = [
    ...new Set([1, page.page - 1, page.page, page.page + 1, page.pages]),
  ]
    .filter((n) => n > 0 && n <= page.pages)
    .sort((a, b) => a - b);
  return (
    '<nav class="pagination" aria-label="Phân trang">' +
    (page.page > 1
      ? '<a href="' + link(page.page - 1) + '" aria-label="Trang trước">←</a>'
      : "") +
    pages
      .map(
        (n, i) =>
          (i && n > pages[i - 1] + 1 ? "<span>…</span>" : "") +
          '<a href="' +
          link(n) +
          '" ' +
          (n === page.page ? 'aria-current="page" class="active"' : "") +
          ">" +
          n +
          "</a>",
      )
      .join("") +
    (page.page < page.pages
      ? '<a href="' + link(page.page + 1) + '" aria-label="Trang sau">→</a>'
      : "") +
    "</nav>"
  );
}
async function searchPage(shopId = "") {
  const catalogPath = shopId
    ? "/shop/" + encodeURIComponent(shopId)
    : "/search";
  const params = new URLSearchParams(location.search);
  if (shopId) params.set("shop", shopId);
  const query = new URLSearchParams(params);
  query.set("include", "meta");
  const {
    products: list,
    total,
    page,
    page_size: pageSize,
    pages,
    meta,
    shop,
  } = await api("/products?" + query);
  state.meta = meta;
  state.metaUntil = freshUntil("/products?" + query);
  state.metaPromise = Promise.resolve(meta);
  const sort = params.get("sort") || "new";
  const link = (i) => {
    const q = new URLSearchParams(params);
    q.set("page", i);
    if (shopId) q.delete("shop");
    return (
      (shopId ? "/shop/" + encodeURIComponent(shopId) : "/search") +
      "?" +
      esc(q)
    );
  };
  const visible = [
    ...new Set([
      1,
      ...Array.from({ length: 5 }, (_, i) => page - 2 + i),
      pages,
    ]),
  ]
    .filter((i) => i >= 1 && i <= pages)
    .sort((a, b) => a - b);
  const paging =
    pages > 1
      ? `<nav class="pagination" aria-label="Phân trang sản phẩm">${page > 1 ? `<a href="${link(page - 1)}" aria-label="Trang trước">${icon("arrow", 16)}</a>` : ""}${visible.map((i, n) => `${n && i > visible[n - 1] + 1 ? '<span class="page-gap" aria-hidden="true">…</span>' : ""}<a class="${page === i ? "active" : ""}" ${page === i ? 'aria-current="page"' : ""} href="${link(i)}">${i}</a>`).join("")}${page < pages ? `<a href="${link(page + 1)}" aria-label="Trang sau">${icon("arrow", 16)}</a>` : ""}<label class="page-picker"><span>Đến trang</span><select id="catalog-page" aria-label="Chọn trang">${Array.from({ length: pages }, (_, i) => `<option value="${i + 1}" ${page === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label></nav>`
      : "";
  return (
    (shop
      ? `<div class="panel shop-strip"><div class="avatar">${esc(shop.name[0])}</div><div><h1 style="font-size:24px">${esc(shop.name)}</h1><p class="muted small-text">${esc(shop.description)}</p><small class="muted">${esc(shop.region)}</small></div><button class="btn outline" style="margin-left:auto" data-action="start-chat" data-id="${esc(shop.id)}">${icon("chat", 16)} Nhắn tin</button></div>`
      : "") +
    title(
      params.get("q")
        ? `Kết quả cho “${params.get("q")}”`
        : params.get("category") || "Khám phá sản phẩm",
      `${total} lựa chọn đang chờ bạn khám phá`,
    ) +
    `<div class="catalog-layout"><aside class="filter-panel"><button class="filter-toggle" type="button" data-action="toggle-filters" aria-expanded="false" aria-controls="catalog-filters">${icon("settings", 18)} Bộ lọc sản phẩm</button><div class="filter-content" id="catalog-filters"><h3>Danh mục</h3><a class="category-link" href="${catalogPath}">Tất cả sản phẩm</a>${(state.meta.categories || []).map((c) => `<a class="category-link ${params.get("category") === c ? "active" : ""}" href="${catalogPath}?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join("")}<form data-form="filter-price"><input type="hidden" name="category" value="${esc(params.get("category") || "")}"><input type="hidden" name="q" value="${esc(params.get("q") || "")}"><label class="field"><span>Giá từ</span><input type="number" name="min" min="0" placeholder="0" value="${esc(params.get("min") || "")}"></label><label class="field"><span>Đến</span><input type="number" name="max" min="0" placeholder="Không giới hạn" value="${esc(params.get("max") || "")}"></label><button class="btn full">Áp dụng</button></form></div></aside><div class="catalog-results"><div class="catalog-toolbar"><span>${total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / ${total} sản phẩm` : "Chọn điều bạn yêu"}</span><select class="sort-select" id="sort-products" aria-label="Sắp xếp">${[
      ["new", "Mới nhất"],
      ["price", "Giá thấp đến cao"],
      ["price-desc", "Giá cao đến thấp"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${v === sort ? "selected" : ""}>${t}</option>`,
      )
      .join(
        "",
      )}</select></div>${list.length ? cards(list) : empty("Chưa tìm thấy sản phẩm", "Bạn thử từ khóa hoặc khoảng giá khác nhé.")}${paging}</div></div>`
  );
}
async function productPage(id) {
  const query = new URLSearchParams(location.search);
  query.set("view", "public");
  const {
    product: p,
    reviews,
    review_page,
  } = await api("/products/" + id + "?" + query);
  state.product = p;
  state.variant = p.variants.find((v) => v.active);
  const v = state.variant;
  return `<div class="breadcrumbs"><a href="/">Trang chủ</a><span>/</span><a href="/search?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a><span>/</span><span>${esc(p.name)}</span></div><div class="detail-grid"><div class="detail-photo"><img src="${image(p.image)}" alt="${esc(p.name)}" width="640" height="640" fetchpriority="high">${p.is_demo ? '<span class="detail-demo">Sản phẩm minh họa cho bài tập</span>' : ""}</div><div class="detail-info"><h1>${esc(p.name)}</h1><div class="detail-rating">${p.review_count ? `★ ${p.rating.toFixed(1)}` : "Chưa có đánh giá"}<span>${p.review_count} đánh giá</span></div><div class="detail-price" id="variant-price">${money(v?.price)}</div><h2 class="variant-title">Phân loại</h2><div class="variants">${p.variants
    .filter((v) => v.active)
    .map(
      (item, i) =>
        `<button class="variant ${i === 0 ? "active" : ""}" data-action="variant" data-id="${esc(item.id)}" aria-pressed="${i === 0}">${esc(item.name)}</button>`,
    )
    .join(
      "",
    )}</div><div class="detail-quantity"><div class="quantity"><button data-action="detail-qty" data-value="-1" aria-label="Giảm số lượng">−</button><input id="product-qty" type="number" min="1" max="99" value="1" aria-label="Số lượng"><button data-action="detail-qty" data-value="1" aria-label="Tăng số lượng">+</button></div><span id="variant-stock">${v?.stock || 0} sản phẩm có sẵn</span></div><div class="detail-actions"><button class="btn outline" data-action="add-cart" ${!v?.stock ? "disabled" : ""}>${icon("cart", 19)} Thêm vào giỏ</button><button class="btn" data-action="buy-now" ${!v?.stock ? "disabled" : ""}>Mua ngay</button></div><div class="detail-benefits"><span>${icon("shield", 17)} Thanh toán an tâm</span><span>${icon("return", 17)} Trả hàng trong 7 ngày</span></div><div class="shop-strip"><div class="avatar">${esc(p.shop.name[0])}</div><div><strong>${esc(p.shop.name)}</strong><p class="small-text muted">${esc(p.shop.region)}</p></div><a class="btn secondary small" href="/shop/${esc(p.shop_id)}">Xem shop</a><button class="icon-btn" data-action="start-chat" data-id="${esc(p.shop_id)}" aria-label="Chat với shop">${icon("chat")}</button></div></div></div><section class="panel product-description"><h2>Thông tin sản phẩm</h2><p class="description">${esc(p.description)}</p></section><section class="panel product-reviews"><h2>Đánh giá từ người mua (${p.review_count})</h2>${
    reviews
      .filter((r) => !r.hidden)
      .map(
        (r) =>
          `<article class="review"><div class="row between"><strong>${esc(r.name)}</strong><span class="muted small-text">${date(r.created_at)}</span></div><div class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div><p>${esc(r.comment)}</p></article>`,
      )
      .join("") ||
    '<p class="muted">Chưa có đánh giá. Mua và trải nghiệm để chia sẻ cảm nhận của bạn.</p>'
  }${pagination(review_page)}</section>`;
}

async function shopPage(id) {
  return searchPage(id);
}
function authPage(kind) {
  const register = kind === "register",
    forgot = kind === "forgot",
    reset = kind === "reset",
    verify = kind === "verify";
  const h = register
    ? "Xin chào bạn mới!"
    : forgot
      ? "Quên mật khẩu?"
      : reset
        ? "Mật khẩu mới"
        : verify
          ? "Xác minh email"
          : "Rất vui gặp lại bạn.";
  return `<div class="auth-wrap"><div class="auth-art"><p class="auth-welcome">Chào bạn đến Shoppe</p><h2 style="margin-top:20px">Mỗi món đồ.<br>Một niềm vui mới.</h2><p>Một nơi nhỏ để khám phá những điều bạn yêu.</p><img src="/assets/hero.svg" alt="Bộ sưu tập Shoppe"></div><div class="auth-form"><h1>${h}</h1><p>${register ? "Tạo tài khoản để bắt đầu hành trình mua sắm." : forgot ? "Nhập email để nhận hướng dẫn khôi phục." : verify ? "Xác nhận địa chỉ email của bạn." : "Những điều thú vị đang chờ bạn."}</p><form data-form="auth" data-kind="${kind}">${register ? field("Họ và tên", "name", "", "text", 'required maxlength="100" autocomplete="name"') : ""}${!reset && !verify ? field("Email", "email", "", "email", 'required autocomplete="email"') : ""}${!forgot && !verify ? field(reset ? "Mật khẩu mới" : "Mật khẩu", "password", "", "password", `required ${register || reset ? 'minlength="12"' : ""} maxlength="128" autocomplete="${register || reset ? "new-password" : "current-password"}"`) : ""}${register || reset ? '<p class="small-text muted" style="margin:-7px 0 20px">Sử dụng ít nhất 12 ký tự để bảo vệ tài khoản.</p>' : ""}${!register && !forgot && !reset && !verify ? '<div style="text-align:right;margin:-6px 0 18px"><a class="small-text muted" href="/forgot">Quên mật khẩu?</a></div>' : ""}<div class="form-error" hidden></div><button class="btn full">${register ? "Tạo tài khoản" : forgot ? "Gửi hướng dẫn" : reset ? "Đặt lại mật khẩu" : verify ? "Xác minh email" : "Đăng nhập"} ${icon("arrow", 15)}</button></form><p class="footnote">${register ? 'Đã có tài khoản? <a href="/login">Đăng nhập</a>' : forgot || reset || verify ? '<a href="/login">Quay về đăng nhập</a>' : 'Chưa có tài khoản? <a href="/register">Đăng ký ngay</a>'}</p></div></div>`;
}
function field(label, name, value = "", type = "text", extra = "") {
  return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function textarea(label, name, value = "", extra = "") {
  return `<label class="field"><span>${esc(label)}</span><textarea name="${esc(name)}" ${extra}>${esc(value)}</textarea></label>`;
}
function regionField(value = "Miền Nam") {
  return `<label class="field"><span>Khu vực</span><select name="region">${["Miền Bắc", "Miền Trung", "Miền Nam"].map((r) => `<option ${r === value ? "selected" : ""}>${r}</option>`).join("")}</select></label>`;
}
async function accountPage() {
  if (!requireUser()) return "";
  const { addresses } = await api("/addresses");
  return (
    title(
      "Tài khoản của tôi",
      "Quản lý thông tin và địa chỉ để mua sắm thuận tiện hơn.",
    ) +
    `<div class="grid-2"><section class="panel"><h3>Hồ sơ</h3><form data-form="profile">${field("Họ và tên", "name", state.user.name, "text", "required")}${field("Email", "email", state.user.email, "email", "disabled")}<div class="notice ${state.user.verified ? "success" : ""}">${state.user.verified ? "Email đã được xác minh." : "Email chưa xác minh. " + '<button class="btn link" type="button" data-action="resend-verification">Gửi lại email</button>'}</div><button class="btn">Lưu thay đổi</button></form><button class="btn danger small" style="margin-top:25px" data-action="logout">${icon("logout", 14)} Đăng xuất</button></section><section class="panel"><div class="row between"><h3>Sổ địa chỉ</h3><button class="btn outline small" data-action="add-address">${icon("plus", 14)} Thêm mới</button></div>${addresses.map((a) => `<div style="padding:18px 0;border-bottom:1px solid var(--line)"><div class="row between"><strong class="small-text">${esc(a.name)} · ${esc(a.phone)}</strong><button class="icon-btn" data-action="delete-address" data-id="${esc(a.id)}" aria-label="Xóa địa chỉ">${icon("trash", 15)}</button></div><p class="small-text muted" style="margin-top:7px">${esc(a.street)}, ${esc(a.city)} · ${esc(a.region)}</p>${a.is_default ? '<span class="badge green" style="margin-top:8px">Mặc định</span>' : ""}</div>`).join("") || '<p class="small-text muted">Chưa có địa chỉ. Thêm địa chỉ đầu tiên để đặt hàng.</p>'}</section></div>`
  );
}
async function cartPage() {
  if (!requireUser()) return "";
  if (state.cartWritePending) await state.cartWritePending.catch(() => {});
  const bootstrap = cartBootstrap.take(bootstrapKey());
  if (bootstrap) {
    acceptCart(bootstrap);
    return cartContent(bootstrap.lines);
  }
  if (state.cartReady && state.cartFetchedAt > Date.now() - 1000)
    return cartContent(state.cartLines);
  const result = await refreshCart();
  return cartContent(result.lines);
}
function cartContent(lines) {
  const groups = Object.groupBy(lines, (l) => l.shop.id),
    selected = lines.filter((l) => l.selected),
    subtotal = selected.reduce((n, l) => n + l.variant.price * l.quantity, 0);
  return (
    title("Giỏ hàng của bạn", `${lines.length} món đồ đang chờ được mang về`) +
    (lines.length
      ? `<div class="cart-layout"><div class="stack">${Object.values(groups)
          .map(
            (group) =>
              `<section class="cart-shop"><h3>${icon("store", 16)} ${esc(group[0].shop.name)}</h3>${group.map((l) => `<div class="cart-line"><input type="checkbox" class="cart-select" data-id="${esc(l.variant_id)}" ${l.selected ? "checked" : ""} aria-label="Chọn ${esc(l.product.name)}"><a href="/product/${esc(l.product.id)}"><img src="${image(l.product.image)}" alt="${esc(l.product.name)}"></a><div><h4><a href="/product/${esc(l.product.id)}">${esc(l.product.name)}</a></h4><small>${esc(l.variant.name)} · Kho: ${l.variant.stock}</small><div class="quantity"><button data-action="cart-qty" data-id="${esc(l.variant_id)}" data-value="-1" aria-label="Giảm số lượng">−</button><input value="${l.quantity}" class="cart-qty-input" data-id="${esc(l.variant_id)}" type="number" min="1" max="99" aria-label="Số lượng"><button data-action="cart-qty" data-id="${esc(l.variant_id)}" data-value="1" aria-label="Tăng số lượng">+</button></div></div><strong class="price">${money(l.variant.price * l.quantity)}</strong><button class="icon-btn remove-cart" data-action="remove-cart" data-id="${esc(l.variant_id)}" aria-label="Xóa sản phẩm">${icon("trash", 16)}</button></div>`).join("")}</section>`,
          )
          .join(
            "",
          )}<a class="small-text muted" href="/search">← Tiếp tục khám phá</a></div><aside class="panel summary"><h3>Món đồ bạn đã chọn</h3><div class="summary-line"><span>Tạm tính (${selected.length} sản phẩm)</span><span>${money(subtotal)}</span></div><div class="summary-line"><span>Phí vận chuyển & ưu đãi</span><span>Ở bước tiếp theo</span></div><div class="summary-total"><span>Tạm tính</span><strong>${money(subtotal)}</strong></div><a href="/checkout" class="btn ${!selected.length ? "disabled" : ""}">Tiến hành đặt hàng ${icon("arrow", 16)}</a><p class="security-note">${icon("shield", 12)} Thông tin của bạn được bảo vệ</p></aside></div>`
      : empty(
          "Giỏ hàng đang chờ bạn",
          "Thêm một món đồ yêu thích để bắt đầu nhé.",
        ))
  );
}
async function checkoutPage() {
  if (!requireUser()) return "";
  const version = state.route;
  const cart = await readSettledCart({
    pending: () => state.cartWritePending,
    revision: () => state.cartRevision || 0,
    load: () => cartBootstrap.take(bootstrapKey()) || api("/checkout/context"),
    current: () => version === state.route,
  });
  if (!cart || version !== state.route) return "";
  const { lines, addresses, meta } = cart;
  acceptCart(cart);
  state.meta = meta;
  state.metaUntil = Date.now() + 30000;
  state.metaPromise = Promise.resolve(meta);
  const selected = lines.filter((l) => l.selected);
  if (!selected.length)
    return (
      title("Thanh toán") +
      empty(
        "Chưa chọn sản phẩm",
        "Quay lại giỏ hàng và chọn món bạn muốn mua.",
        "/cart",
        "Về giỏ hàng",
      )
    );
  if (!addresses.length)
    return (
      title("Thanh toán") +
      empty(
        "Bạn chưa có địa chỉ nhận hàng",
        "Thêm địa chỉ trước khi tiếp tục.",
        "/account",
        "Thêm địa chỉ",
      )
    );
  state.checkoutKey ||= crypto.randomUUID();
  state.quote = null;
  const groups = Object.groupBy(selected, (l) => l.shop.id);
  return (
    title(
      "Hoàn tất đơn hàng",
      "Chỉ còn một bước nữa để những món đồ yêu thích đến tay bạn.",
    ) +
    `<form data-form="checkout" id="checkout-form"><div class="checkout-layout"><div class="stack"><section class="panel"><h3>${icon("pin", 19)} Địa chỉ nhận hàng</h3><label class="field"><select name="address_id" id="checkout-address" aria-label="Địa chỉ nhận hàng" required>${addresses.map((a) => `<option value="${esc(a.id)}" ${a.is_default ? "selected" : ""}>${esc(a.name)} · ${esc(a.phone)} — ${esc(a.street)}, ${esc(a.city)}</option>`).join("")}</select></label><a class="small-text muted" href="/account">Quản lý địa chỉ →</a></section>${Object.values(
      groups,
    )
      .map(
        (group) =>
          `<section class="cart-shop"><h3>${icon("store", 16)} ${esc(group[0].shop.name)}</h3>${group.map((l) => `<div class="order-line" style="display:flex;padding:16px 20px;gap:15px;align-items:center"><img style="width:55px;height:55px;border-radius:5px" src="${image(l.product.image)}" alt="${esc(l.product.name)}"><div><h4 style="font-size:12px">${esc(l.product.name)}</h4><p>${esc(l.variant.name)} × ${l.quantity}</p></div><span class="line-price">${money(l.variant.price * l.quantity)}</span></div>`).join("")}<div style="padding:0 20px 12px">${field("Voucher của shop", "shop_voucher_" + group[0].shop.id, "", "text", 'maxlength="30" placeholder="Nhập mã nếu có"')}</div></section>`,
      )
      .join(
        "",
      )}<section class="panel"><h3>Phương thức thanh toán</h3><label class="payment-option"><input type="radio" name="method" value="cod" checked><div><strong>Thanh toán khi nhận hàng (COD)</strong><p>Kiểm tra thông tin và thanh toán khi nhận hàng.</p></div></label><label class="payment-option"><input type="radio" name="method" value="payos" ${state.meta.payment_configured ? "" : "disabled"}><div><strong>Chuyển khoản qua payOS</strong><p>${state.meta.payment_configured ? "Quét VietQR, tự động xác nhận giao dịch." : "Chưa cấu hình kênh thanh toán. Hiện có thể dùng COD."}</p></div></label></section></div><aside class="panel summary"><h3>Thông tin thanh toán</h3>${field("Voucher toàn sàn", "voucher", "", "text", 'maxlength="30" placeholder="Ví dụ: CHAO10"')}<button type="button" class="btn outline small full" data-action="quote">Áp dụng & tính lại đơn</button><div id="checkout-summary"><p class="muted small-text" style="padding:20px 0">Đang tính tổng tiền từ hệ thống…</p></div><div class="form-error" hidden></div><button class="btn full" id="place-order" disabled>Đặt hàng ${icon("arrow", 16)}</button><p class="security-note">Đơn hàng được tách theo từng shop.</p></aside></div></form>`
  );
}
async function quoteCheckout() {
  const form = $("#checkout-form");
  if (!form) return;
  const route = state.route,
    revision = (state.quoteRevision || 0) + 1;
  state.quoteRevision = revision;
  state.quoteController?.abort();
  const controller = new AbortController();
  state.quoteController = controller;
  state.quote = null;
  $("#place-order").disabled = true;
  const payload = checkoutPayload(form);
  payload.idempotency_key = "quote-" + crypto.randomUUID();
  try {
    const quote = await api("/checkout/quote", {
      method: "POST",
      body: payload,
      signal: controller.signal,
    });
    if (
      route !== state.route ||
      revision !== state.quoteRevision ||
      !form.isConnected
    )
      return;
    state.quote = quote;
    const sub = quote.orders.reduce((n, o) => n + o.subtotal, 0),
      ship = quote.orders.reduce((n, o) => n + o.shipping, 0),
      discount = quote.orders.reduce((n, o) => n + o.discount, 0);
    $("#checkout-summary").innerHTML =
      `<div class="summary-line"><span>Tiền hàng</span><span>${money(sub)}</span></div><div class="summary-line"><span>Vận chuyển (${quote.orders.length} shop)</span><span>${money(ship)}</span></div><div class="summary-line"><span>Ưu đãi</span><span>−${money(discount)}</span></div><div class="summary-total"><span>Tổng thanh toán</span><strong>${money(quote.checkout.total)}</strong></div>`;
    $("#place-order").disabled = false;
  } catch (e) {
    if (
      route !== state.route ||
      revision !== state.quoteRevision ||
      e.name === "AbortError"
    )
      return;
    state.quote = null;
    if ($("#checkout-summary"))
      $("#checkout-summary").innerHTML =
        `<div class="form-error">${esc(e.message)}</div>`;
  }
}
function checkoutPayload(form) {
  const data = Object.fromEntries(new FormData(form));
  const shop_vouchers = {};
  for (const [k, v] of Object.entries(data))
    if (k.startsWith("shop_voucher_") && v.trim())
      shop_vouchers[k.slice(13)] = v.trim();
  return {
    address_id: data.address_id,
    method: data.method,
    voucher: data.voucher.trim(),
    shop_vouchers,
    idempotency_key: state.checkoutKey,
    ...(state.quote?.quote_token
      ? { quote_token: state.quote.quote_token }
      : {}),
  };
}

function orderCard(o, workspace = "") {
  return `<article class="order-card"><div class="order-head"><a href="/shop/${esc(o.shop_id)}"><strong>${icon("store", 14)} ${esc(o.shop_name)}</strong></a><span class="muted">#${short(o.id)} · ${date(o.created_at)}</span><div>${badge(o.status)} ${badge(o.payment_status)}</div></div>${o.items.map((l) => `<div class="order-line"><img src="${image(l.image)}" alt="${esc(l.name)}"><div><h4>${esc(l.name)}</h4><p>${esc(l.variant_name)} × ${l.quantity}</p></div><span class="line-price">${money(l.unit_price * l.quantity - l.discount)}</span></div>`).join("")}<div class="order-foot"><span class="small-text muted">Tổng thanh toán: <strong class="price">${money(o.total)}</strong></span><div class="row flex-wrap"><a class="btn outline small" href="${workspace ? "/" + workspace : ""}/orders/${esc(o.id)}">Chi tiết đơn ${icon("arrow", 13)}</a>${!workspace && ["delivered", "completed"].includes(o.status) ? `<button class="btn secondary small" data-action="reorder" data-id="${esc(o.id)}">Mua lại</button>` : ""}${!workspace && o.payment_status === "pending" ? `<a class="btn small" href="/payment/${esc(o.checkout_id)}">Thanh toán</a>` : ""}</div></div></article>`;
}
async function ordersPage(scope = "") {
  if (!requireUser()) return "";
  const page = await api(
    (scope ? "/" + scope : "") +
      "/orders?" +
      new URLSearchParams(location.search),
  );
  const { orders } = page;
  state.orders = orders.sort((a, b) => b.created_at - a.created_at);
  const current = new URLSearchParams(location.search).get("status") || "";
  return (
    title(
      scope ? "Quản lý đơn hàng" : "Đơn mua của tôi",
      "Theo dõi từng bước hành trình của đơn hàng.",
    ) +
    `<div class="filters">${[
      ["", "Tất cả"],
      ["new", "Chờ xác nhận"],
      ["preparing", "Chuẩn bị"],
      ["shipping", "Đang giao"],
      ["delivered", "Đã giao"],
      ["completed", "Hoàn tất"],
      ["cancelled", "Đã hủy"],
    ]
      .map(
        ([v, t]) =>
          `<a class="chip ${v === current ? "active" : ""}" href="${scope ? "/" + scope : ""}/orders${v ? "?status=" + v : ""}">${t}</a>`,
      )
      .join("")}</div><div class="stack">${
      orders
        .filter((o) => !current || o.status === current)
        .map((o) => orderCard(o, scope))
        .join("") ||
      empty("Chưa có đơn hàng", "Đơn hàng của bạn sẽ xuất hiện tại đây.")
    }</div>` +
    pagination(page)
  );
}
async function orderDetail(id, scope = "") {
  if (!requireUser()) return "";
  const { order: o } = await api("/orders/" + id);
  state.order = o;
  const isAdmin = state.user.role === "admin",
    buyer = o.buyer_id === state.user.id,
    seller = state.shop?.id === o.shop_id;
  const actions = [];
  if (
    (buyer || isAdmin) &&
    ["new", "confirmed", "preparing"].includes(o.status)
  )
    actions.push(statusButton(o.id, "cancelled", "Hủy đơn", "danger"));
  if ((seller || isAdmin) && o.status === "new")
    actions.push(statusButton(o.id, "confirmed", "Xác nhận đơn"));
  if ((seller || isAdmin) && o.status === "confirmed")
    actions.push(statusButton(o.id, "preparing", "Chuẩn bị hàng"));
  if (isAdmin && ["preparing", "delivery_failed"].includes(o.status))
    actions.push(statusButton(o.id, "shipping", "Bàn giao vận chuyển"));
  if (isAdmin && o.status === "shipping")
    actions.push(
      statusButton(o.id, "delivered", "Đã giao thành công"),
      statusButton(o.id, "delivery_failed", "Giao thất bại", "outline"),
    );
  if ((buyer || isAdmin) && o.status === "delivered")
    actions.push(statusButton(o.id, "completed", "Xác nhận đã nhận hàng"));
  if (
    isAdmin &&
    o.payment_method === "cod" &&
    o.cod_status !== "paid" &&
    ["delivered", "completed"].includes(o.status)
  )
    actions.push(
      `<button class="btn" data-action="collect-cod" data-id="${esc(id)}">Ghi nhận đã thu COD</button>`,
    );
  if (
    buyer &&
    ["delivered", "completed"].includes(o.status) &&
    !o.return_request
  )
    actions.push(
      `<button class="btn outline" data-action="return-order">Yêu cầu trả hàng</button>`,
    );
  const steps = [
      "new",
      "confirmed",
      "preparing",
      "shipping",
      "delivered",
      "completed",
    ],
    at = steps.indexOf(o.status),
    refunded = o.refunds.reduce((n, r) => n + r.amount, 0);
  return `<div class="breadcrumbs"><a href="${scope ? "/" + scope : ""}/orders">Đơn hàng</a> / #${short(id)}</div>${title("Đơn hàng #" + short(id), date(o.created_at))}<div class="panel"><div class="row between flex-wrap"><div>${badge(o.status)} ${badge(o.payment_status)}</div><span class="small-text muted">${o.payment_method === "payos" ? "Chuyển khoản payOS" : "Thanh toán khi nhận hàng"}</span></div><div class="timeline">${steps.map((s, i) => `<div class="timeline-step ${i <= at ? "done" : ""}"><i>${i < at ? icon("check", 13) : i + 1}</i>${labels[s]}</div>`).join("")}</div><div class="row flex-wrap">${actions.join("")}</div>${o.payment_status === "pending" && buyer ? `<div class="notice">Đơn online cần thanh toán trước khi shop xử lý. <a href="/payment/${esc(o.checkout_id)}">Đến trang thanh toán →</a></div>` : ""}</div><div class="grid-2" style="margin-top:20px"><section class="panel"><h3>Địa chỉ nhận hàng</h3><strong class="small-text">${esc(o.address.name)} · ${esc(o.address.phone)}</strong><p class="small-text muted" style="margin-top:8px">${esc(o.address.street)}, ${esc(o.address.city)} · ${esc(o.address.region)}</p></section><section class="panel"><h3>Chi tiết thanh toán</h3><div class="summary-line"><span>Tiền hàng</span><span>${money(o.subtotal)}</span></div><div class="summary-line"><span>Giảm giá</span><span>−${money(o.discount)}</span></div><div class="summary-line"><span>Vận chuyển</span><span>${money(o.shipping)}</span></div><div class="summary-total"><span>Tổng</span><strong>${money(o.total)}</strong></div></section></div><section class="panel" style="margin-top:20px"><h3>Sản phẩm đã đặt</h3>${o.items.map((l) => `<div class="order-line" style="display:flex;padding:16px 0;gap:16px"><img src="${image(l.image)}" alt="${esc(l.name)}"><div><h4><a href="/product/${esc(l.product_id)}">${esc(l.name)}</a></h4><p>${esc(l.variant_name)} × ${l.quantity}</p></div><div style="margin-left:auto;text-align:right"><strong class="small-text">${money(l.unit_price * l.quantity - l.discount)}</strong>${buyer && ["delivered", "completed"].includes(o.status) ? `<p><button class="btn link small" data-action="review" data-id="${esc(l.id)}">Viết / sửa đánh giá</button></p>` : ""}</div></div>`).join("")}</section>${o.return_request ? `<section class="panel" style="margin-top:20px"><h3>Yêu cầu trả hàng ${badge(o.return_request.status)}</h3><p class="small-text muted">${esc(o.return_request.reason)}</p><p style="margin-top:10px" class="small-text">Giá trị yêu cầu: ${money(o.return_request.amount)}</p><div class="row" style="margin-top:15px">${(seller || isAdmin) && o.return_request.status === "requested" ? `<button class="btn small" data-action="return-status" data-id="${esc(o.return_request.id)}" data-value="approved">Duyệt trả hàng</button><button class="btn outline small" data-action="return-status" data-id="${esc(o.return_request.id)}" data-value="rejected">Từ chối</button>` : ""}${isAdmin && o.return_request.status === "approved" ? `<button class="btn small" data-action="return-status" data-id="${esc(o.return_request.id)}" data-value="received">Đã nhận lại hàng</button>` : ""}</div></section>` : ""}${o.refund_due || o.refunds.length ? `<section class="panel" style="margin-top:20px"><h3>Hoàn tiền thủ công</h3><div class="summary-line"><span>Cần hoàn</span><span>${money(o.refund_due)}</span></div><div class="summary-line"><span>Đã ghi nhận hoàn</span><span>${money(refunded)}</span></div>${o.refunds.map((r) => `<div class="notice success">${money(r.amount)} · ${esc(r.reference)} · ${date(r.created_at)}</div>`).join("")}${isAdmin && o.refund_due > refunded ? `<button class="btn outline small" data-action="refund" data-value="${o.refund_due - refunded}">Ghi nhận đã hoàn tiền</button>` : ""}</section>` : ""}<section class="panel" style="margin-top:20px"><h3>Lịch sử đơn hàng</h3>${o.history.map((h) => `<div class="row between" style="padding:9px 0;border-bottom:1px solid var(--line)"><span class="small-text">${esc(labels[h.status] || h.status)}</span><small class="muted">${date(h.at)}</small></div>`).join("")}</section>`;
}
const statusButton = (id, s, text, style = "") =>
  `<button class="btn ${style}" data-action="order-status" data-id="${esc(id)}" data-value="${s}">${text}</button>`;
async function paymentPage(id) {
  if (!requireUser()) return "";
  const { checkout: g, orders } = await api("/payments/" + id);
  state.payment = g;
  const success = g.status === "paid" || g.method === "cod",
    pending = g.status === "pending";
  return `<section class="panel payment-result"><div class="result-icon">${icon(success ? "check" : pending ? "ticket" : "return", 33)}</div><h1>${success ? (g.method === "cod" ? "Đặt hàng thành công!" : "Thanh toán thành công!") : pending ? "Chỉ còn một bước thanh toán" : g.status === "review" ? "Giao dịch cần được kiểm tra" : "Thanh toán đã đóng"}</h1><p>${success ? "Cảm ơn bạn đã lựa chọn Shoppe. Theo dõi đơn hàng để cập nhật hành trình giao hàng." : pending ? "Mở trang thanh toán payOS, quét mã QR và hoàn tất giao dịch bằng ứng dụng ngân hàng." : g.status === "review" ? "Admin sẽ đối soát giao dịch và liên hệ để xử lý. Đơn đã hủy sẽ không tự khôi phục." : "Đơn hàng đã hết hạn hoặc được hủy. Bạn có thể tạo một đơn hàng mới."}</p>${badge(g.status)}${g.excess_amount ? `<div class="notice">Đã thu: ${money(g.received_amount)}. Thu thừa: ${money(g.excess_amount)}. Đã ghi hoàn phần thừa: ${money(g.excess_refunded_amount || 0)}. ${g.needs_reconciliation ? "Admin đang đối soát khoản thu bổ sung." : "Đã ghi nhận hoàn phần thu thừa."}</div>` : ""}<div class="summary-total" style="margin:25px 0"><span>Tổng thanh toán</span><strong>${money(g.total)}</strong></div>${pending ? `<p class="small-text muted">Hết hạn lúc ${date(g.expires_at)}</p><div class="row" style="justify-content:center;margin:20px 0;flex-wrap:wrap">${g.checkout_url ? `<a class="btn" href="${esc(g.checkout_url)}" target="_blank" rel="noopener noreferrer">Mở trang thanh toán ${icon("arrow", 16)}</a>` : ""}<button class="btn outline" data-action="sync-payment" data-id="${esc(id)}">Kiểm tra thanh toán</button><button class="btn secondary small" data-action="cancel-payment" data-id="${esc(id)}">Hủy giao dịch</button></div>` : ""}${g.method === "payos" && !pending ? `<p><button class="btn outline" data-action="sync-payment" data-id="${esc(id)}">Đối soát lại thanh toán</button></p>` : ""}<a class="btn ${pending ? "secondary" : ""}" href="/orders">Xem đơn mua của tôi ${icon("arrow", 15)}</a><p class="security-note">Kết quả được xác nhận từ phía hệ thống. Quay về trang này không tự đánh dấu đã thanh toán.</p></section><div class="stack" style="max-width:700px;margin:auto">${orders.map((o) => orderCard(o)).join("")}</div>`;
}
async function vouchersPage(scope = "") {
  const query = new URLSearchParams(location.search);
  if (scope) query.set("scope", scope);
  const page = await api("/vouchers?" + query);
  const { vouchers } = page;
  const list =
    scope === "seller"
      ? vouchers.filter((v) => v.shop_id === state.shop?.id)
      : scope === "admin"
        ? vouchers.filter((v) => !v.shop_id)
        : vouchers;
  return (
    title(
      "Ưu đãi dành cho bạn",
      scope
        ? "Tạo và quản lý mã giảm giá."
        : "Chọn một ưu đãi nhỏ, để niềm vui thêm lớn.",
      scope
        ? `<button class="btn" data-action="new-voucher" data-scope="${scope}">${icon("plus", 16)} Tạo voucher</button>`
        : "",
    ) +
    `<div class="grid-3">${list.map((v) => `<article class="panel"><div class="row" style="gap:15px"><div class="category-icon">${icon("ticket", 24)}</div><div><h3 style="margin:0">${v.type === "percent" ? v.value + "%" : money(v.value)} giảm giá</h3><span class="small-text muted">Đơn từ ${money(v.minimum)}</span></div></div><div class="notice"><strong>${esc(v.code)}</strong> · ${v.shop_id ? "Voucher của shop" : "Voucher toàn sàn"}</div><p class="small-text muted">Giảm tối đa ${money(v.max_discount)}<br>Đến ${date(v.ends_at)}</p><div class="row" style="margin-top:18px"><button class="btn outline small" data-action="copy-voucher" data-value="${esc(v.code)}">Sao chép mã</button>${scope ? `<button class="btn danger small" data-action="delete-voucher" data-id="${esc(v.id)}">Ngừng áp dụng</button>` : ""}</div></article>`).join("") || empty("Chưa có voucher", "Các ưu đãi mới sẽ xuất hiện tại đây.")}</div>` +
    pagination(page)
  );
}
function workspace(content, scope) {
  const nav =
    scope === "admin"
      ? [
          ["", "Tổng quan", "chart"],
          ["/shops", "Quản lý shop", "store"],
          ["/products", "Sản phẩm", "box"],
          ["/orders", "Đơn hàng", "bag"],
          ["/users", "Người dùng", "user"],
          ["/payments", "Thanh toán", "shield"],
          ["/reviews", "Đánh giá", "chat"],
          ["/vouchers", "Voucher toàn sàn", "ticket"],
          ["/outbox", "Email", "mail"],
          ["/audit", "Nhật ký", "shield"],
          ["/settings", "Cài đặt", "settings"],
        ]
      : [
          ["", "Tổng quan", "chart"],
          ["/products", "Sản phẩm", "box"],
          ["/orders", "Đơn hàng", "bag"],
          ["/vouchers", "Voucher của shop", "ticket"],
          ["/settings", "Thông tin shop", "settings"],
        ];
  return `<div class="content-with-aside"><aside class="aside"><h3>${scope === "admin" ? "Quản trị Shoppe" : "Kênh người bán"}</h3>${nav.map(([url, text, i]) => `<a href="/${scope}${url}" class="${location.pathname === "/" + scope + url ? "active" : ""}">${icon(i, 17)} ${text}</a>`).join("")}<a href="/chat">${icon("chat", 17)} Tin nhắn</a><a href="/">${icon("home", 17)} Về trang mua sắm</a></aside><div class="workspace">${content}</div></div>`;
}
function listFilters(placeholder, choices = {}) {
  const query = new URLSearchParams(location.search);
  return `<form class="filters" data-form="list-filter"><label class="field"><span>Tìm kiếm</span><input name="q" value="${esc(query.get("q") || "")}" placeholder="${esc(placeholder)}" maxlength="100"></label>${Object.entries(
    choices,
  )
    .map(
      ([name, options]) =>
        `<label class="field"><span>${name === "role" ? "Vai trò" : "Trạng thái"}</span><select name="${name}">${options.map(([value, label]) => `<option value="${value}" ${query.get(name) === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>`,
    )
    .join("")}<button class="btn outline small">Tìm kiếm</button></form>`;
}
async function dashboardPage(scope) {
  const { stats, orders, low_stock, top_products } = await api(
    "/dashboard?scope=" + scope,
  );
  const recent = orders.sort((a, b) => b.created_at - a.created_at).slice(0, 6);
  return (
    title(
      scope === "admin" ? "Góc nhìn toàn sàn" : "Chào " + state.shop.name + "!",
      "Một ngày mới, thêm những cơ hội mới.",
    ) +
    `<div class="stat-grid">${[
      ["Tiền đã thu", money(stats.revenue), "Trước hoàn tiền"],
      ["Đơn hàng", stats.orders, "Tất cả trạng thái"],
      [
        "Tỷ lệ giao thành công",
        stats.delivery_rate.toFixed(1) + "%",
        stats.delivered + " đơn đã giao",
      ],
      ["Đã hoàn tiền", money(stats.refunds), "Theo ghi nhận admin"],
    ]
      .map(
        ([label, val, note]) =>
          `<div class="stat"><small>${label}</small><strong>${val}</strong><span>${note}</span></div>`,
      )
      .join(
        "",
      )}</div><div class="grid-2"><section class="panel"><h3>Hiệu quả giao hàng</h3><div class="summary-line"><span>Giao thành công / tổng đơn</span><span>${stats.delivery_rate.toFixed(1)}%</span></div><div class="progress-bar"><span style="width:${stats.delivery_rate}%"></span></div><div class="summary-line" style="margin-top:20px"><span>Hoàn hàng / đơn đã giao</span><span>${stats.return_rate.toFixed(1)}%</span></div><div class="progress-bar"><span style="width:${stats.return_rate}%;background:#d1af92"></span></div><p class="small-text muted" style="margin-top:20px">Tiền hàng còn lại sau hoàn: ${money(stats.net_revenue)}</p></section><section class="panel"><h3>Sản phẩm sắp hết hàng</h3>${
      low_stock
        .slice(0, 5)
        .map(
          (v) =>
            `<div class="row between" style="padding:8px 0"><span class="small-text">${esc(v.product_name)}<small class="muted"> · ${esc(v.name)}</small></span><span class="badge red">${v.stock} còn lại</span></div>`,
        )
        .join("") ||
      '<p class="small-text muted">Tồn kho đang ở mức ổn định.</p>'
    }</section></div><section class="panel" style="margin-top:20px"><h3>Sản phẩm bán chạy</h3>${
      top_products
        .slice(0, 5)
        .map(
          (p, i) =>
            `<div class="row between" style="padding:8px 0"><span class="small-text">${i + 1}. ${esc(p.name)}</span><span class="badge green">${p.quantity} sản phẩm</span></div>`,
        )
        .join("") ||
      '<p class="small-text muted">Chưa có sản phẩm đã giao. Số lượng trả hàng được trừ khỏi thống kê.</p>'
    }</section><div class="section-head"><h2 style="font-size:18px">Đơn hàng gần đây</h2><a href="/${scope}/orders">Xem tất cả ${icon("arrow", 14)}</a></div>${ordersTable(recent, scope)}`
  );
}
const table = (headers, rows) =>
  `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}" style="text-align:center;padding:35px;color:var(--muted)">Chưa có dữ liệu</td></tr>`}</tbody></table></div>`;
function ordersTable(orders, scope) {
  return table(
    ["Đơn hàng", "Shop", "Tổng tiền", "Trạng thái", ""],
    orders.map(
      (o) =>
        `<tr><td>#${short(o.id)}<small class="muted" style="display:block">${date(o.created_at)}</small></td><td>${esc(o.shop_name)}</td><td>${money(o.total)}</td><td>${badge(o.status)}</td><td><a class="btn outline small" href="/${scope}/orders/${esc(o.id)}">Chi tiết</a></td></tr>`,
    ),
  );
}
async function managementProducts(scope) {
  const query = new URLSearchParams(location.search);
  if (scope === "admin") query.set("include", "editor");
  const page = await api("/" + scope + "/products?" + query);
  const catalog = page.catalog;
  const { products } = page;
  state.managementProducts = products;
  state.managementScope = scope;
  if (scope === "admin") state.managementShops = page.shops;
  return (
    title(
      "Sản phẩm",
      `${page.total} sản phẩm trong ${scope === "admin" ? "toàn sàn" : "shop của bạn"}`,
      '<button class="btn" data-action="edit-product">' +
        icon("plus", 16) +
        " Thêm sản phẩm</button>",
    ) +
    `<div class="filters"><a class="btn secondary small" href="/api/${scope}/export?kind=products" download>Xuất CSV</a>${scope === "seller" ? '<button class="btn secondary small" data-action="import-products">Nhập CSV</button>' : '<button class="btn secondary small" data-action="catalog-api">Lấy sản phẩm demo từ API</button><button class="btn outline small" data-action="load-demo-catalog">Dùng demo đóng gói</button>'}</div>` +
    (catalog
      ? `<p class="small-text muted">Nguồn demo: DummyJSON và mẫu mô phỏng Shoppe · Thanh toán: payOS/COD. ${catalog.last_sync ? "Đã nhập: " + catalog.last_sync.imported + " sản phẩm mới trong lần gần nhất." : "Chưa nhập qua API trực tiếp."}</p>`
      : "") +
    table(
      ["Sản phẩm", "Giá từ", "Tồn kho", "Trạng thái", "Thao tác"],
      products.map(
        (p) =>
          `<tr><td><div class="table-image"><img src="${image(p.image)}" alt="" loading="lazy" decoding="async" width="48" height="48"><div><strong>${esc(p.name)}</strong><small class="muted" style="display:block">${esc(p.category)}</small></div></div></td><td>${money(Math.min(...p.variants.filter((v) => v.active).map((v) => v.price)))}</td><td>${p.variants.filter((v) => v.active).reduce((n, v) => n + v.stock, 0)}</td><td>${p.active ? '<span class="badge green">Đang bán</span>' : '<span class="badge gray">Đã ẩn</span>'}</td><td>${scope === "seller" ? `<button class="btn outline small" data-action="edit-product" data-id="${esc(p.id)}">Chỉnh sửa</button>` : `<button class="btn outline small" data-action="edit-product" data-id="${esc(p.id)}">Chỉnh sửa</button> <button class="btn outline small" data-action="moderate-product" data-id="${esc(p.id)}" data-value="${!p.active}">${p.active ? "Ẩn sản phẩm" : "Hiện sản phẩm"}</button>`}</td></tr>`,
      ),
    ) +
    pagination(page)
  );
}
async function workspacePage(scope, parts) {
  if (!requireUser()) return "";
  if (scope === "admin" && state.user.role !== "admin")
    return empty(
      "Bạn không có quyền quản trị",
      "Tài khoản này không có quyền truy cập trang admin.",
    );
  if (scope === "seller" && !state.shop)
    return (
      title(
        "Mở shop cùng Shoppe",
        "Bắt đầu hành trình kinh doanh của riêng bạn.",
      ) +
      `<div class="grid-2"><div class="panel"><h3>Mang điều bạn yêu đến mọi người.</h3><p class="description">Quản lý sản phẩm, đón đơn hàng và kết nối trực tiếp với người mua, tất cả trong một không gian dành riêng cho shop.</p><div class="notice">Shop sẽ được admin duyệt trước khi đăng bán.</div></div><form class="panel" data-form="apply-shop">${field("Tên shop", "name", "", "text", 'required maxlength="120"')}${textarea("Giới thiệu shop", "description", "", 'required maxlength="2000"')}${regionField()}<div class="form-error" hidden></div><button class="btn full">Đăng ký mở shop ${icon("arrow", 16)}</button></form></div>`
    );
  if (scope === "seller" && state.shop.status !== "approved")
    return workspace(
      title("Thông tin đăng ký shop") +
        `<div class="panel"><h3>${esc(state.shop.name)} ${badge(state.shop.status)}</h3><p class="muted">${state.shop.status === "pending" ? "Đăng ký của bạn đang chờ admin xét duyệt." : "Shop hiện chưa được phép bán hàng. Liên hệ quản trị viên để được hỗ trợ."}</p></div>`,
      scope,
    );
  let content;
  const tab = parts[1] || "";
  if (!tab) content = await dashboardPage(scope);
  else if (tab === "products") content = await managementProducts(scope);
  else if (tab === "orders")
    content = parts[2]
      ? await orderDetail(parts[2], scope)
      : await ordersPage(scope);
  else if (tab === "vouchers") content = await vouchersPage(scope);
  else if (tab === "settings" && scope === "seller")
    content =
      title("Thông tin shop") +
      `<form class="panel" data-form="shop-settings">${field("Tên shop", "name", state.shop.name, "text", "required")}${textarea("Giới thiệu", "description", state.shop.description, "required")}${regionField(state.shop.region)}<button class="btn">Lưu thay đổi</button></form>`;
  else if (scope === "admin") content = await adminTab(tab);
  else content = empty("Không tìm thấy trang", "Trang bạn tìm chưa tồn tại.");
  return workspace(content, scope);
}
async function adminTab(tab) {
  if (tab === "audit") {
    const page = await api(
      "/admin/audit?" + new URLSearchParams(location.search),
    );
    const { audit } = page;
    return (
      title("Nhật ký quản trị") +
      table(
        ["Thao tác", "Đối tượng", "Người thực hiện", "Thời gian"],
        audit
          .sort((a, b) => b.created_at - a.created_at)
          .map(
            (a) =>
              `<tr><td>${esc(a.action)}</td><td>${esc(short(a.target))}</td><td>${esc(short(a.actor_id))}</td><td>${date(a.created_at)}</td></tr>`,
          ),
      ) +
      pagination(page)
    );
  }
  if (tab === "reviews") {
    const page = await api(
      "/admin/reviews?" + new URLSearchParams(location.search),
    );
    const { reviews } = page;
    return (
      title("Kiểm duyệt đánh giá") +
      table(
        ["Người mua", "Đánh giá", "Nội dung", "Trạng thái", ""],
        reviews.map(
          (r) =>
            `<tr><td>${esc(r.name)}</td><td>${"★".repeat(r.rating)}</td><td style="white-space:normal;max-width:350px">${esc(r.comment)}</td><td>${r.hidden ? "Đã ẩn" : "Hiển thị"}</td><td><button class="btn outline small" data-action="moderate-review" data-id="${esc(r.id)}" data-value="${!r.hidden}">${r.hidden ? "Hiện đánh giá" : "Ẩn đánh giá"}</button></td></tr>`,
        ),
      ) +
      pagination(page)
    );
  }
  if (tab === "shops") {
    const page = await api(
      "/admin/shops?" + new URLSearchParams(location.search),
    );
    const { shops } = page;
    return (
      title("Quản lý shop", "Xét duyệt đăng ký và trạng thái hoạt động.") +
      listFilters("Tên shop", {
        status: [
          ["", "Tất cả trạng thái"],
          ["pending", "Chờ duyệt"],
          ["approved", "Đang hoạt động"],
          ["suspended", "Tạm khóa"],
          ["rejected", "Đã từ chối"],
        ],
      }) +
      table(
        ["Shop", "Giới thiệu", "Trạng thái", "Thao tác"],
        shops.map(
          (s) =>
            `<tr><td><strong>${esc(s.name)}</strong><small class="muted" style="display:block">${esc(s.region)}</small></td><td style="white-space:normal;max-width:280px">${esc(s.description)}</td><td>${badge(s.status)}</td><td><div class="row">${s.status !== "approved" ? `<button class="btn small" data-action="shop-status" data-id="${esc(s.id)}" data-value="approved">Duyệt</button>` : `<button class="btn outline small" data-action="shop-status" data-id="${esc(s.id)}" data-value="suspended">Tạm khóa</button>`}${s.status === "pending" ? `<button class="btn danger small" data-action="shop-status" data-id="${esc(s.id)}" data-value="rejected">Từ chối</button>` : ""}</div></td></tr>`,
        ),
      ) +
      pagination(page)
    );
  }
  if (tab === "users") {
    const page = await api(
      "/admin/users?" + new URLSearchParams(location.search),
    );
    const { users } = page;
    return (
      title("Quản lý người dùng") +
      listFilters("Tên hoặc email", {
        role: [
          ["", "Tất cả vai trò"],
          ["buyer", "Người dùng"],
          ["admin", "Quản trị"],
        ],
        active: [
          ["", "Tất cả trạng thái"],
          ["true", "Đang hoạt động"],
          ["false", "Đã khóa"],
        ],
      }) +
      table(
        ["Tài khoản", "Vai trò", "Email", "Trạng thái", "Thao tác"],
        users.map(
          (u) =>
            `<tr><td><strong>${esc(u.name)}</strong></td><td>${u.role === "admin" ? "Admin" : "Người dùng"}</td><td>${esc(u.email)}</td><td>${u.active ? '<span class="badge green">Hoạt động</span>' : '<span class="badge red">Đã khóa</span>'}</td><td>${u.id !== state.user.id ? `<button class="btn secondary small" data-action="user-role" data-id="${esc(u.id)}" data-value="${u.role === "admin" ? "buyer" : "admin"}">${u.role === "admin" ? "Gỡ quyền admin" : "Cấp quyền admin"}</button> <button class="btn outline small" data-action="user-active" data-id="${esc(u.id)}" data-value="${!u.active}">${u.active ? "Khóa tài khoản" : "Mở khóa"}</button>` : '<small class="muted">Bạn</small>'}</td></tr>`,
        ),
      ) +
      pagination(page)
    );
  }
  if (tab === "payments") {
    const page = await api(
      "/admin/payments?" + new URLSearchParams(location.search),
    );
    const { checkouts } = page;
    state.checkouts = checkouts;
    return (
      title(
        "Thanh toán & đối soát",
        "Theo dõi thanh toán theo từng lượt mua nhiều shop.",
      ) +
      table(
        [
          "Mã thanh toán",
          "Tổng tiền",
          "Phương thức",
          "Trạng thái",
          "Thời gian",
          "",
        ],
        checkouts
          .sort((a, b) => b.created_at - a.created_at)
          .map(
            (c) =>
              `<tr><td>${c.order_code}</td><td>${money(c.total)}</td><td>${c.method === "payos" ? "payOS" : "COD"}</td><td>${badge(c.status)}</td><td>${date(c.created_at)}</td><td><a class="btn outline small" href="/payment/${esc(c.id)}">Xem</a>${c.status === "review" || c.needs_reconciliation ? `<button class="btn danger small" data-action="review-payment" data-id="${esc(c.id)}">Ghi hoàn tiền</button>` : ""}</td></tr>`,
          ),
      ) +
      pagination(page)
    );
  }
  if (tab === "outbox") {
    const page = await api(
      "/admin/outbox?" + new URLSearchParams(location.search),
    );
    const { outbox } = page;
    return (
      title(
        "Email hệ thống",
        state.meta.email_configured
          ? "Nhật ký gửi và trạng thái email."
          : "Chưa cấu hình dịch vụ email; thư được giữ trong hàng đợi.",
        '<button class="btn outline" data-action="retry-email">Thử gửi lại</button>',
      ) +
      table(
        ["Tiêu đề", "Trạng thái", "Số lần thử", "Tạo lúc"],
        outbox
          .sort((a, b) => b.created_at - a.created_at)
          .map(
            (m) =>
              `<tr><td>${esc(m.subject)}</td><td>${badge(m.status)}${m.delivery_uncertain ? `<p class="small-text">Chưa xác định kết quả lần gửi cuối.</p><button class="btn outline small" data-action="review-mail" data-id="${esc(m.id)}">Kiểm tra & gửi lại</button>` : ""}</td><td>${m.attempts}</td><td>${date(m.created_at)}</td></tr>`,
          ),
      ) +
      pagination(page)
    );
  }
  if (tab === "settings") {
    const { settings: s } = await api("/admin/settings");
    return (
      title("Cài đặt toàn sàn") +
      `<form class="panel" data-form="admin-settings">${field("Tiêu đề banner", "banner_title", s?.banner_title || "Một chút mới. Thêm nhiều vui.", "text", 'required maxlength="150"')}${field("Nội dung banner", "banner_subtitle", s?.banner_subtitle || "Khám phá những món đồ bạn yêu, từ những shop bạn tin.", "text", 'required maxlength="300"')}${textarea("Danh mục (mỗi dòng một danh mục)", "categories", (state.meta.categories || []).join("\n"), "required")}${field("Phí nội vùng (VNĐ / 1kg đầu)", "shipping_local", s?.shipping_local ?? 20000, "number", 'min="0" max="500000" required')}${field("Phí khác vùng (VNĐ / 1kg đầu)", "shipping_remote", s?.shipping_remote ?? 35000, "number", 'min="0" max="500000" required')}${field("Phụ thu mỗi 500g tiếp theo (VNĐ)", "shipping_step", s?.shipping_step ?? 5000, "number", 'min="0" max="100000" required')}<button class="btn">Lưu cài đặt</button></form>`
    );
  }
  return empty("Không tìm thấy trang", "Chọn một mục trong thanh quản trị.");
}
const messageMarkup = (m) =>
  '<div class="bubble ' +
  (m.sender_id === state.user.id ? "mine" : "") +
  '" data-message-id="' +
  esc(m.id) +
  '">' +
  esc(m.text) +
  "<small>" +
  date(m.created_at) +
  "</small></div>";
function messageQuery(direction, message) {
  if (direction === "after")
    return new URLSearchParams({
      after_sequence: message?.sequence || 0,
    }).toString();
  return message
    ? new URLSearchParams({
        [direction + "_time"]: message.created_at,
        [direction + "_id"]: message.id,
        [direction + "_sequence"]: message.sequence || 0,
      }).toString()
    : "";
}
async function chatPage(id = "") {
  if (!requireUser()) return "";
  const page = await api(
    "/conversations?" + new URLSearchParams(location.search),
  );
  const { conversations } = page;
  conversations.sort((a, b) => b.updated_at - a.updated_at);
  const cid = id || conversations[0]?.id;
  let room = "";
  if (cid) {
    const { messages, conversation, has_more } = await api(
      "/conversations/" + cid + "/messages",
    );
    state.messages = messages;
    room = `<h3>${esc(conversation.buyer_id === state.user.id ? conversation.shop_name : conversation.buyer_name)}</h3>${has_more ? '<button class="btn outline small" data-action="older-messages">Tin nhắn trước đó</button>' : ""}<div class="messages" id="messages">${
      messages.map(messageMarkup).join("") ||
      '<p class="small-text muted">Bắt đầu cuộc trò chuyện bằng một lời chào nhé.</p>'
    }</div><form class="chat-send" data-form="message" data-id="${esc(cid)}"><input name="text" placeholder="Nhập tin nhắn…" aria-label="Nội dung tin nhắn" required maxlength="2000" autocomplete="off"><button class="btn" aria-label="Gửi tin nhắn">${icon("arrow", 18)}</button></form>`;
  }
  state.conversationId = cid;
  return (
    title(
      "Một lời chào, thêm kết nối",
      "Trò chuyện trực tiếp với shop của bạn.",
    ) +
    `<div class="chat-layout"><aside class="chat-list"><h3>Tin nhắn</h3>${conversations.map((c) => `<a href="/chat/${esc(c.id)}" class="conversation ${c.id === cid ? "active" : ""}"><strong>${esc(c.buyer_id === state.user.id ? c.shop_name : c.buyer_name)}</strong><p>${esc(c.last_message || "Cuộc trò chuyện mới")}</p></a>`).join("") || '<p class="small-text muted" style="padding:20px">Mở sản phẩm và chọn nhắn tin để bắt đầu.</p>'}${pagination(page)}</aside><section class="chat-room">${room || '<div class="loading">Chọn cuộc trò chuyện để xem tin nhắn.</div>'}</section></div>`
  );
}
async function notificationsPage() {
  if (!requireUser()) return "";
  const page = await api(
    "/notifications?" + new URLSearchParams(location.search),
  );
  const { notifications } = page;
  return (
    title(
      "Thông báo của bạn",
      "Mọi cập nhật được giữ lại ở đây.",
      '<button class="btn outline small" data-action="read-notifications">Đánh dấu đã đọc</button>',
    ) +
    `<div class="stack">${
      notifications
        .sort((a, b) => b.created_at - a.created_at)
        .map(
          (n) =>
            `<a href="${esc(n.link)}" class="notification ${n.read ? "" : "unread"}"><div class="row between"><h4>${esc(n.title)}</h4><small class="muted">${date(n.created_at)}</small></div><p>${esc(n.message)}</p></a>`,
        )
        .join("") ||
      empty("Chưa có thông báo", "Những cập nhật mới sẽ xuất hiện tại đây.")
    }</div>` +
    pagination(page)
  );
}

function dialog(title, content) {
  const el = $("#dialog");
  el.innerHTML = `<button class="icon-btn close" data-action="close-dialog" aria-label="Đóng">${icon("close", 20)}</button><h2 id="dialog-title">${esc(title)}</h2>${content}`;
  if (!el.open) el.showModal();
}
function addressDialog() {
  dialog(
    "Địa chỉ mới",
    `<form data-form="address">${field("Người nhận", "name", state.user.name, "text", "required")}${field("Số điện thoại", "phone", "", "tel", 'required minlength="9" maxlength="20"')}${field("Địa chỉ cụ thể", "street", "", "text", 'required maxlength="300"')}${field("Tỉnh / Thành phố", "city", "", "text", "required")}${regionField()}<label class="row small-text" style="margin-bottom:20px"><input type="checkbox" name="is_default"> Đặt làm địa chỉ mặc định</label><div class="form-error" hidden></div><button class="btn full">Lưu địa chỉ</button></form>`,
  );
}
function variantEditor(v = {}) {
  return `<div class="variant-editor" data-id="${esc(v.id || "")}">${field("Tên phân loại", "variant_name", v.name || "", "text", 'required maxlength="100"')}${field("Giá (VNĐ)", "variant_price", v.price || 100000, "number", 'min="1000" max="100000000" required')}${field("Kho khả dụng", "variant_stock", v.stock ?? 10, "number", 'min="0" max="1000000" required')}<button type="button" class="icon-btn" data-action="remove-variant" aria-label="Xóa phân loại">${icon("close", 15)}</button></div>`;
}
function productDialog(id) {
  const p = state.managementProducts.find((p) => p.id === id);
  state.editingProduct = p;
  dialog(
    p ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm",
    `<form data-form="product" data-id="${esc(id || "")}">${field("Tên sản phẩm", "name", p?.name || "", "text", 'required maxlength="200"')}<div class="grid-2"><label class="field"><span>Danh mục</span><select name="category">${state.meta.categories.map((c) => `<option ${p?.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>${field("Khối lượng (gram)", "weight", p?.weight || 300, "number", 'min="1" max="100000" required')}</div>${textarea("Mô tả", "description", p?.description || "", 'required maxlength="10000"')}${field("Đường dẫn ảnh", "image", p?.image || "/assets/product-lifestyle.svg", "text", 'placeholder="https://…"')}<label class="field"><span>Hoặc tải ảnh lên</span><input type="file" id="image-upload" accept="image/jpeg,image/png,image/webp" ${state.meta.storage_configured ? "" : "disabled"}><small>${state.meta.storage_configured ? "PNG, JPEG, WebP · tối đa 2MB" : "Chưa cấu hình kho ảnh. Có thể dùng đường dẫn HTTPS hoặc ảnh minh họa có sẵn."}</small></label><div class="row between"><strong class="small-text">Biến thể sản phẩm</strong><button type="button" class="btn secondary small" data-action="add-variant">${icon("plus", 14)} Thêm</button></div><div id="variants-editor">${(p?.variants.filter((v) => v.active) || [{}]).map(variantEditor).join("")}</div><label class="row small-text" style="margin:20px 0"><input type="checkbox" name="active" ${p?.active !== false ? "checked" : ""}> Hiển thị sản phẩm để bán</label><div class="form-error" hidden></div><button class="btn full">Lưu sản phẩm</button></form>`,
  );
  const form = $("#dialog form");
  form.dataset.scope = state.managementScope || "seller";
  const shops = [...(state.managementShops || [])];
  if (p?.shop && !shops.some((shop) => shop.id === p.shop_id))
    shops.push(p.shop);
  if (form.dataset.scope === "admin")
    form.insertAdjacentHTML(
      "afterbegin",
      `${p ? "" : '<label class="field"><span>Tìm shop đăng bán</span><input name="shop_search" maxlength="100" placeholder="Nhập tên shop"></label><button type="button" class="btn outline small" data-action="find-product-shops">Tìm shop</button>'}<label class="field"><span>Shop đăng bán</span><select name="shop_id" required ${p ? "disabled" : ""}>${shops.map((s) => `<option value="${esc(s.id)}" ${p?.shop_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>`,
    );
}
function voucherDialog(scope) {
  dialog(
    "Tạo voucher",
    `<form data-form="voucher" data-scope="${scope}">${field("Mã voucher", "code", "", "text", 'required minlength="3" maxlength="30" pattern="[A-Za-z0-9_-]+" placeholder="Ví dụ: SHOPMOI"')}<div class="grid-2"><label class="field"><span>Loại giảm giá</span><select name="type"><option value="percent">Theo phần trăm (%)</option><option value="fixed">Số tiền cố định</option></select></label>${field("Mức giảm", "value", 10, "number", 'min="1" required')}</div><div class="grid-2">${field("Giá trị đơn tối thiểu", "minimum", 100000, "number", 'min="0" required')}${field("Giảm tối đa (VNĐ)", "max_discount", 50000, "number", 'min="1" required')}</div><div class="grid-2">${field("Số lượt sử dụng", "limit", 100, "number", 'min="1" required')}${field("Hiệu lực (ngày)", "days", 30, "number", 'min="1" max="365" required')}</div><div class="form-error" hidden></div><button class="btn full">Tạo mã giảm giá</button></form>`,
  );
}
function go(url, replace = false) {
  if ($("#dialog").open) $("#dialog").close();
  history[replace ? "replaceState" : "pushState"]({}, "", url);
  renderRoute();
}
async function renderRoute() {
  const version = ++state.route;
  state.quoteController?.abort();
  state.quoteRevision = (state.quoteRevision || 0) + 1;
  state.quote = null;
  googleSession.detach();
  const hadView = !!$("#content h1");
  document.body.dataset.page = location.pathname.split("/")[1] || "home";
  clearTimeout(state.timer);
  state.requestController?.abort();
  state.requestController = new AbortController();
  if (!$("#content")) shell();
  else {
    refreshHeader();
    if (!$("#route-progress"))
      $("#content").insertAdjacentHTML(
        "beforebegin",
        '<div id="route-progress" class="route-progress" role="status">Đang cập nhật…</div>',
      );
  }
  $("#content").setAttribute("aria-busy", "true");
  // The old view remains visible while loading, but must not accept actions
  // for a route that is no longer current. Header navigation stays available.
  $("#content").inert = true;
  const routeStarted = performance.now();
  const paintReady = hadView ? afterPaint() : Promise.resolve();
  const parts = location.pathname.split("/").filter(Boolean);
  let content = "";
  try {
    const authRoute = [
      "login",
      "register",
      "forgot",
      "reset",
      "verify",
    ].includes(parts[0]);
    if (
      parts.length &&
      !["search", "product", "shop"].includes(parts[0]) &&
      !authRoute
    ) {
      // Configuration is independent of session/route data. Consumers await it only if needed.
      await state.sessionReady;
      if (version !== state.route) return;
      if (
        state.sessionError &&
        !["login", "register", "forgot", "reset", "verify"].includes(parts[0])
      )
        throw state.sessionError;
    }
    if (!parts.length) content = await home();
    else if (parts[0] === "search") content = await searchPage();
    else if (parts[0] === "product") content = await productPage(parts[1]);
    else if (parts[0] === "shop") content = await shopPage(parts[1]);
    else if (
      ["login", "register", "forgot", "reset", "verify"].includes(parts[0])
    )
      content = authPage(parts[0]);
    else if (parts[0] === "account") content = await accountPage();
    else if (parts[0] === "cart") content = await cartPage();
    else if (parts[0] === "checkout") content = await checkoutPage();
    else if (parts[0] === "payment") content = await paymentPage(parts[1]);
    else if (parts[0] === "orders")
      content = parts[1] ? await orderDetail(parts[1]) : await ordersPage();
    else if (parts[0] === "wishlist") {
      if (!requireUser()) return;
      const page = await api(
        "/wishlist?" + new URLSearchParams(location.search),
      );
      const { products } = page;
      content =
        title(
          "Những món đồ bạn yêu",
          "Giữ lại một chút cảm hứng cho lần mua sắm tới.",
        ) +
        (products.length
          ? cards(products)
          : empty(
              "Chưa có sản phẩm yêu thích",
              "Chạm vào trái tim trên sản phẩm để lưu lại.",
            )) +
        pagination(page);
    } else if (parts[0] === "vouchers") content = await vouchersPage();
    else if (["seller", "admin"].includes(parts[0]))
      content = await workspacePage(parts[0], parts);
    else if (parts[0] === "chat") content = await chatPage(parts[1]);
    else if (parts[0] === "notifications") content = await notificationsPage();
    else
      content = empty(
        "Trang này chưa có ở đây",
        "Cùng quay về và khám phá những điều mới nhé.",
      );
    await paintReady;
    if (version !== state.route) return;
    $("#content").innerHTML = content;
    window.scrollTo(0, 0);
    if (["login", "register", "account"].includes(parts[0])) {
      void mountAuthExtras(version, parts[0] === "account");
    }
    document.title = (
      parts[0] === "product" ? state.product?.name : $("h1")?.textContent
    )
      ? `${parts[0] === "product" ? state.product.name : $("h1").textContent} · Shoppe`
      : "Shoppe — Niềm vui mỗi ngày";
    if (parts[0] === "checkout") await quoteCheckout();
    if (parts[0] === "chat" && state.conversationId) {
      $("#messages")?.scrollTo(0, $("#messages").scrollHeight);
      schedulePoll(version, refreshMessages);
    }
    if (parts[0] === "payment" && state.payment?.status === "pending")
      schedulePoll(version, async () => {
        const { checkout } = await api("/payments/" + parts[1]);
        if (version === state.route && checkout.status !== state.payment.status)
          await renderRoute();
      });
  } catch (e) {
    if (version !== state.route || e.name === "AbortError") return;
    if (e.status === 401 && state.user) {
      cartBootstrap.invalidate();
      state.sessionRevision = (state.sessionRevision || 0) + 1;
      state.cartContext = (state.cartContext || 0) + 1;
      state.cartReady = false;
      state.cartWriter = null;
      state.user = null;
      state.csrf = "";
      go("/login");
      return;
    }
    $("#content").innerHTML =
      `<div class="page-title"></div>${empty("Chưa thể mở trang", e.message, "/", "Về trang chủ")}`;
  } finally {
    if (version === state.route) {
      if ($("#content")) $("#content").inert = false;
      $("#content")?.removeAttribute("aria-busy");
      $("#route-progress")?.remove();
      performance.clearMeasures("shoppe:route");
      performance.measure("shoppe:route", {
        start: routeStarted,
        end: performance.now(),
        detail: { path: location.pathname },
      });
      recordRoute(location.pathname, performance.now() - routeStarted);
    }
  }
}
function schedulePoll(version, task, delay = 7000) {
  state.timer = setTimeout(async () => {
    if (version !== state.route) return;
    try {
      if (!document.hidden) await task();
    } catch {
      /* Retry only on the next interval. */
    }
    if (version === state.route) schedulePoll(version, task, delay);
  }, delay);
}
async function refreshMessages() {
  if (document.hidden || !state.conversationId || !$("#messages")) return;
  const cid = state.conversationId,
    version = state.route;
  if (state.messageFetch?.cid === cid) return state.messageFetch.promise;
  const promise = (async () => {
    const { messages, has_more } = await api(
      "/conversations/" +
        cid +
        "/messages?" +
        messageQuery("after", state.messages?.at(-1)),
    );
    if (version !== state.route || cid !== state.conversationId) return;
    const el = $("#messages"),
      bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
    const existing = new Set(state.messages.map((m) => m.id)),
      fresh = messages.filter((m) => !existing.has(m.id));
    if (fresh.length) {
      if (!state.messages.length) el.innerHTML = "";
      el.insertAdjacentHTML("beforeend", fresh.map(messageMarkup).join(""));
      state.messages.push(...fresh);
      if (bottom) el.scrollTop = el.scrollHeight;
    }
    return has_more;
  })();
  const entry = { cid, promise };
  state.messageFetch = entry;
  try {
    return await promise;
  } finally {
    if (state.messageFetch === entry) state.messageFetch = null;
  }
}
async function olderMessages(button) {
  const cid = state.conversationId,
    version = state.route;
  const { messages, has_more } = await api(
    "/conversations/" +
      cid +
      "/messages?" +
      messageQuery("before", state.messages[0]),
  );
  if (version !== state.route || cid !== state.conversationId) return;
  const el = $("#messages"),
    height = el.scrollHeight;
  const ids = new Set(state.messages.map((m) => m.id)),
    fresh = messages.filter((m) => !ids.has(m.id));
  el.insertAdjacentHTML("afterbegin", fresh.map(messageMarkup).join(""));
  state.messages.unshift(...fresh);
  el.scrollTop += el.scrollHeight - height;
  if (!has_more) button.remove();
}
function cartQuantity() {
  if (!state.user) return 0;
  return state.cartReady
    ? state.cart.reduce((n, item) => n + item.quantity, 0)
    : state.cart_summary?.quantity || 0;
}
function cartBadge() {
  $$(".head-icon .count").forEach((el) => (el.textContent = cartQuantity()));
}
function acceptCart(result) {
  state.cart = result.cart.items;
  state.cartServerRevision = result.cart.revision || 0;
  state.cartLines = result.lines;
  state.cartReady = true;
  state.cartFetchedAt = Date.now();
  cartBadge();
}
async function refreshCart() {
  if (!state.user) {
    state.cart = [];
    state.cartReady = false;
    cartBadge();
    return;
  }
  const revision = state.cartRevision || 0,
    userId = state.user.id,
    context = state.cartContext || 0;
  if (
    state.cartFetch?.userId === userId &&
    state.cartFetch.revision === revision &&
    state.cartFetch.context === context
  )
    return state.cartFetch.promise;
  const promise = api("/cart", { background: true }).then((result) => {
    if (
      userId === state.user?.id &&
      revision === (state.cartRevision || 0) &&
      context === (state.cartContext || 0)
    )
      acceptCart(result);
    return result;
  });
  const entry = { userId, revision, context, promise };
  state.cartFetch = entry;
  try {
    return await promise;
  } finally {
    if (state.cartFetch === entry) state.cartFetch = null;
  }
}
async function refreshRemoteCart() {
  if (!state.user || state.cartWritePending || state.cartRemoteFetch) return;
  state.cartRemoteFetch = true;
  try {
    await refreshCart();
    syncCartView(true);
  } catch {
    // Normal route loading will show an actionable error if the connection stays down.
  } finally {
    state.cartRemoteFetch = false;
  }
}
cartChannel?.addEventListener("message", ({ data }) => {
  if (data?.userId) {
    state.cartRemoteRevision = (state.cartRemoteRevision || 0) + 1;
    cartBootstrap.invalidate();
  }
  if (data?.userId === state.user?.id) void refreshRemoteCart();
});
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    state.user &&
    Date.now() - (state.cartFetchedAt || 0) > 5000
  )
    void refreshRemoteCart();
});
function syncCartView(force = false) {
  if (location.pathname !== "/cart") return;
  const lines = state.cartLines || [];
  if (force) {
    $("#content").innerHTML = cartContent(lines);
    return;
  }
  if (!$(".cart-layout")) return;
  const byId = new Map(lines.map((line) => [line.variant_id, line]));
  for (const row of $$(".cart-line")) {
    const input = $(".cart-qty-input", row),
      line = byId.get(input.dataset.id);
    if (!line) {
      row.remove();
      continue;
    }
    if (force || document.activeElement !== input) input.value = line.quantity;
    $(".cart-select", row).checked = line.selected;
    const price = $("strong.price", row),
      formatted = money(line.variant.price * line.quantity);
    if (price.textContent !== formatted) price.textContent = formatted;
  }
  $$(".cart-shop").forEach((shop) => {
    if (!$(".cart-line", shop)) shop.remove();
  });
  if (!lines.length) {
    $("#content").innerHTML =
      title("Giỏ hàng của bạn", "0 món đồ đang chờ được mang về") +
      empty(
        "Giỏ hàng đang chờ bạn",
        "Thêm một món đồ yêu thích để bắt đầu nhé.",
      );
    return;
  }
  const selected = lines.filter((line) => line.selected),
    subtotal = selected.reduce(
      (n, line) => n + line.variant.price * line.quantity,
      0,
    );
  $(".page-title p").textContent =
    lines.length + " món đồ đang chờ được mang về";
  const summary = $(".cart-layout .summary");
  const first = $(".summary-line", summary);
  $("span", first).textContent = "Tạm tính (" + selected.length + " sản phẩm)";
  $$("span", first)[1].textContent = money(subtotal);
  $(".summary-total strong", summary).textContent = money(subtotal);
  $("a.btn", summary).classList.toggle("disabled", !selected.length);
}
async function mutateCart(update) {
  cartBootstrap.invalidate();
  const userId = state.user?.id;
  if (!userId) throw new Error("Vui lòng đăng nhập lại.");
  if (!state.cartReady) await refreshCart();
  if (userId !== state.user?.id) throw new Error("Vui lòng đăng nhập lại.");
  if (!state.cartWriter || state.cartWriterUser !== userId) {
    state.cartWriterUser = userId;
    const context = state.cartContext || 0;
    state.cartWriter = createCartWriter({
      snapshot: () => ({
        cart: { items: state.cart, revision: state.cartServerRevision || 0 },
        lines: state.cartLines || [],
      }),
      load: () => api("/cart", { background: true }),
      write: (items, expected_revision) => {
        if (userId !== state.user?.id || context !== (state.cartContext || 0))
          throw new Error("Phiên giỏ hàng đã thay đổi.");
        return api("/cart", {
          method: "PUT",
          body: {
            expected_revision,
            items: items.map(({ variant_id, quantity, selected }) => ({
              variant_id,
              quantity,
              selected,
            })),
          },
        });
      },
      change: (result, options = {}) => {
        if (userId === state.user?.id && context === (state.cartContext || 0)) {
          acceptCart(result);
          syncCartView(options.rollback || options.rebase);
          if (options.committed) cartChannel?.postMessage({ userId });
        }
      },
    });
  }
  state.cartRevision = (state.cartRevision || 0) + 1;
  const pending = state.cartWriter.update(update);
  state.cartWritePending = pending;
  try {
    return await pending;
  } finally {
    if (state.cartWritePending === pending) state.cartWritePending = null;
  }
}
async function addToCart(buyNow = false) {
  await state.sessionReady;
  if (!requireUser()) return;
  const variant = state.variant,
    quantity = Math.max(1, Math.min(99, Number($("#product-qty").value)));
  if (!variant || !variant.active || variant.stock < quantity)
    throw new Error("Phân loại này không đủ hàng.");
  await mutateCart((items) => {
    const old = items.find((item) => item.variant_id === variant.id);
    if (old) {
      old.quantity = Math.min(99, old.quantity + quantity);
      old.selected = true;
    } else items.push({ variant_id: variant.id, quantity, selected: true });
    return items;
  });
  if (buyNow) go("/cart");
  else toast("Đã thêm một chút niềm vui vào giỏ hàng.");
}
document.addEventListener("click", async (e) => {
  const a = e.target.closest("a");
  if (
    a &&
    !a.hasAttribute("download") &&
    !a.target &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    e.button === 0
  ) {
    const url = new URL(a.href, location.href);
    if (url.origin === location.origin && !url.pathname.startsWith("/api/")) {
      e.preventDefault();
      go(url.pathname + url.search);
      return;
    }
  }
  const button = e.target.closest("[data-action]");
  if (!button) return;
  const { action, id, value, scope } = button.dataset;
  if (button.disabled) return;
  if (action !== "cart-qty") button.disabled = true;
  try {
    if (action === "toggle-filters") {
      const panel = button.closest(".filter-panel");
      const open = panel.classList.toggle("is-open");
      button.setAttribute("aria-expanded", String(open));
    } else if (action === "close-dialog") $("#dialog").close();
    else if (action === "google-link") {
      const area = button.closest(".google-auth");
      const url = new URL(location.href);
      url.searchParams.set("google", "1");
      history.replaceState({}, "", url.pathname + url.search);
      area.outerHTML = googleSignInArea(true);
      await mountGoogleSignIn(state.route);
    } else if (action === "retry-auth-options") {
      button.closest(".auth-options-retry").remove();
      await mountAuthExtras(state.route, location.pathname === "/account");
    } else if (action === "favorite") {
      if (!requireUser()) return;
      if (location.pathname === "/wishlist") {
        await api("/wishlist/" + id, { method: "DELETE" });
        await renderRoute();
        toast("Đã bỏ khỏi danh sách yêu thích.");
      } else {
        await post("/wishlist/" + id);
        toast("Đã lưu vào danh sách yêu thích.");
      }
    } else if (action === "home-filter") {
      $$(".discovery .chip").forEach((el) =>
        el.classList.toggle("active", el === button),
      );
      const version = state.route;
      const { products } = await api(
        "/products?sort=" + (value === "price" ? "price" : "new"),
      );
      if (version === state.route && location.pathname === "/") {
        state.products = products;
        $("#home-products").innerHTML = cards(products, true);
      }
    } else if (action === "variant") {
      state.variant = state.product.variants.find((v) => v.id === id);
      $$(".variant").forEach((el) =>
        el.classList.toggle("active", el === button),
      );
      $("#variant-price").textContent = money(state.variant.price);
      $("#variant-stock").textContent =
        `${state.variant.stock} sản phẩm có sẵn`;
      $$(".detail-actions button").forEach(
        (el) => (el.disabled = !state.variant.stock),
      );
      $$(".variant").forEach((el) =>
        el.setAttribute("aria-pressed", String(el === button)),
      );
    } else if (action === "detail-qty")
      $("#product-qty").value = Math.max(
        1,
        Math.min(99, Number($("#product-qty").value) + Number(value)),
      );
    else if (action === "add-cart" || action === "buy-now")
      await addToCart(action === "buy-now");
    else if (action === "cart-qty") {
      await mutateCart((items) => {
        const item = items.find((item) => item.variant_id === id);
        if (item)
          item.quantity = Math.max(
            1,
            Math.min(99, item.quantity + Number(value)),
          );
        return items;
      });
    } else if (action === "remove-cart") {
      await mutateCart((items) =>
        items.filter((item) => item.variant_id !== id),
      );
    } else if (action === "add-address") addressDialog();
    else if (action === "delete-address") {
      await api("/addresses/" + id, { method: "DELETE" });
      await renderRoute();
    } else if (action === "logout") {
      cartBootstrap.invalidate();
      await post("/auth/logout");
      state.sessionRevision = (state.sessionRevision || 0) + 1;
      state.user = null;
      state.shop = null;
      state.csrf = "";
      state.cart = [];
      state.cartReady = false;
      state.cartLines = [];
      state.cartWriter = null;
      state.cartContext = (state.cartContext || 0) + 1;
      state.checkoutKey = "";
      go("/");
    } else if (action === "resend-verification") {
      await post("/auth/resend", { email: state.user.email });
      toast("Đã ghi nhận yêu cầu gửi email.");
    } else if (action === "older-messages") await olderMessages(button);
    else if (action === "start-chat") {
      if (!requireUser()) return;
      const { conversation } = await post("/conversations", { shop_id: id });
      go("/chat/" + conversation.id);
    } else if (action === "find-product-shops") {
      const form = button.closest("form");
      const query = new URLSearchParams({
        view: "selector",
        status: "approved",
        q: form.elements.shop_search.value,
      });
      const { shops } = await api("/admin/shops?" + query);
      if (form.isConnected)
        form.elements.shop_id.innerHTML = shops
          .map(
            (shop) =>
              `<option value="${esc(shop.id)}">${esc(shop.name)}</option>`,
          )
          .join("");
    } else if (action === "quote") await quoteCheckout();
    else if (action === "sync-payment") {
      await post("/payments/" + id + "/sync");
      await renderRoute();
    } else if (action === "cancel-payment") {
      await post("/payments/" + id + "/cancel");
      await renderRoute();
    } else if (action === "order-status") {
      await post("/orders/" + id + "/status", { status: value });
      toast("Đã cập nhật đơn hàng.");
      await renderRoute();
    } else if (action === "collect-cod") {
      await post("/orders/" + id + "/collect");
      toast("Đã ghi nhận thu COD.");
      await renderRoute();
    } else if (action === "reorder") {
      const { order } = await api("/orders/" + id);
      await refreshCart();
      await mutateCart((items) => {
        for (const l of order.items) {
          const old = items.find((i) => i.variant_id === l.variant_id);
          if (old) {
            old.quantity = Math.min(99, old.quantity + l.quantity);
            old.selected = true;
          } else
            items.push({
              variant_id: l.variant_id,
              quantity: l.quantity,
              selected: true,
            });
        }
        return items;
      });
      go("/cart");
    } else if (action === "review")
      dialog(
        "Chia sẻ trải nghiệm của bạn",
        `<form data-form="review" data-id="${esc(id)}"><label class="field"><span>Mức độ hài lòng</span><select name="rating"><option value="5">★★★★★ Rất hài lòng</option><option value="4">★★★★ Hài lòng</option><option value="3">★★★ Bình thường</option><option value="2">★★ Chưa hài lòng</option><option value="1">★ Không hài lòng</option></select></label>${textarea("Cảm nhận của bạn", "comment", "", 'required maxlength="3000"')}<div class="form-error" hidden></div><button class="btn full">Gửi đánh giá</button></form>`,
      );
    else if (action === "return-order") {
      const o = state.order;
      dialog(
        "Yêu cầu trả hàng",
        `<form data-form="return" data-id="${esc(o.id)}"><p class="small-text muted" style="margin-bottom:20px">Chọn mặt hàng và số lượng muốn trả. Shop sẽ xét duyệt yêu cầu.</p>${o.items.map((l) => `<div class="row between" style="padding:12px 0"><label class="small-text"><input type="checkbox" name="item_${esc(l.id)}"> ${esc(l.name)} · ${esc(l.variant_name)}</label><input name="qty_${esc(l.id)}" type="number" min="1" max="${l.quantity}" value="${l.quantity}" style="width:65px;padding:7px;border:1px solid var(--line);border-radius:4px" aria-label="Số lượng trả"></div>`).join("")}${textarea("Lý do trả hàng", "reason", "", 'required maxlength="2000"')}<div class="form-error" hidden></div><button class="btn full">Gửi yêu cầu</button></form>`,
      );
    } else if (action === "return-status") {
      await post("/returns/" + id, { status: value });
      await renderRoute();
    } else if (action === "refund")
      dialog(
        "Ghi nhận hoàn tiền đã thực hiện",
        `<form data-form="refund"><div class="notice">Chỉ ghi nhận sau khi admin đã chuyển tiền hoàn cho khách ngoài hệ thống.</div>${field("Số tiền đã hoàn (VNĐ)", "amount", value, "number", `min="1" max="${value}" required`)}${field("Mã giao dịch / tham chiếu", "reference", "", "text", 'required maxlength="150"')}${textarea("Ghi chú", "note")}<div class="form-error" hidden></div><button class="btn full">Ghi nhận đã hoàn tiền</button></form>`,
      );
    else if (action === "edit-product") {
      const version = state.route;
      await ensureMeta(true);
      if (version === state.route) productDialog(id);
    } else if (action === "add-variant")
      $("#variants-editor").insertAdjacentHTML("beforeend", variantEditor());
    else if (action === "remove-variant") {
      if ($$(".variant-editor").length > 1)
        button.closest(".variant-editor").remove();
      else toast("Cần ít nhất một biến thể.");
    } else if (action === "new-voucher") voucherDialog(scope);
    else if (action === "copy-voucher") {
      try {
        await navigator.clipboard.writeText(value);
        toast("Đã sao chép mã " + value);
      } catch {
        toast("Mã giảm giá: " + value);
      }
    } else if (action === "delete-voucher") {
      await api("/vouchers/" + id, { method: "DELETE" });
      await renderRoute();
    } else if (action === "shop-status") {
      await post("/admin/shops/" + id, { status: value });
      await renderRoute();
    } else if (action === "user-active") {
      await post("/admin/users/" + id, { active: value === "true" });
      await renderRoute();
    } else if (action === "moderate-product") {
      await post("/admin/products/" + id, { active: value === "true" });
      await renderRoute();
    } else if (action === "moderate-review") {
      await post("/admin/reviews/" + id, { hidden: value === "true" });
      await renderRoute();
    } else if (action === "user-role") {
      await post("/admin/users/" + id, { role: value });
      await renderRoute();
    } else if (action === "catalog-api") {
      state.catalogPreviewToken = null;
      dialog(
        "Nạp dữ liệu demo qua API",
        '<div class="notice">Tối đa 1.000 sản phẩm demo. Khi nguồn DummyJSON không đủ, hệ thống bổ sung bản ghi mô phỏng Shoppe dùng ảnh minh họa và nội dung của cùng mẫu gốc. Không phải hàng thật hoặc dữ liệu Shopee. Nếu chọn payOS, thanh toán sử dụng tiền thật. Giá và tồn kho là dữ liệu mô phỏng; không ghi đè hàng đã có.</div>' +
          '<form data-form="catalog-preview">' +
          field(
            "Số sản phẩm muốn xem trước",
            "limit",
            1000,
            "number",
            'min="1" max="1000" required',
          ) +
          '<div class="form-error" hidden></div><button class="btn full">Tải bản xem trước</button></form><div id="catalog-preview-result" aria-live="polite"></div>',
      );
    } else if (action === "catalog-commit") {
      if (!state.catalogPreviewToken) return;
      const result = await post("/admin/catalog/commit", {
        preview_token: state.catalogPreviewToken,
      });
      state.catalogPreviewToken = null;
      $("#dialog").close();
      state.meta = await api("/meta");
      await renderRoute();
      toast(
        `Đã nhập ${result.imported} sản phẩm demo mới; giữ nguyên ${result.skipped} sản phẩm đã có.`,
      );
    } else if (action === "load-demo-catalog") {
      const result = await post("/admin/catalog/import");
      await refreshUser();
      await renderRoute();
      toast(
        `Đã nạp ${result.imported} sản phẩm demo; giữ nguyên ${result.skipped} sản phẩm đã có.`,
      );
    } else if (action === "retry-email") {
      await post("/admin/outbox/retry");
      toast("Đã đưa email lỗi về hàng đợi.");
      await renderRoute();
    } else if (action === "review-mail") {
      dialog(
        "Kiểm tra lần gửi cuối",
        `<form data-form="review-mail"><input type="hidden" name="id" value="${esc(id)}"><p>Tiến trình bị gián đoạn sau khi gửi. Hãy kiểm tra nhật ký dịch vụ email trước khi thử lại để tránh gửi trùng.</p><label class="row small-text"><input name="confirm_uncertain" type="checkbox" required> Tôi đã kiểm tra và muốn gửi lại thư này.</label><div class="form-error" hidden></div><button class="btn">Đưa vào hàng đợi</button></form>`,
      );
    } else if (action === "read-notifications") {
      await post("/notifications");
      await renderRoute();
    } else if (action === "import-products")
      dialog(
        "Nhập sản phẩm từ CSV",
        `<form data-form="import"><p class="small-text muted" style="margin-bottom:15px">CSV UTF-8, tối đa 200 dòng. Dùng Xuất CSV để xem định dạng mẫu.</p><label class="field"><span>Chọn file CSV</span><input type="file" id="csv-upload" accept=".csv,text/csv"></label>${textarea("Nội dung CSV", "csv", "name,category,description,variant,price,stock,weight\n", 'required rows="7"')}<div id="csv-preview"></div><div class="form-error" hidden></div><div class="row"><button class="btn outline" name="mode" value="preview">Xem trước</button><button class="btn" name="mode" value="commit" id="import-commit" disabled>Nhập dữ liệu</button></div></form>`,
      );
    else if (action === "review-payment") {
      const g = state.checkouts.find((c) => c.id === id);
      dialog(
        "Ghi hoàn tiền giao dịch cần đối soát",
        `<form data-form="review-payment" data-id="${esc(id)}"><div class="notice">Kiểm tra sao kê và hoàn tiền bên ngoài trước khi ghi nhận. Giao dịch sẽ không khôi phục đơn đã hủy.</div>${field("Số tiền đã hoàn", "amount", g.status === "paid" ? (g.excess_amount || 0) - (g.excess_refunded_amount || 0) : g.received_amount || 0, "number", 'min="1" required')}${field("Mã tham chiếu", "reference", "", "text", 'required maxlength="150"')}<div class="form-error" hidden></div><button class="btn full">Ghi nhận hoàn tiền</button></form>`,
      );
    }
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id !== "catalog-page") return;
  const q = new URLSearchParams(location.search);
  q.set("page", e.target.value);
  go(location.pathname + "?" + q);
});
document.addEventListener("change", async (e) => {
  try {
    if (e.target.matches(".cart-select,.cart-qty-input")) {
      const id = e.target.dataset.id,
        checkbox = e.target.matches(".cart-select"),
        checked = e.target.checked,
        quantity = Math.max(1, Math.min(99, Number(e.target.value) || 1));
      await mutateCart((items) => {
        const item = items.find((item) => item.variant_id === id);
        if (item) {
          if (checkbox) item.selected = checked;
          else item.quantity = quantity;
        }
        return items;
      });
    }
    if (e.target.id === "sort-products") {
      const q = new URLSearchParams(location.search);
      q.set("sort", e.target.value);
      q.delete("page");
      go(location.pathname + "?" + q);
    }
    if (e.target.id === "checkout-address") await quoteCheckout();
    if (e.target.closest("#checkout-form") && e.target.name === "method")
      await quoteCheckout();
    if (e.target.id === "csv-upload" && e.target.files[0]) {
      const f = e.target.files[0];
      if (f.size > 500000) throw new Error("CSV tối đa 500KB.");
      $("[name=csv]", e.target.form).value = await f.text();
      $("#import-commit").disabled = true;
    }
    if (e.target.id === "image-upload" && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) throw new Error("Ảnh tối đa 2MB.");
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { url } = await post("/storage/images", {
        base64,
        type: file.type,
      });
      $("[name=image]", e.target.form).value = url;
      toast("Đã tải ảnh lên.");
    }
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.closest('[data-form="catalog-preview"]')) {
    state.catalogPreviewToken = null;
    $("#catalog-preview-result").innerHTML = "";
  }
  if (e.target.closest("#checkout-form") && e.target.name.includes("voucher")) {
    state.quoteRevision = (state.quoteRevision || 0) + 1;
    state.quoteController?.abort();
    state.quote = null;
    $("#place-order").disabled = true;
  }
  if (e.target.name === "csv" && $("#import-commit"))
    $("#import-commit").disabled = true;
});
document.addEventListener("submit", async (e) => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form,
    data = Object.fromEntries(new FormData(form));
  const button = e.submitter;
  if (button) button.disabled = true;
  const errorBox = $(".form-error", form);
  if (errorBox) errorBox.hidden = true;
  try {
    if (
      kind === "search" ||
      kind === "filter-price" ||
      kind === "list-filter"
    ) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(data)) if (v) q.set(k, v);
      go((kind === "search" ? "/search" : location.pathname) + "?" + q);
    } else if (kind === "auth") {
      const type = form.dataset.kind;
      const body = { ...data };
      if (type === "verify" || type === "reset")
        body.token = new URLSearchParams(location.search).get("token") || "";
      const result = await post("/auth/" + type, body);
      if (type === "login") {
        acceptSession(result);
        void refreshCart().catch(() => {});
        let next = new URLSearchParams(location.search).get("next") || "/";
        if (!next.startsWith("/") || next.startsWith("//")) next = "/";
        go(next);
      } else {
        toast(result.message || "Thao tác thành công.");
        if (["register", "reset", "verify"].includes(type)) go("/login");
      }
    } else if (kind === "review-mail") {
      await post("/admin/outbox/retry", {
        id: data.id,
        confirm_uncertain: data.confirm_uncertain === "on",
      });
      $("#dialog").close();
      await renderRoute();
    } else if (kind === "profile") {
      const result = await api("/account", {
        method: "PATCH",
        body: { name: data.name },
      });
      state.user = result.user;
      toast("Đã lưu hồ sơ.");
      await renderRoute();
    } else if (kind === "address") {
      await post("/addresses", {
        ...data,
        is_default: data.is_default === "on",
      });
      $("#dialog").close();
      toast("Đã lưu địa chỉ.");
      await renderRoute();
    } else if (kind === "apply-shop") {
      const result = await post("/shops/apply", data);
      state.shop = result.shop;
      toast("Đã gửi đăng ký mở shop.");
      await renderRoute();
    } else if (kind === "shop-settings") {
      const result = await api("/shops/mine", { method: "PATCH", body: data });
      state.shop = result.shop;
      toast("Đã cập nhật shop.");
    } else if (kind === "product") {
      const scope = form.dataset.scope || "seller";
      const variants = $$(".variant-editor", form).map((row) => ({
        ...(row.dataset.id ? { id: row.dataset.id } : {}),
        name: $("[name=variant_name]", row).value,
        price: Number($("[name=variant_price]", row).value),
        stock: Number($("[name=variant_stock]", row).value),
      }));
      await api(
        "/" +
          scope +
          "/products" +
          (form.dataset.id ? "/" + form.dataset.id : ""),
        {
          method: form.dataset.id ? "PUT" : "POST",
          body: {
            name: data.name,
            description: data.description,
            category: data.category,
            image: data.image,
            weight: Number(data.weight),
            shop_id:
              scope === "admin"
                ? state.editingProduct?.shop_id || data.shop_id
                : state.shop.id,
            active: data.active === "on",
            variants,
          },
        },
      );
      $("#dialog").close();
      toast("Đã lưu sản phẩm.");
      await renderRoute();
    } else if (kind === "voucher") {
      await post("/vouchers", {
        code: data.code,
        type: data.type,
        value: Number(data.value),
        minimum: Number(data.minimum),
        max_discount: Number(data.max_discount),
        limit: Number(data.limit),
        ends_at: Math.floor(Date.now() / 1000) + Number(data.days) * 86400,
        shop_id: form.dataset.scope === "seller" ? state.shop.id : "",
      });
      $("#dialog").close();
      toast("Đã tạo voucher.");
      await renderRoute();
    } else if (kind === "checkout") {
      if (!state.quote)
        throw new Error("Vui lòng áp dụng và tính lại đơn hàng.");
      let result;
      try {
        result = await post("/checkout", checkoutPayload(form));
      } catch (error) {
        if (
          ["quote_changed", "quote_expired", "quote_required"].includes(
            error.code,
          )
        ) {
          state.quote = null;
          // Reload the lines as well as totals when another tab changed the cart.
          await renderRoute();
          toast(
            "Đơn hàng đã thay đổi. Vui lòng kiểm tra và xác nhận tổng tiền mới.",
          );
        }
        throw error;
      }
      state.checkoutKey = "";
      await refreshCart();
      if (result.payment_error) toast(result.payment_error.message);
      go("/payment/" + result.checkout.id);
    } else if (kind === "review") {
      await post("/reviews", {
        order_item_id: form.dataset.id,
        rating: Number(data.rating),
        comment: data.comment,
      });
      $("#dialog").close();
      toast("Cảm ơn bạn đã chia sẻ đánh giá.");
    } else if (kind === "return") {
      const items = state.order.items
        .filter((l) => data["item_" + l.id] === "on")
        .map((l) => ({ item_id: l.id, quantity: Number(data["qty_" + l.id]) }));
      await post("/orders/" + form.dataset.id + "/return", {
        items,
        reason: data.reason,
      });
      $("#dialog").close();
      toast("Đã gửi yêu cầu trả hàng.");
      await renderRoute();
    } else if (kind === "refund") {
      await post("/admin/refunds", {
        order_id: state.order.id,
        amount: Number(data.amount),
        reference: data.reference,
        note: data.note,
      });
      $("#dialog").close();
      toast("Đã ghi nhận hoàn tiền.");
      await renderRoute();
    } else if (kind === "review-payment") {
      await post("/admin/payments/" + form.dataset.id + "/refund", {
        amount: Number(data.amount),
        reference: data.reference,
      });
      $("#dialog").close();
      toast("Đã ghi nhận hoàn tiền đối soát.");
      await renderRoute();
    } else if (kind === "message") {
      await post("/conversations/" + form.dataset.id + "/messages", {
        text: data.text,
      });
      form.reset();
      await refreshMessages();
    } else if (kind === "import") {
      const commit = button?.value === "commit";
      const result = await post("/seller/import", {
        csv: data.csv.replace(/^\uFEFF/, ""),
        commit,
      });
      if (commit) {
        $("#dialog").close();
        toast("Đã nhập " + result.imported + " sản phẩm.");
        await renderRoute();
      } else {
        $("#csv-preview").innerHTML =
          `<div class="notice ${result.errors.length ? "" : "success"}">${result.preview.length} dòng hợp lệ · ${result.errors.length} lỗi</div>${result.errors.map((err) => `<p class="small-text">Dòng ${err.row}: ${esc(err.message)}</p>`).join("")}`;
        $("#import-commit").disabled =
          !!result.errors.length || !result.preview.length;
      }
    } else if (kind === "catalog-preview") {
      state.catalogPreviewToken = null;
      $("#catalog-preview-result").innerHTML =
        '<p class="small-text muted">Đang tải dữ liệu demo…</p>';
      const result = await post("/admin/catalog/preview", {
        limit: Number(data.limit),
      });
      if (!form.isConnected || form.elements.limit.value !== data.limit) return;
      state.catalogPreviewToken = result.preview_token;
      $("#catalog-preview-result").innerHTML =
        `<div class="notice success">${result.products.length} sản phẩm · ${result.new_products} mới · ${result.existing} đã có · ${result.generated_products || 0} mẫu mô phỏng mở rộng. Bản xem trước có hiệu lực 15 phút.</div>` +
        table(
          ["Tên sản phẩm", "Nguồn", "Danh mục", "Giá demo", "Trạng thái"],
          result.products.map(
            (p) =>
              `<tr><td>${esc(p.name)}</td><td>${p.source === "ShoppeDemo" ? "Mẫu mô phỏng Shoppe" : "DummyJSON"}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.exists ? "Giữ nguyên" : "Sẽ thêm"}</td></tr>`,
          ),
        ) +
        '<button type="button" class="btn full" data-action="catalog-commit">Nhập bản xem trước vào shop</button>';
    } else if (kind === "admin-settings") {
      await post("/admin/settings", {
        ...data,
        categories: data.categories
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        shipping_local: Number(data.shipping_local),
        shipping_remote: Number(data.shipping_remote),
        shipping_step: Number(data.shipping_step),
      });
      state.meta = await api("/meta");
      toast("Đã lưu cài đặt toàn sàn.");
    }
  } catch (error) {
    if (errorBox && form.isConnected) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } else toast(error.message);
  } finally {
    if (button) button.disabled = false;
  }
});
window.addEventListener("popstate", renderRoute);
async function start() {
  shell();
  const route = location.pathname + location.search;
  const include = location.pathname === "/cart" ? "cart-view" :
    location.pathname === "/checkout" ? "checkout" : "cart";
  state.sessionReady = refreshUser({ include, route }).catch((e) => {
    state.sessionError = e;
  });
  void state.sessionReady
    .then(async () => {
      refreshHeader();
      cartBadge();
    })
    .catch(() => {
      /* Cart badge can refresh on the next user action. */
    });
  await renderRoute();
}
start();

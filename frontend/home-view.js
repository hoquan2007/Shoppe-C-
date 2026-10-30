// The same frame renders before and after the public read. No sample prices or stock.
export function renderHome(
  { products = [], meta = {}, category_previews = {} } = {},
  { esc, image, cards, empty, icon },
  pending = false,
) {
  const categories = meta.categories || [];
  const pick = category => category_previews[category] || products[0];
  const homeProduct = pick("Nhà cửa & Đời sống"), accessory = pick("Phụ kiện");
  const featured = [pick("Điện tử"), homeProduct, accessory, pick("Thời trang"), ...products]
    .filter((product, index, list) => product && list.findIndex(item => item.id === product.id) === index).slice(0, 8);
  const collection = pending
    ? `<div class="home-feature-placeholder" aria-hidden="true">${"<span></span>".repeat(4)}</div>`
    : `<div class="infinite-spiral" data-speed="0.32" data-depth="140" data-spacing="66" data-cards-per-turn="6" data-perspective="1000"><div class="spiral-stage" role="list" aria-label="Bộ sưu tập sản phẩm">${featured.map((product, index) =>
      `<div class="spiral-card" role="listitem"><a href="/product/${esc(product.id)}" aria-label="${esc(product.name)}" title="${esc(product.name)}"><img src="${image(product.image)}" alt="" width="180" height="150" decoding="async" ${index === 0 ? 'fetchpriority="high"' : 'loading="eager"'}><span>${esc(product.name)}</span></a></div>`).join("")}</div></div>`;
  const categoryItems = pending
    ? `<div class="market-category category-placeholder" aria-hidden="true"><span></span><span></span></div>`.repeat(7)
    : categories.map(category => {
      const product = pick(category);
      return `<a class="market-category" href="/search?category=${encodeURIComponent(category)}">${product ? `<img src="${image(product.image)}" alt="" width="80" height="80" loading="lazy">` : icon("grid", 24)}<span>${esc(category)}</span></a>`;
    }).join("");
  const promo = (product, category, heading, text) =>
    `<a class="market-promo" href="/search?category=${encodeURIComponent(category)}"><div><h2>${heading}</h2><span>${text}</span></div>${product ? `<img src="${image(product.image)}" alt="${esc(product.name)}" width="200" height="200" loading="lazy" decoding="async">` : ""}</a>`;
  const placeholders = `<div class="products home-products" aria-hidden="true">${`<div class="product-placeholder"><div></div><span></span><span></span><span></span></div>`.repeat(12)}</div>`;
  return `<section class="market-hero" data-home-view${pending ? ' data-home-pending' : ''}>
    <div class="market-lead">
      <div class="market-copy"><h1>${esc(meta.settings?.banner_title || "Một chút mới. Thêm nhiều vui.")}</h1><p>${esc(meta.settings?.banner_subtitle || "Khám phá những món đồ bạn yêu, từ những shop bạn tin.")}</p><a class="btn" href="/search">Khám phá ngay</a></div>
      <div class="home-feature" data-home-region="feature">${collection}<div class="home-load-status" role="status">${pending ? "Đang tải bộ sưu tập…" : ""}</div></div>
    </div>
  </section>
  <section class="category-section"><div class="section-head"><div><h2>Bạn muốn tìm gì?</h2><p>Mọi điều bạn cần, ở ngay đây.</p></div><a href="/search">Tất cả danh mục</a></div><div class="market-categories" data-home-region="categories">${categoryItems}</div></section>
  <div class="market-side" data-home-region="promos">${promo(homeProduct, "Nhà cửa & Đời sống", "Đồ xinh cho góc nhỏ của bạn.", "Tìm cảm hứng")}${promo(accessory, "Phụ kiện", "Phụ kiện nhỏ. Trải nghiệm lớn.", "Xem bộ sưu tập")}</div>
  <section class="home-catalog"><div class="section-head catalog-head"><div><h2>Dành riêng cho hôm nay</h2><p>Một vài gợi ý, biết đâu là món bạn đang tìm.</p></div><div class="discovery" data-home-region="filters">${[["all", "Gợi ý cho bạn"], ["new", "Mới nhất"], ["price", "Giá dễ yêu"]].map(([value, label]) => `<button class="chip${value === 'all' ? ' active' : ''}" data-action="home-filter" data-value="${value}"${pending ? ' disabled' : ''}>${label}</button>`).join("")}</div></div>
    <div id="home-products" data-home-region="products"${pending ? ' aria-busy="true"' : ''}>${pending ? placeholders : products.length ? cards(products.slice(0, 12), true) : empty("Chưa có sản phẩm", "Các shop sẽ sớm mang những món đồ mới đến đây.", "/seller", "Mở shop của bạn")}</div>
    <div class="catalog-more"><a class="btn outline" href="/search">Khám phá thêm</a></div>
  </section>
  <div class="benefits">${[
    ["truck", "Giao hàng tiện lợi", "Theo dõi từng bước hành trình"],
    ["shield", "Thanh toán an tâm", "payOS & thanh toán khi nhận hàng"],
    ["return", "Đổi trả dễ dàng", "Yêu cầu trả hàng trong 7 ngày"],
    ["chat", "Luôn có người lắng nghe", "Kết nối trực tiếp cùng shop"],
  ].map(([name, heading, text]) => `<div class="benefit">${icon(name, 23)}<div><strong>${heading}</strong><small>${text}</small></div></div>`).join("")}</div>
  <section class="newsletter"><div><h3>Shop nhỏ của bạn. Cơ hội lớn mỗi ngày.</h3><p>Mang sản phẩm của bạn đến với những người đang tìm kiếm.</p></div><a class="btn" href="/seller">Bắt đầu bán hàng</a></section>`;
}

// Patch data regions only: the intro, primary CTA, scroll and focus stay in place.
export function updateHome(root, html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const selector of [".market-copy h1", ".market-copy p"]) {
    const current = root.querySelector(selector), next = template.content.querySelector(selector);
    if (current.textContent !== next.textContent) current.textContent = next.textContent;
  }
  for (const region of root.querySelectorAll("[data-home-region]")) {
    const next = template.content.querySelector(`[data-home-region="${region.dataset.homeRegion}"]`);
    region.replaceChildren(...next.childNodes);
    region.removeAttribute("aria-busy");
  }
  root.querySelector("[data-home-view]").removeAttribute("data-home-pending");
}

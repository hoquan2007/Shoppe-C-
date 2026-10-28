# Retail component redesign — 28/10/2026

Scope from the six supplied screenshots: product purchase panel, product information/reviews, price filter, pagination, footer, and demo captions on product imagery/cards. Keep the approved warm orange identity and current compact header.

References inspected: [IKEA product page](https://www.ikea.com/us/en/p/konstrunda-stool-pine-80623716/) (large image, clear price/action, separate product details/care/reviews and grouped footer links); [UNIQLO category navigation](https://www.uniqlo.com/us/en/) (direct category discovery); [ZARA navigation](https://www.zara.com/us/) (restrained merchandising structure). These inform hierarchy; no imagery, brand identity, reviews, services or policies are copied.

1. Recompose product purchase panel with smaller title, clear price, one review summary, tidy option/quantity controls, a primary add-to-cart action and secondary buy-now action. Seller/chat remain usable. Phone purchase actions remain reachable.
2. Remove `detail-demo` and card `demo-label` markup, including “Sản phẩm minh họa cho bài tập” under the image. The user explicitly requested this; it supersedes the older design.md instruction to preserve those captions. Preserve catalog/payment disclosures in the information section, with accessible disclosure controls and escaped text.
3. Turn known description sections into readable introduction/care/catalog sections; preserve arbitrary seller text verbatim as escaped paragraphs. Separate reviews into a meaningful compact module with honest zero/rating states.
4. Price filter: grouped fields, VND units, clear apply/reset actions, minimum/maximum validation, retain category/query/sort, no API per keystroke.
5. Pagination: a centered compact numbered sequence and previous/next controls, current/total context, explicit numeric jump form instead of a long select list; preserve server pagination and filter query parameters.
6. Footer: lighter surface, stronger typographic hierarchy, grouped real destinations, mobile native disclosures, compact actual payment methods and quiet site disclosure. No fake legal/support links or payment logos.

Acceptance: keyboard/touch, 375/390/768/1280/1440px, long names/text, zero and populated reviews, real variants/stock and cart behavior, multi-page filters/jump, no image/card demo captions, catalog/payment caveat retained, no new service/dependency/API polling. Verify all components visually before pushing; then full CI, Preview and Production with rollback retained.

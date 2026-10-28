# Shoppe redesign brief

## Evidence and direction

User answer, verbatim: “Cam ấm, cửa hàng tuyển chọn, chuyển động tinh tế”.

Material: existing product images, categories, shop names, prices, availability, Vietnamese copy and real UI flows. Audience: current Vietnamese shoppers and sellers, inferred from the existing application. Use: browse/search, inspect a product, then buy through the existing cart/quote flow. No invented proof or claims.

Inventory: Shoppe orange wordmark; Vietnamese/VND; multi-shop catalog; public filters/pagination; category previews; actual variant prices/stock; guest/private session split; revision-safe cart; signed checkout quotes; COD/payOS notices; seller/admin workspaces; demo labels.

## Authored design decisions

- Grammar: browsable gallery / working catalogue, distinct sections; no continuous world or pinned film.
- Journey: discover a product composition → select a category → browse today's catalog → useful benefits and seller entry → existing footer destinations.
- Energy: expressive product hero, quiet category navigation, regular catalog rhythm, composed closing seller band.
- Feeling curve: curiosity from the product arrangement; confidence from legible names/prices; control from real filters; reassurance from unchanged checkout and payment notices.
- Peak: the hero's product planes move slightly independently, then settle into a usable catalog.
- Signature: “It's the Shoppe where everyday objects are presented like a considered selection, and the products stay easy to browse.”
- Assets: existing catalog only; Manrope self-hosted with OFL. No video or generated imagery. Scroll Craft doctor reports FFmpeg absent and no Kie key; video-generation stages are outside this photo-first scope.
- Motion: GSAP transforms/opacity, lazy import, one bounded depth scene, one-shot reveals, interaction feedback; native scroll and static reduced-motion fallback.
- Phone: headline/action first, compact product stage, swipeable category rail, two-column catalog and existing bottom navigation.
- Silence: checkout/account/admin do not get decorative scroll animation; no hidden content while an optional motion module loads.

## File plan

Edit: frontend/app.js (presentation and motion lifecycle only), tokens.css, style.css (token consistency), redesign.css, package/lock files, frontend package/lock files, vercel.json (hashed local font cache header).

Create: frontend/curated.css, frontend/motion.js, frontend/fonts.css, frontend/public/assets/fonts (font files + license), design.md, test coverage for motion and responsive UI.

Delete: no source files, routes, form fields, handlers or test hooks.

## Direction deal and adaptations

Taste draw seed 1079731741: specimen-catalogue; alternatives were page-is-the-object and split-stage. Chosen because the existing catalog already supplies individual product imagery and named items. Keep warm orange as requested. Use Manrope with self-hosted Vietnamese coverage; do not add unrelated atmospheric stock photos. Keep a regular comparison grid for purchasable products, and concentrate scale variation in the hero/collection composition.

## Before

Home already exposes categories and useful product links. Current composition is small and compressed, with repeated white panels, small secondary text and little motion. Real price/stock and the existing commerce wiring stay. Baseline screenshots: artifacts/redesign-before/home-desktop.png and home-mobile.png.

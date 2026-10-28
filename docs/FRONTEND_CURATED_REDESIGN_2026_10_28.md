# Shoppe curated storefront — 2026-10-28

User direction: “Cam ấm, cửa hàng tuyển chọn, chuyển động tinh tế”.

## Delivered design

Warm orange actions, warm neutral surfaces, self-hosted Manrope with Vietnamese coverage, a product composition using actual catalog imagery, category rail, two collection panels, larger comparison-friendly product imagery, and consistent detail/cart/checkout/workspace styling. Existing routes, copy, demo/payment disclosures, form fields, data hooks and commerce handlers are preserved.

GSAP 3.15.0 is an optional dynamically loaded chunk after a public route commits. It adds short introductions, one-shot reveals, a bounded desktop hero depth scene and small pointer feedback. No pinned scrolling, video, continuous loop or startup WebGL. Reduced motion, Save-Data and 2G skip downloading motion. Route teardown reverts styles, listeners, observers and ScrollTriggers; switching to reduced motion also reverts the active scene. Content is visible if the motion download fails.

## Skills

Verified 23 existing installed skills from the four requested repositories: Scroll Craft (1), Three.js (13), official GSAP (8), Hallmark (1). Hallmark was updated from pinned commit `6033bab2a8051b5454552d2e8e6cb8f27c483a42`; all 182 staged files match installed binary SHA256 hashes after the update. Previous Hallmark version is backed up under the ignored `.cache/skill-backups/hallmark-20261028` directory. Initial text-normalized verification produced false binary-image differences; the final raw binary comparison has zero mismatches.

Other pins: Scroll Craft `75d81f74e83692add18cd7a8a8e078b8a887a579`, Three.js `0e181866f095b5f06d005133876e926515390d95`, GSAP `aed9cfd3277740755f6bfc1155c7aa645403b760`.

Three.js guidance is installed, but the catalog provides photos rather than 3D assets; a renderer is not added to this release. FFmpeg/Kie generation stages are outside this photo-first design, with no new paid service.

## Validation

- Local build, syntax checks and secret scan pass; 59 API/JS tests pass.
- Chromium 15/15 passes, including the existing commerce race/request-budget suite and four new tests for optional motion failure, reduced-motion/Save-Data, responsive overflow/filter controls, and animation teardown.
- Visual checks through the supported browser tool cover real public catalog images on desktop/phone and fake-data login → detail → add to cart → cart → checkout. No real order/payment/account mutation was performed.
- Hero review in fresh context: three findings resolved (repeated cards, undersized photos, mobile lower row). Finish review in fresh context: one finding resolved (inherited empty collection grid row). Confirmed desktop collections have one row and an 88px margin before the catalog.
- Fixed the mobile filter selector to match the existing `is-open` handler and corrected footer link color specificity.
- Static Hallmark check on `curated.css` and `tokens.css`: 0 FAIL, 0 REFLEX, 9 WARN. Warnings concern intentional image hover and compact commerce copy. Automated render tier was not run; visual browser review is reported separately. Full desktop capture and phone screen sequence are under ignored `artifacts/redesign-after`; the browser tool rejected full-page phone captures, so phone sections were inspected separately.

## Transfer cost and limits

Build output, raw/gzip: main JS 118.17/38.12KB, CSS 88.72/17.50KB, optional motion 115.85/45.89KB. The previous main was 117.43/37.80KB and CSS 56.17/11.82KB. Latin + Vietnamese font subsets total 32,920 bytes before HTTP compression; other unicode subsets are only requested when needed. Fonts are local OFL assets with swap and content-hashed immutable caching. No external font connection or extra catalog API was introduced.

These are transfer/build measurements, not a claimed field FPS or percentile improvement. Existing public cold/dispatch samples of 4–5 seconds remain a separate backend/platform issue; the previous authorized Vercel feedback submission is not a support ticket with an SLA. This frontend release does not claim to eliminate that delay.

## Release

Application source: `98d7e52ea17e8d17ef355e0d10598566332b6015`.

CI run [40673229780](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40673229780): SQLite and PostgreSQL jobs both successful. PostgreSQL job confirms 59 API/JS tests, 9 CTest tests, 9 CTest tests in the exact deployment container, and 15 Chromium regressions.

Preview `dpl_HZVuxFfZQe4EbpSGh8G178WMppPS` built READY. HTML, main bundle, public home API and Vietnamese font returned 200; main SHA256 matched the tested local build: `ab59f9193f33c14ddc52edcd06aa1879b474c0331faa2a4903ac89b2c9e642bb`. Vietnamese font response was `font/woff2` with `public, max-age=31536000, immutable`. Preview has the 12-item fake catalog and was not promoted to Production.

Registry had 50/50 images after Preview. Removed only the newly created, rebuildable Preview image `image_MaR512EtCjeJP7teNlcmJ8XfoMQR` (source `98d7e52ea17e`), keeping the current Production `image_XforIGmFDog5SPqBITdzef8N0RVg` and older rollback images. Intermediate Preview builds `dpl_GKssSYWPPPt4GRc8dgdk3BdYueua` and `dpl_BFDKkCqZnH4xn44tZwknVBguabXw` were canceled before publishing images.

Separate Production deployment: `dpl_GNkF6iHexNKaQHDGQBSEJCouNcw5` (`shoppe-n7wzub8w6-hnquan.vercel.app`) READY, Singapore. Confirmed `https://shoppec.vercel.app` points to this deployment. Main bundle hash matches local and Preview; production font header/type also match. Current Production image: `image_zTXWI65CqWKb88xZN0yKyg78ptiC`, digest `sha256:3d7a1e34c215e59fb64bff8c3b70233f2eaf22328365b61d0b81cb37c98332da`. Rollback retained: `dpl_8wtmxqjYVBDPtBYSfgSvC6fC86bj` (previous live source `73fc66273bb61d46a0dc7b72dd5f46031ca3c270`).

Before release, one actual-browser Production sample on the previous version: `/home` 4090ms, response wait 3917ms, app timing 64.85ms, final reported LCP 4700ms. These preserve the cold-delay evidence instead of treating the redesign as a backend fix.

## Actual browser checks after release

Confirmed real 1000-product Production catalog, homepage/product links, desktop detail, phone layout, and mobile filter open/close. No order/payment mutation. Console evidence saved under ignored `artifacts/redesign-after/production-*-timing.json`.

| Sample | Observed value |
| --- | --- |
| First browser reload after deployment: home API | 4565ms (MISS) |
| Same cold sample: header wait / app | 4397ms / 58.51ms |
| Same cold sample: final reported LCP | 6456ms; poor |
| Following reload, cached assets and CDN STALE home response | API 82ms, route 82.8ms, LCP 300ms |
| Open catalog from home | route 165.2ms; one network request shared with intent prefetch |
| Open product from catalog | route 375.2ms; one network request shared with intent prefetch |
| Reported INP during tested navigation | 16ms; no long animation frame reported for that interaction |
| Guest session on these samples | 380–385ms |

The warm response was explicitly CDN STALE, not a fresh database read; existing freshness budgets still apply. This is one browser and a few requests, not an FPS benchmark, mobile hardware test, field percentile or controlled before/after experiment. The first post-release sample is still slow. Screenshots: `artifacts/redesign-after/production-desktop.png`, `production-mobile.png`, `production-detail.png`, `production-mobile-filter.png`.

Final phone check: viewport 390px, document client/scroll width both 375px (desktop scrollbar), all four hero images loaded. No warning/error console entries on the tested Production flow. Vercel error/fatal runtime query for the deployment returned no matching logs in the inspected 15-minute window; this is a bounded observation, not a guarantee that no errors exist.

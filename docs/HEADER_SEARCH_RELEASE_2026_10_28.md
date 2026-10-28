# Header/search and email-state release — 2026-10-28

## Implemented

- Header is now two rows: logo/search/actions, then focused catalog navigation. Removed the top slogan band and duplicate voucher destination. Locale moved into desktop navigation. Existing order/chat/notification/seller/admin destinations remain reachable through a native account disclosure; mobile bottom navigation remains intact.
- Self-contained account disclosure works with keyboard and touch, closes on Escape/outside click/navigation, and restores summary focus on Escape. Long names truncate in the header and wrap in the panel. Empty cart badge is hidden and large quantities use `99+`.
- Search is a semantic search form/search input, 48px high. Keyboard focus is drawn once by the field wrapper; submit has its own independent focus. Enter and click preserve the existing URL/query behavior; typing does not request API data. No custom autocomplete, dependency or animation runtime was added.
- Account/profile explicitly explains when email delivery is unconfigured, instead of offering a misleading resend action. Forgot-password explains the missing service and disables submission while unavailable. Registration remains available and reports that verification mail has not been sent. When configuration is available, resend says the request was accepted for processing, not that delivery occurred; it does not change `verified`.
- Account reads public configuration concurrently with addresses. Register/forgot forms render immediately, then check email configuration in the background with a retry on failure; unavailable/unknown recovery is disabled. Auth forms guard repeated submission while processing, and configuration hydration cannot re-enable an in-flight submit. Cart and checkout startup request budgets are unchanged and remain covered by the existing browser regressions. Backend/auth/quote logic and schema were not modified.

## Validation before deployment

- Build, syntax, secret scan and diff whitespace checks pass. API/JS tests: 59/59. Full final Chromium suite: 21/21, including the prior 15 tests and six header/email regressions. The new cases hold configuration reads to verify immediate form paint, exercise retry, and hold recovery submission to check duplicate prevention.
- Responsive checks at 375/390/768/1280/1440/1920px: no horizontal document overflow, search fits, menu remains in the viewport, keyboard focus and dismissal work. Authenticated long-name/large-cart state, admin entry and configured/unconfigured email states are covered with isolated fake data and mocked provider availability, without sending mail.
- Supported-browser visual review used actual public product photos via a GET-only local preview. At viewport 1440px, measured header height 124.67px (old complete header about 174px), search height 48px. Phone and forgot-password notices inspected visually. Screenshots under ignored `artifacts/header-release`.
- Static design lint on `curated.css` and `tokens.css`: 0 FAIL, 0 REFLEX, 9 existing WARN (photo hover/compact commerce copy). Automated render tier not run; supported-browser visual inspection reported separately.
- Build main JS 121.26KB raw/39.05KB gzip, CSS 90.56KB/17.92KB gzip; previous release 118.17KB/38.12KB and 88.72KB/17.50KB. Optional motion chunk unchanged. These are transfer costs, not a field speedup claim.

## Deployment record

Application source: `c827e98e496bac1c0b0cfd76c2dd6a4e7c1aeffa`.

CI run: [40686576846](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40686576846), SQLite and PostgreSQL jobs both successful: 59 API/JS, 9 CTest, 9 container CTest and 21 Chromium. Previous source `ad3510a` passed both jobs (59 API/JS, 9 CTest, 9 container CTest, 19 Chromium), then was superseded by the immediate-paint/duplicate-submit improvements.

Final Preview: `dpl_D6yZz8SVP4xgsQd7tyaY6gD4sHDE`, `shoppe-4p5xpm4yl-hnquan.vercel.app`, READY; HTML, main JS and public metadata returned 200 through authenticated Preview access. Metadata correctly reports email unconfigured. Preview image `image_r2zOlEG3eNtkfblzbH6iTB5G8HRu` is retained, digest `sha256:0219611e94df1fea905585c2f3a8a490f20d65f5957ec10adfacd84ecab95d13`. Bundle matches local SHA256: `01b8a0dbbd1f2428d2884b2bc5cf562bf1418057a7b75a15ad088f313ff259e1`.

Intermediate Preview `dpl_H3ySnZw4o4t31vZtM5nnqwpWanu8` (source `ad3510a`) was READY and its HTML/main JS/metadata returned 200 with a matching bundle hash. The later form-paint source `f4c2583` Preview `dpl_9aVc4Z5Mi4K2YAZHevhkvg6G4HsA` was canceled before release to include the scoped hidden-state fix for the retry button. All final changes passed the six header/email regressions locally. The earlier Production build `dpl_8SCfeY4EQjezePU6GHoavz2HeQTV` was canceled before release to include the nonblocking form improvement. It was never assigned the live domain.

Registry was full (50 images). Removed only the agent-created documentation Preview image `image_PtYCsNNzPWZNJB3WNeZkQ4LDLQtj`, source `a317ba102391f2699f6712e7626dba6bfa8f8452`; confirmed its only deployment `dpl_HfoepAJvr2vvA1HBgwP6wTsDdYDN` is Preview and not a rollback candidate. Source remains rebuildable. Current/previous Production and rollback images are retained.

To retain the new Preview while building separate Production, also removed the old documentation-only Preview image `image_JT3PtRL4H6T3EKjD8ToJUwMLd63L`, source `a7f992031b276a500800fc485e70b296d4897891`. Its only deployment `dpl_5PBLJJb7AnJsKjXEMqYSwcKrzRhP` was confirmed Preview, not a rollback candidate. No Production image or database data was removed.

The intermediate agent-created Preview image `image_6Rn957Rv6hRyLq9wQ0u8I26iRRmq` (source `ad3510a`) was also removed after the final Preview passed; its Preview was superseded and the same-source Production attempt was CANCELED, not live or rollback eligible. The final Preview and all retained Production/rollback images remain.

Final Production: `dpl_4gyosSmbhzNwFD3NZfFrLHXSJmxQ`, `shoppe-qvtqjford-hnquan.vercel.app`, READY in Singapore with Production environment from the final CI-tested source. Confirmed `https://shoppec.vercel.app` alias points to this deployment. HTML and main JS return HTTP 200; main hash matches local/Preview. GitHub commit status `Vercel` reports `success: Deployment has completed`. Production image `image_BKVTzbzvhSvBUTGRtzYa9HdzFftc`, digest `sha256:62f7ca127a5c1d831e8b89bc7764097828011b676c88a002bcd393ea1699c27b`. Final Preview image remains present, now untagged, and rollback image/source remains unchanged.

Rollback before release: `dpl_GNkF6iHexNKaQHDGQBSEJCouNcw5`, source `98d7e52ea17e8d17ef355e0d10598566332b6015`, image `image_zTXWI65CqWKb88xZN0yKyg78ptiC`.

## Remaining limits

Resend key exists as a Production Secret; `EMAIL_FROM`/verified sender domain is still missing. This deployment does not turn on general customer email or drain the outbox using the limited test sender. See [Resend setup](RESEND_SETUP_2026_10_28.md). The prior delivered provider test is not proof of application verification delivery. No additional test email or real-account mutation was performed in this release.

The prior 4–5-second cold/dispatch samples remain a separate backend/platform limitation. Header height and interaction tests do not establish that cold starts or all lag have been eliminated.

## Post-release browser observations

Confirmed desktop header 124.67px at 1440px viewport, search 48px, one keyboard focus ring (input outline none; wrapper solid), desktop and 390px phone account disclosure, dismissal, and no horizontal document overflow. Real Vietnamese search `áo` returned 98 matches with 12 items on its first page. No real profile/order/payment/email mutation. The fixture login UI and route to profile also worked before release.

The direct Production forgot-password form appeared while metadata was still loading. Its route-render measurement was 2.6ms after JS initialization; this is **not** total page load time. Full-document LCP reported 2368ms, CLS 0.0053. The separate metadata request took 4379ms (application timing 9.17ms), demonstrating that the cold API did not block the form. After configuration arrived, the unavailable notice was correct, submit disabled, retry hidden, and metadata reported `development=false`, `email_configured=false`.

This session also retains slow samples: home SPA route 554.8ms and keyword-search route 3953.2ms. Reported document INP rose through 160/192/384 to 520ms (needs improvement). For the 520ms summary interaction, input delay was 0.2ms, processing 32.5ms and presentation delay 487.3ms. The 384ms span interaction reported a 365.1ms long animation frame with zero blocking duration. These measurements came from the supported in-app browser; the cause of the paint delay was not established, and cannot be attributed to backend wait or dismissed as tool overhead without further profiling. This is not a clean field FPS/percentile benchmark or evidence that all interactions are smooth.

No warning/error console entry appeared in this tested flow. Vercel error/fatal query found no matching logs in the inspected 15-minute window; this is bounded evidence, not a global absence-of-errors claim. Raw console timing and screenshots are under ignored `artifacts/header-release/production-*`.

The application commits were pushed and deployed. This release report is saved in the local workspace without a documentation-only push, to avoid creating another redundant/canceled Preview check. No code changes are pending outside the deployed application source.

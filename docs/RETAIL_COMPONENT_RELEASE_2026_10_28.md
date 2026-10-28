# Retail component release — 28/10/2026

Source: 13dcba170bf5fb9f8bb47d933383d79d14f86010. Plan: RETAIL_COMPONENT_REDESIGN_PLAN_2026_10_28.md.

Implemented the six requested areas: compact product purchase panel, readable product copy/care/catalog disclosure and reviews, explicit price filter, compact numbered pagination plus numeric jump, light grouped footer with mobile disclosure, removal of demo captions from product images/cards. Catalog/payment disclosure remains expanded in product information. No new dependency, service, polling, fabricated rating or payment method.

Validation: local syntax/build/secret checks, 59 API/JS tests and 24 Chromium tests passed. CI run 40706132240 passed both PostgreSQL and SQLite jobs; PostgreSQL logs confirm 24 browser tests and 9 C++ tests. Fake cart tests isolate cart revision and test actual variant/quantity wiring; no real cart/order/email mutation performed.

Visual review through the supported in-app browser: product purchase, lower description/reviews, desktop footer, phone product image/purchase bar and footer clearance, price controls and pagination. Screenshots: artifacts/retail-release/. The standalone design browser inspector was not run; supported CUA screenshots and repository responsive browser regressions were used. Static design lint is not clean (24 broad heuristic failures and 4 warnings): it treats existing star ratings, retail/form dividers, control borders and box-shadow:none/overlay styling as forbidden patterns. These are retained for the established retail system; this is not a zero-warning design-gate claim.

Preview: dpl_HWWm9XCDxENBDC7Bj4hoQkQnx77J / shoppe-lcgcnh398-hnquan.vercel.app READY; HTML and JS returned 200, /api/meta 200 with isolated development configuration. Production catalog demo ID returned 404 in Preview because the Preview dataset differs; this is not a Production finding. Preview JS SHA256 67d4978619cc5672f67916b15da0918536ec6eb018e2a070ac05d455737e2260 equals local dist. Preview temporary image image_dYy5qcCUketg9KuCqvUxkCfjgrR6 was removed after verification to allow the separate Production build under the 50-image limit. Previous temporary Preview image image_r2zOlEG3eNtkfblzbH6iTB5G8HRu was also removed; existing Production/rollback images retained. These Previews may require rebuilding for backend access.

Production READY and alias shoppec.vercel.app confirmed: dpl_BJACxi8ns6WmjuavrBHzFomsayNm / shoppe-n0jt9jfg9-hnquan.vercel.app. Immediate previous Production rollback is dpl_4gyosSmbhzNwFD3NZfFrLHXSJmxQ, source c827e98e496bac1c0b0cfd76c2dd6a4e7c1aeffa.

Performance limitation: this is a component redesign, not evidence that backend cold start/predispatch latency or previous INP observations are resolved. Optional motion remains lazy and no new 3D runtime/assets were added. Email delivery still needs a verified sender domain; do not claim that a Resend owner test validates application verification delivery.

Final verification: live HTML/JS HTTP 200; Production JS SHA256 equals local/Preview above. Image image_v2yD2qigrc7KZslPyIfWAp4wsqKH, digest sha256:0323afeab225625079c32afcbdc8bce057cfd1dba4dc1b6dc89fb63a4f44865c. Production meta development=false, email_configured=false. One meta GET TTFB 4.339396s / total 4.339633s; isolated sample does not establish distribution or cause.

Live browser: actual shirt detail loaded, no image demo caption, care disclosure opens; price filter 100000–500000 followed by page jump 2 preserved sort/min/max. Phone 390px current page 2/30 and no document horizontal overflow. No captured console warn/error; deployment error/fatal logs query at 14:42 UTC found none in a bounded 15-minute window. No claim that all runtime errors are absent. Agent tabs closed and viewport reset; local public GET-only preview stopped.

This release report is retained locally without a docs-only remote push to avoid a redundant deployment.


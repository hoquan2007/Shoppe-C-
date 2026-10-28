# Hồ sơ dispatch — đã gửi Vercel

Subject: C++ container in sin1: multi-second pre-invoke delay on zero-DB reads, including warm instances

Project: `prj_dGxjGIXYCRhdJPicCTAJHqHEA4Pc`, Production `https://shoppec.vercel.app`, container service `shoppe`, region `sin1`. Keep the existing plan/infrastructure; no paid add-on or keep-warm cron requested.

We observe slow first-byte responses where application work, socket queueing and socket writes account for only a few milliseconds. Public CDN HITs are usually fast; cache misses and private reads can show the delay.

Captured ingress traces (UTC 28 October 2026; see request timestamp within each platform ID):

| Request | Client | Edge root | Invoke starts after root | Invoke duration |
|---|---:|---:|---:|---:|
| `2mg6c-1793149685930-38ee0b1c4639`, zero-DB live | 1,059.98 ms | 1,008.134 ms | ~1,006 ms | 2.531 ms |
| `ds8fx-1793149683834-b17053cbd101`, cart | 1,021.96 ms | 970.331 ms | ~952 ms | 18.647 ms |
| `gm5pm-1793149692005-dbf38f706174`, checkout context | 1,994.97 ms | 1,935.331 ms | ~1,910 ms | 25.264 ms |

The context response above was from instance `b1c6251dd828184a`, age ~11,244.9 ms, request ordinal 13. Application request `f961cb98c9e12b36`: DB 22.3258 ms, pool 0.001103 ms, app 22.8661 ms, parsed request to completed socket write 23.20796 ms, write 0.020888 ms. This was not first-process initialization. Resolve-deployment/routing/cache spans explain about 7–9 ms, not the missing interval. Parent/child spans have not been added together.

New-instance trace `4xrlc-1793149450280-9c85bb4af6f5`: client 3,979.44 ms, edge root 3,740.698 ms, invoke starts ~3,739 ms after root, invoke duration 3.5485 ms. Subsequent warm request `85ndj-1793149454090-29c261c19359` took ~75.69 ms client-side.

Latest baseline before the mitigation release: platform request `hkg1::sin1::dk457-1793166403587-b287d010a8a1`, app request `c10f8e5433e9a62f`, live GET 4,661.444 ms, instance `ba588c2d4c7026fd`, age 31.963318 ms, app 0.819774 ms, parsed request to headers 1.766586 ms. This is a new-instance sample, not a controlled multi-cold p95.

Authenticated project configuration read confirms `resourceConfig.fluid=true` and `functionDefaultRegions=[sin1]`, with Node 24.x. No compute setting was changed. Metrics TTFB/duration queries require Observability Plus; no add-on was enabled.

After the mitigation release, public catalog MISS on a new instance is still 4,712.935 ms: `hkg1::sin1::t6lkl-1793168411560-97ff7ff3c381`, app request `4d40de7f370d3eb7`, instance `12da7e8f1f19817f` age 30.708 ms, app 184.784 ms. Guest session now uses a separate small native Node handler; cookie-bearing reads and catalog still use the C++ container. This is mitigation, not proof the dispatch issue is resolved.

Previously tested: client H1 reuse/new vs H2, origin keep-alive vs opt-in Connection: close, bounded worker queue, socket completion instrumentation, DB pool/SQL measurements. Connection close did not remove the tail. No evidence justifies increasing pool/workers or disabling TLS. No always-warm guarantee assumed.

Please help identify the uninstrumented pre-invoke scheduling/container-lifecycle interval for these requests, whether a platform issue or supported routing/runtime setting explains it, and how to validate a fix on the same project/region without a paid infrastructure change.

Artifacts available locally: sanitized OTEL spans and timing/request metadata in the reports linked below. No credentials, session cookies, CSRF, user/cart/address/order bodies or database contents should be attached. The trace-cookie diagnostic may influence routing; these are diagnostic samples, not field p95.

References: [ingress investigation](FIRST_BYTE_EXECUTION_RESULT_2026_10_28.md), [mitigation and release measurements](PUBLIC_DISPATCH_MITIGATION_2026_10_28.md).

Status: **Vercel accepted the feedback**, sau khi người dùng đồng ý gửi hồ sơ. Kênh gửi: plugin Vercel, công cụ `submit_feedback`. Xác nhận được lưu lúc **13:36 ngày 28/10/2026 (UTC+7)** (`2026-10-28 06:36:47 UTC`). Response: `{"success":true,"message":"Vercel accepted the feedback."}`.

Nội dung gửi gồm hồ sơ kỹ thuật ở trên và link GitHub tới hai báo cáo; không gửi cookie, credential, private body hoặc file dữ liệu. Receipt local: `artifacts/vercel-dispatch-feedback-receipt-2026-10-28.json`.

Công cụ không trả ticket ID, URL theo dõi, thời gian phản hồi hoặc cam kết xử lý. Đây là xác nhận Vercel đã nhận báo cáo lỗi qua kênh feedback, **không phải xác nhận đã mở support case hoặc đã sửa dispatch**. Không tự gửi lại để tránh trùng báo cáo.

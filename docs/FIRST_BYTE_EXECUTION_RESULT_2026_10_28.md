# Kết quả điều tra first byte và cold start — 28/10/2026

Tiếp nối [kế hoạch](FIRST_BYTE_AND_COLD_START_PLAN_2026_10_28.md). Giữ Vercel + Supabase, không nâng gói/tạo dịch vụ mới, không đổi schema hoặc chuyển secret.

## Thay đổi

- `TracedServer`/`TracedStream` trong repo bổ sung số byte/lần write, thời điểm bắt đầu/kết thúc write và lỗi. Tiếp tục dùng request parser, buffered stream, readable hint, keep-alive loop và graceful close của cpp-httplib v0.61.0. Không sửa vendor header/checksum. Adapter dành cho HTTP server hiện tại; TLS vẫn kết thúc ở Vercel.
- Nối `request`, `http_headers_ready`, `http_write_complete` bằng request/instance ID và connection ordinal. Write hoàn tất nghĩa là tầng socket nhận dữ liệu, chưa chứng minh client đã nhận. `request_success` có thể còn bao gồm xử lý request/drain, khác `write_success`.
- Thêm `listen_ready` với config, database verify, server setup và tổng process→listen; mốc `startup` cũ chưa phải listen-ready. Chưa đo platform trước process bằng các mốc này.
- Route log dùng vocabulary cố định, bỏ ID/query; không lưu credential, cookie, CSRF hoặc response private. Log vẫn bounded/asynchronous.
- Runner `scripts/latency-probe.mjs`: tuần tự, tối đa 30 mẫu/nhóm, shuffle có seed, H1 reuse/new và H2 reuse, giữ lỗi và mẫu >1 giây; không trộn request khởi đầu vào warm summary. Public control không gửi cookie/CSRF; private chỉ login/logout tạm, GET đọc.
- `/api/live?connection=close` là đối chứng transport không DB/private-no-store; chỉ chế độ này trả Connection: close ở origin. Socket policy của API nghiệp vụ giữ nguyên. Không suy protocol client→CDN thành protocol CDN→container.
- Khi chuyển route, nội dung cũ có `inert` tới khi route hiện tại hoàn tất; header/navigation vẫn dùng được. Ngăn click nút của sản phẩm/trang cũ khi URL đã đổi và request còn chờ. Route cũ bị abort không được mở khóa nội dung của route mới.

## Kiểm chứng mã nguồn

- Local: 52/52 JavaScript/API tests; CTest 9/9. Test stream bao gồm body nhỏ/lớn, HEAD, chunked, reuse/ordinal, lỗi write và observer ném exception.
- Runner test kiểm public credential omission, lỗi 503 được giữ lại, không log secret/body, logout đúng một lần và request khởi đầu không lọt warm summary.
- Lượt test local khởi chạy sớm khi linker còn ghi executable đã báo EFTYPE; chờ build xong và chạy lại API đạt. Chromium local thiếu binary, không tính các lỗi launch đó là regression ứng dụng hoặc browser pass.
- CI instrumentation `f7603c3`: [40610147279](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40610147279), cả hai job success.
- CI source ứng dụng `88abbcb2b9609f3f4abf56d2a537ade457979a1f`: [40610895907](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40610895907), SQLite/PostgreSQL success, 52 tests, CTest 9/9, Docker Release CTest 9/9, **7 Chromium tests passed (5,1 giây)**. Kịch bản mới giữ request cart pending, kiểm inert, rồi điều hướng qua header và kiểm route hiện tại được mở khóa.
- Preview `dpl_HYRKG2fCTWCnnz8NDv6RGwyG63y7` READY, source `88abbcb`; dùng cấu hình giả. Production được build riêng, không promote Preview giả.

## Baseline cùng ngày, source Production cũ `67c5319`

### H1 private, artifact `infra6-before.json`

423 request gồm origin khởi đầu, login, 420 mẫu đọc và logout, tất cả HTTP 200. Request khởi đầu live 4.001 ms, app ~0,83 ms, instance age ~34 ms; đây là mẫu instance mới, không phải phân bố cold 10 lần. Median H1 reuse: live ~997 ms, summary ~1.005 ms, cart ~1.015 ms, context ~1.010 ms; HTML ~57 ms. Context là tài khoản admin/giỏ rỗng, không đại diện buyer checkout-ready.

Runner ban đầu đang chạy khi bổ sung phase separation/public credential omission. Artifact đã tách request đầu khỏi warm live summary và ghi rõ public control của lượt này còn có same-origin audit cookie/CSRF sau login. Không dùng nhóm public này để nghiệm thu cache như browser credentials: omit. Private/live giữ nguyên mẫu; lượt đo lại dưới đây dùng runner đã sửa. Script hiện tại khác revision đang chạy của artifact đầu, đã ghi hạn chế thay vì giả vờ đó là cùng phép đo.

### Đối chứng H2 guest và nhóm xen kẽ

Một lượt H2 guest riêng: live median ~79 ms/p95 ~122 ms, guest session median ~81 ms/p95 ~117 ms. Không kết luận từ lượt riêng này rằng H2 đã chữa lag.

Sau đó đo **30 mẫu mỗi mode/endpoint**, xen kẽ H1 reuse/H1 new/H2 reuse, cùng runner và một phiên admin. 363 request gồm setup/cleanup, cùng source cũ trong suốt cửa sổ (alias vẫn là `dpl_98Yrizi1AaHEJY7eTQdidEfuZ3gB`). Cùng một instance `cecf9a7173301d67` trong artifact. Tất cả HTTP 200.

| Nhóm | Median | p95 lab sơ bộ | >1 giây/30 |
|---|---:|---:|---:|
| Summary H1 reuse | 104,5 ms | 1.070,0 ms | 6 |
| Summary H1 new | 215,4 ms | 1.061,5 ms | 7 |
| Summary H2 reuse | 121,7 ms | 1.086,1 ms | 8 |
| Live H1 reuse | 104,5 ms | 1.055,1 ms | 7 |
| Live H2 reuse | 107,3 ms | 1.047,9 ms | 6 |
| HTML H1 reuse | 58,2 ms | 96,1 ms | 0 |
| HTML H2 reuse | 55,1 ms | 102,2 ms | 0 |

Trong source cũ, query `connection=close` chưa có tác dụng; nhóm đó là control không đổi hành vi, chưa phải thử nghiệm close thực. Artifact `infra6-before-interleaved.json` giữ đầy đủ cả nhóm này.

Kết luận baseline: tail ~1 giây xuất hiện ở cả H1/H2 và cả live không DB. Median thay đổi nhiều giữa các cửa sổ dù cùng code; vì vậy không dùng so trước/sau cách thời điểm để công bố phần trăm tăng tốc do code.

## Phát hành và phép đo sau phát hành

Production **`dpl_AbbP99t5VNJ1kNkPzi1Bi3q2QhbZ` READY**, source **`88abbcb2b9609f3f4abf56d2a537ade457979a1f`**, URL `https://shoppe-dix3tab9l-hnquan.vercel.app`, region sin1. Alias `https://shoppec.vercel.app` đã xác nhận trỏ đúng deployment. Bundle `/assets/index-BGwNqgzj.js` khớp local, SHA-256 `3dcf16e2705519653ec827229249a0e505b296058c25550a19a022db32e163dc`.

Không promote Preview giả. Deployment instrumentation trung gian `dpl_9ygj9goCVtYgh3EZUTzTHST2jDFC` đã hủy khi còn queued để giữ source cũ cố định trong phép đo đối chứng. Rollback toàn đợt: deployment Production trước đó `dpl_98Yrizi1AaHEJY7eTQdidEfuZ3gB`, không có migration cần đảo.

### Đo private sau release

Artifact `infra6-after-private.json`: 423 request, tất cả HTTP 200, login/logout tạm thành công; 30 mẫu/endpoint/mode. Context vẫn là admin giỏ rỗng. Private/no-store được giữ nguyên.

| Nhóm H1 reuse | Median | p95 lab sơ bộ | >1 giây/30 |
|---|---:|---:|---:|
| Session + summary | 924,7 ms | 1.090,9 ms | 14 |
| Cart | 138,8 ms | 1.893,4 ms | 12 |
| Checkout context | 697,6 ms | 1.112,7 ms | 11 |
| Live không DB | 459,8 ms | 1.074,4 ms | 11 |
| HTML tĩnh | 59,8 ms | 132,9 ms | 0 |

Không dùng median cart thấp hơn để tuyên bố đã sửa tail: max cart ~2.007 ms, p95 vẫn chưa đạt. Không coi chênh lệch trước/sau là cải thiện do instrumentation. Catalog reuse có p95 toàn nhóm ~149 ms nhưng gồm nhiều cache state; chưa phải nghiệm thu field/public HIT p95. Mẫu đầu live ~836 ms có instance age ~22,5 giây, **không phải cold được xác minh**.

### Ghép client với write trace

200 write event unique thu được ở hai cửa sổ log; ghép được **193 origin MISS**, trong đó **70 mẫu >1 giây**. Loại HIT/STALE khỏi phép ghép vì request ID/Server-Timing có thể thuộc lần tạo cache cũ. Socket write lớn nhất trong nhóm ghép ~**1,48 ms**; không có lỗi write trong tập này.

Ví dụ summary request `fba10971011c4895`: TTFB **1.034,9 ms**, body **0,29 ms**, request parse→write end **14,75 ms**, socket write **0,022 ms**. Live request `2ebd73d11d40979d`: TTFB **1.007,7 ms**, parse→write end **1,00 ms**, write **0,63 ms**, db=0. Không cộng các span lồng nhau hoặc quy phần dư thành SQL.

`listen_ready` của hai instance Production đầu có process→listen **46,9/75,4 ms**, phần DB verify **45,7/74,2 ms**. Các mốc này vẫn bắt đầu sau khi process đã chạy; không đo toàn bộ chuẩn bị container.

### Đóng kết nối không chữa tail

Artifact `infra6-after-interleaved.json`: 363 request setup/đọc/cleanup, tất cả HTTP 200; 30 mẫu mỗi endpoint/mode. Cùng cửa sổ, cùng source mới:

| Live | Default p95 | Origin Connection: close p95 |
|---|---:|---:|
| H1 reuse | 1.035,7 ms | 1.064,5 ms |
| H1 new | 1.060,9 ms | 1.047,9 ms |
| H2 reuse | 1.078,0 ms | 1.040,3 ms |

Mỗi nhánh vẫn có 5–9 mẫu >1 giây/30. Chưa có bằng chứng giảm tail đáng kể; **không áp close cho API nghiệp vụ**, không tăng worker/pool, không ép H2 như một bản sửa đã chứng minh. Endpoint chẩn đoán chỉ ảnh hưởng `/live` khi có query opt-in.

Local fixture tương ứng: 241 GET, mọi HTTP 200; live p95 ~2,46–2,87 ms và guest session ~2,96–3,22 ms, không mẫu >1 giây. Đây không phải A/B overhead với binary cũ hay benchmark PostgreSQL Production. Đã dừng fixture.

## Khoảng trống nền tảng

Read-only trace lookup cho request cũ trả `trace_not_found`; request không tự có OTEL trace nếu chưa bật thu trace cho request đó. Metrics schema đọc được, nhưng query endpoint legacy qua connector trả HTTP 400 kể cả khi đã đối chiếu scope với CLI source. Không nâng Observability Plus hoặc đổi chính sách tracing để vượt qua giới hạn công cụ.

Runtime Node REPL không kết nối được HTTP. Sau đó đã dùng HTTPS runner qua exec và luồng trace cookie chính thức của CLI: token tạm scoped đúng hostname nhập qua **stdin tắt echo**, không argv/file/log; binding xóa sau nhập, process kết thúc sau phép đo. Không nâng gói hoặc bật addon.

**Đã thu được OTEL trace ingress.** Một request trace tới live mất **3.979 ms** ở client, cùng instance mới `e551ce7da5eded23`; edge root **3.740,7 ms**, resolve deployment ~8,38 ms, route ~1,97 ms, cache ~1,02 ms; span `Invoke Function` **3,55 ms**, bắt đầu khoảng **3.739 ms sau edge root**. Khoảng chờ lớn nằm trước invoke trong trace; chưa có child span phân giải hết phần chuẩn bị/scheduling/container nên không gọi toàn bộ đó là thời gian khởi tạo C++.

Request warm kế tiếp cùng instance: client **75,7 ms**, edge root **24,8 ms**, invoke **2,33 ms**. Đây là vài mẫu trace có cookie chẩn đoán, không phải field p95 hay 10 cold sau idle đã kiểm soát. Dữ liệu lưu chỉ span/timing/ID, bỏ thuộc tính account/session. Artifact `infra6-otel-0.json`, `infra6-otel-1.json`.

### Đã bắt được trace warm chậm

Một lượt thêm 30 GET có trace trên static/live/summary/cart/context, xen kẽ socket mới/reuse và một số khoảng nghỉ 150 ms; dùng phiên admin tạm, đã logout. Tất cả HTTP 200. Chỉ 6 mẫu/endpoint nên không dùng để tính p95 ổn định; mục đích là bắt mẫu chậm có trace. Không tạo/sửa giỏ, đơn, địa chỉ, thanh toán, email hoặc OAuth.

| Request trace | Client | Edge root | Invoke bắt đầu sau edge root | Invoke duration |
|---|---:|---:|---:|---:|
| Live `2mg6c-1793149685930-38ee0b1c4639` | 1.060,0 ms | 1.008,1 ms | 1.006 ms | 2,53 ms |
| Cart `ds8fx-1793149683834-b17053cbd101` | 1.022,0 ms | 970,3 ms | 952 ms | 18,65 ms |
| Context `gm5pm-1793149692005-dbf38f706174` | 1.995,0 ms | 1.935,3 ms | 1.910 ms | 25,26 ms |

Context ở trên ghép đúng application request `f961cb98c9e12b36`: instance age **11.244,9 ms**, request thứ **13**, pool **0,0011 ms**, DB **22,33 ms**, app **22,87 ms**, parse→write end **23,21 ms**, socket write **0,021 ms**. Đây không phải thời gian khởi tạo process của request đầu. Resolve deployment/route/cache cộng khoảng 7–9 ms; vẫn thiếu span chi tiết bên trong khoảng chờ trước invoke. Không cộng parent/child span như các phase nối tiếp.

**Kết luận cho các mẫu đã trace:** phần chờ lớn xuất hiện ở đường dispatch trước `Invoke Function` của nền tảng; không có bằng chứng query, pool hoặc socket write của ứng dụng giải thích ~1–2 giây đó. Điều này không khẳng định mọi lượt lag trên mọi mạng đều cùng nguyên nhân. Cần kiểm tra dispatch/container lifecycle cùng Vercel hoặc một thử nghiệm runtime/routing được hỗ trợ và có đối chứng; chưa có cơ sở đổi pool, index, TCP hoặc TTL để giải quyết khoảng chờ này.

Artifact `infra6-traced-private.json`, `infra6-warm-otel-0.json` đến `infra6-warm-otel-2.json` chỉ giữ metadata/timing; không giữ cookie/CSRF/body. Không gửi hồ sơ hay mở ticket thay người dùng. Metrics connector legacy vẫn chưa trả được kết quả; thành công của OTEL trace không biến lỗi metrics thành một phép đo đạt.

## Giao diện Production cuối

Search `tai`: 12 card/35 kết quả, không ảnh hỏng, desktop 1.265 px không overflow ngang. Khi click sản phẩm, quan sát trực tiếp `inert=true`, `aria-busy=true`, progress hiện; sau tải/Back thì inert và busy/progress được gỡ đúng. CI còn kiểm riêng tình huống điều hướng qua header khi request cũ vẫn pending.

IAB trên bundle mới vẫn có search API **1.992 ms**, thời gian chờ header ~1.896,7 ms, app ~98,7 ms; guest session **4.004 ms**, db=0/app ~0,115 ms. LCP lớn nhất trong document này **2.920 ms**, CLS ~0,00235, một mẫu INP **24 ms**. Chi tiết có lượt route ~141 ms; Back sau khi cache đã hết fresh ~257 ms và có network fetch. Không gọi lượt Back này là memory-hit hoặc hủy request còn pending: response detail đã hoàn tất trước Back.

Trang cuối có 12 card, không còn busy/progress/inert; không warning/error trong log console đã thu. Artifact `infra6-production-browser.json`, ảnh `infra6-production.png`. Đây là IAB desktop, không phải Chrome/Android vật lý hoặc field p75. Đã đóng tab thử; fixture localhost đã dừng.

## Chốt nghiệm thu và bước còn mở

- **Đã hoàn thành:** đo socket write/listen-ready; runner đối chứng; regression hai DB/container/browser; phát hành đúng source; kiểm alias/hash; ghép client→app→write→ingress trace; guard nội dung cũ khi chuyển route.
- **Không đạt mục tiêu hết lag:** private warm p95 ≤500 ms vẫn chưa đạt; chưa có 10 cold sau idle được kiểm soát hoặc field p75. Mẫu trace gần 4 giây vẫn tồn tại. Không tuyên bố giảm cold nhờ cắt vài ms app startup.
- **Thử nghiệm không giữ cho nghiệp vụ:** close socket không giảm tail, H2 không loại tail, chưa tăng pool/index hoặc thay runtime theo phỏng đoán. Public SWR/prefetch nâng cao và read model không triển khai trong đợt này vì không giải thích được phần chờ trước invoke và cần contract/dataset riêng.
- **Ưu tiên tiếp:** dùng ba request trace warm ở bảng trên để phân giải dispatch/lifecycle tại cùng project/sin1; nếu có cấu hình hoặc bản sửa được hỗ trợ, thử riêng với cùng runner trước khi đổi Production. Giữ constraint không dịch vụ/gói trả phí mới; không bật keep-warm cron hoặc Observability Plus.
- Chuẩn bị hồ sơ gồm source/deployment, route, request/trace IDs, duration và thời điểm UTC; liên hệ hỗ trợ là bước gửi ra ngoài, chưa thực hiện. Không gắn nhãn “đã sửa toàn bộ” cho đợt này.
- Quét runtime error/fatal cửa sổ 15 phút sau phát hành không có log phù hợp. Đây là cửa sổ hữu hạn, không bảo đảm không có lỗi ngoài cửa sổ đó.

Nguồn kỹ thuật đối chiếu: [Vercel CLI trace flow](https://github.com/vercel/vercel/blob/main/packages/cli/src/commands/curl/trace.ts), [Container Runtime](https://vercel.com/docs/functions/runtimes/container). Chính sách scale-in vẫn có thể tạo cold sau idle; không tạo cron ping.

# Kết quả thực thi tối ưu trong hạ tầng hiện có — 26–27/10/2026

Cập nhật kiểm tra sau phát hành: **27/10/2026**. Đã phát hành phần tối ưu chính; **chưa nghiệm thu hết lag** vì warm private vẫn có median quanh một giây và browser vẫn có lượt chờ vài giây trước first byte.

Tiếp nối [kế hoạch](EXISTING_INFRA_OPTIMIZATION_PLAN_2026_10_26.md). **Source phát hành cuối `67c5319bdd5bf41db9ab7c37e57d2b9f2854fd8d`.** Source nghiệp vụ nằm trong `a985cf8`, mốc đo request không tính socket idle trong `b31b204`, bước chuẩn bị CI trong `cc92bce`; bản cuối chỉ sửa log request abort. Vẫn dùng Vercel + Supabase, không tạo dịch vụ trả phí mới, chuyển secret hoặc đổi schema.

## Đã thực hiện

| Hạng mục | Thay đổi |
|---|---|
| P0 đo từng phase | Debug log resource có DNS/connect/TLS, chờ header, body, protocol, bytes; API log phân biệt memory/shared/network/refresh/retry/abort và freshness. Bỏ query/ID khỏi route log, không log body/input/cookie. |
| Mốc backend | Thêm `request_to_headers` tính từ request đã parse; `socket_to_headers` cũ vẫn gồm thời gian idle nếu socket reuse. Logger tiếp tục là headers ready, không phải hoàn tất gửi socket. |
| P1-A canonical | Allowlist public catalog/meta/home/detail; bỏ debug/tracking, giữ filter/page/review pagination; giữ chuẩn hóa default/sort đã có. |
| P1-A freshness | Memory TTL trừ Age và tuổi generation theo Date; stale không được cộng thêm 15 giây. Response private/no-store không tái dùng trong public memory. Metadata dùng cùng freshness budget. |
| Invalidation | Mutation catalog tăng epoch trước và sau response; response cũ không tái nạp cache. Tab thao tác dùng generation query `_fresh` giới hạn 30 giây để đọc sau commit tránh entry CDN trước đó; đó là key public có chủ đích, không chứa identity và không purge toàn CDN. Tab khác vẫn theo TTL 15+15 hiện có. |
| P1-B bootstrap | `/auth/me?include=cart` trả quantity/revision, không gửi cart lines. Header lấy summary tới khi thật sự cần giỏ. Startup public signed-in giảm từ 3 API theo code xuống 2; không tải cart chỉ để hiện badge. |
| P1-B checkout | `/checkout/context` GET private/no-store đọc addresses/cart/lines/meta trong cùng snapshot; frontend chờ mọi write giỏ, đọc lại nếu revision thay đổi, rồi gọi quote riêng. Không tạo order trong context. |
| Deadline | GET tối đa một retry nhưng dùng chung hạn tổng 12 giây; không thành hai lần chờ 12 giây. Route abort không retry, mutation vẫn gửi một lần. |
| P1-C scheduling | Request route bắt đầu trước khi đợi feedback paint; chỉ commit DOM sau paint và kiểm route/version. Session vẫn là điều kiện trước fetch private. |
| P2-A backend | Guest `/auth/me` không cookie trả anonymous không DB; meta/session/health bỏ probe expiry không liên quan. `/health` vẫn kiểm DB qua transaction; `/live` mới chỉ kiểm process, không DB. Catalog/cart/context/quote/checkout giữ expiry/restock. Pool và lock không đổi. |

Quote ký, idempotency, CAS/rebase giỏ, kiểm quyền và CSRF giữ nguyên. Không tăng TTL CDN hoặc cache private để đạt số đo đẹp. Không thêm dependency mới.

## Kiểm chứng

- Local source cuối: npm **51/51**, CTest **8/8**; syntax/build/secret scan qua. Lượt API đầu trong sandbox không gọi được localhost; chạy lại ngoài sandbox đạt. Một lần link Windows bị binary fixture đang mở khóa; đã dừng đúng fixture và build/test lại thành công.
- CI `a985cf8`: [40342708607](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40342708607), SQLite và PostgreSQL success, container Linux và Chromium success. Bộ browser gồm 6 kịch bản, thêm canonical/Back và startup summary/checkout context.
- CI `b31b204`: [40343609819](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40343609819), PostgreSQL/container/Chromium success; job SQLite chậm ở apt trước test. Bổ sung guard kiểm pkg-config/client đã cài, giới hạn 5 phút cài gói, 10 phút cài Chromium, 25 phút/job. Không bỏ các bước test để làm CI xanh.
- CI commit phát hành `cc92bce`: [40345971716](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40345971716), **SQLite và PostgreSQL đều success**, gồm container Linux và Chromium. Cả hai job đã qua bước prerequisite mới và không bỏ test.
- API regression thêm: guest/liveness không SQL, context cần login và không cache shared, summary khớp cart revision/count, context khớp giỏ/địa chỉ của user và không tạo đơn, public generation headers.
- Unit cache kiểm tra tracking/debug, review pagination, Age gần hết hạn/stale, timestamp generation khi thiếu Age, epoch cũ, generation sau mutation, tổng deadline và private/no-store.
- Browser fixture thủ công: đăng nhập buyer giả, thêm một món, vào checkout hiện **925.000 ₫**; một context rồi một quote; không bấm Đặt hàng. Quote response riêng ~7 ms, route ~71 ms trong lượt local này, không suy rộng sang Production. INP automation vẫn có mẫu 1.168 ms với long-frame blocking 0, không coi là đã nghiệm thu thiết bị thật.
- Bundle frontend `index-DrtcP2Qx.js`, 114,29 KB / 36,76 KB gzip. Tăng khoảng 2,4 KB raw vì phép đo/guard, không tuyên bố giảm bundle.

## Đo local

1.600 request trên SQLite fixture (1.000 user giả inactive, catalog 12 sản phẩm), 100 mẫu/endpoint ở concurrency 1 và 10. Đăng nhập/setup giỏ chỉ trên fixture, quote chỉ đọc; số đơn trước/sau không đổi. Không phải field/Production/cold benchmark.

| Endpoint | p95 concurrency 1 | p95 concurrency 10 |
|---|---:|---:|
| Live | 1,12 ms | 7,40 ms |
| Session + summary | 1,89 ms | 7,36 ms |
| Checkout context | 3,43 ms | 34,41 ms |
| Health readiness | 1,54 ms | 7,19 ms |
| Catalog | 5,28 ms | 39,34 ms |
| Cart | 1,65 ms | 10,47 ms |
| Editor | 4,71 ms | 36,94 ms |
| Quote | 2,81 ms | 30,05 ms |

Socket reuse 98/100 ở c=1 và 90/100 ở c=10 (server giới hạn 64 request/socket). Đã dừng fixture sau benchmark, không còn listener thử ở 15442/18147/18149/18146.

## Phát hành và Production

Preview commit phát hành `dpl_CqxXzHCA4RmP64fcKPET5gvUcK4c` READY. Preview source ứng dụng `b31b204` trước đó xác nhận guest session db=0, private/no-store, catalog có generation/TTL headers; cấu hình giả/tắt tích hợp. Không promote fixture Preview thành Production.

Production được tạo riêng từ đúng commit `cc92bce` sau khi CI đạt: `dpl_5bBDGD1zfdsSeFXTUQwNT9fRhUjA`, URL `https://shoppe-l647fyoro-hnquan.vercel.app`, region `sin1`. Rollback đã xác định: `dpl_944oxJrovLcHZRA5Qe5QYvPXdsXT`.

**Đã xác nhận READY và alias `https://shoppec.vercel.app` trỏ đúng deployment trên.** Bundle `index-DrtcP2Qx.js` khớp byte với dist tại thời điểm probe, SHA-256 `2408da0ffbf6ae7b213c50f6a84513c2007f1ad69edab26b7f4ba574ee99a644`. Toàn bộ request probe HTTP 200, catalog 1.000 sản phẩm/12 card. Phiên quản trị HTTP tạm đã logout; không gửi request tạo/sửa đơn hoặc thanh toán. Không có runtime error cluster trong cửa sổ 1 giờ được kiểm tra; log error/fatal của deployment trong cửa sổ 15 phút cũng không có kết quả.

### Số đo Production

Đối chứng cũ kết thúc **22:10 ngày 26/10**, phép đo mới kết thúc **13:13 ngày 27/10**, cùng runner/cách đo HTTP tuần tự nhưng **khác thời điểm và điều kiện mạng có thể thay đổi**. Không phải A/B hoặc field p95; không dùng chênh lệch này để khẳng định tỷ lệ cải thiện do code. Nhóm private mới có thêm summary/context xen kẽ nên cũng khác chuỗi endpoint của baseline.

| Phép đo | Baseline `c7eca88` | Sau tối ưu `cc92bce` |
|---|---:|---:|
| Health đầu tiên, một mẫu | 4.424,1 ms | 4.106,1 ms |
| Health warm, median 30 mẫu | 137,1 ms | 94,8 ms |
| Catalog MISS / HIT, mỗi loại một mẫu | 174,8 / 59,6 ms | 159,2 / 93,0 ms |
| Session private, median 10 mẫu | 981,6 ms | 1.037,0 ms |
| Cart private, median 10 mẫu | 1.044,8 ms | 1.020,3 ms |
| Admin editor, median 10 mẫu | 1.129,8 ms | 1.108,7 ms |
| Session + summary, median 10 mẫu | Chưa có endpoint summary | 980,5 ms |
| Checkout context, median 10 mẫu | Chưa có context | 1.036,9 ms |

Live không DB một mẫu 85,7 ms, app 0,074 ms. Context đo bằng tài khoản admin với giỏ rỗng; không coi là thời gian quote/checkout của giỏ đầy trên Production. Context app trong mẫu điển hình ~19 ms, summary ~12 ms; các mẫu private cùng instance, không có bằng chứng pool wait bão hòa. Cart vẫn dao động 90,9–1.159,3 ms, editor 165–1.159,7 ms. Detail/shop/search lần đầu lần lượt 960,4 / 1.023,2 / 1.073,8 ms. Các mục tiêu private warm p95 ≤500 ms và hết cold chưa đạt.

Lợi ích đã được kiểm chứng độc lập với jitter: signed-in startup 2 API, không GET cart chỉ cho badge; checkout một context + một quote thay các GET riêng; query debug/tracking không tạo key mới trong CI browser; dữ liệu stale không được kéo dài tuổi trong memory. Không suy ra các lợi ích này bảo đảm mọi route dưới 500 ms.

### Giao diện Production và khoảng trống còn lại

Search `tai` trả 35 kết quả, 12 card; chọn giá tăng dần hiện sản phẩm đầu 500.000 ₫; Back giữ query và lựa chọn sort. Chi tiết không có ảnh hỏng. Viewport thử 390×844 có bề rộng nội dung 375 px (phần còn lại là scrollbar), scrollWidth bằng clientWidth; đã reset về viewport mặc định 769 px. Đây là kiểm tra responsive, không phải Android vật lý.

Document IAB mới ghi search 3.651,1 ms, request products 3.647,3 ms; HTTP/2, chờ header ~3.551,5 ms, body ~1,3 ms, app 86,72 ms. Guest session có db=0 nhưng request 3.462,1 ms, phần chờ header ~3.460,8 ms. Một lượt Back sau khi cache hết fresh có route 5.160,8 ms, app 88,42 ms; không bỏ mẫu xấu. LCP document tối đa thu được **4.812 ms (poor)**, CLS ~0,00355; một mẫu interaction 304 ms. Không có warning/error ứng dụng trong tập console đã thu.

Trong một lượt điều hướng quá nhanh, resource bị abort có responseStart=0 nhưng responseEnd là timestamp tuyệt đối; log debug bản `cc92bce` vì vậy ghi sai body ~161 giây. Đây là **lỗi phép đo**, không phải request tải body 161 giây. Đã loại mẫu đó khỏi kết luận và sửa ở commit `67c5319bdd5bf41db9ab7c37e57d2b9f2854fd8d`: các phase chưa có response header trả null. Bundle sau sửa `index-DEtfgrvM.js`, 114,38 KB / 36,78 KB gzip; chỉ đổi debug instrumentation, không đổi API/cache/nghiệp vụ. [CI 40460445827](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40460445827) **cả SQLite và PostgreSQL success**, gồm Chromium và container; deployment bản sửa phép đo được bổ sung sau khi kiểm tra alias/hash.

Phần chưa quan sát đủ là đường từ client qua CDN/ingress và từ headers-ready của app tới response thực sự đến client. HTTP/2 vẫn có mẫu xấu, nên không kết luận chỉ cần đổi protocol là hết lag. Bước điều tra tiếp theo trong hạ tầng hiện tại: đo hoàn tất socket write hoặc trace ingress có cùng request ID, đối chứng trên Chrome foreground với điều kiện mạng cố định; giữ riêng cold/warm/HIT/MISS và các request abort. Không tự quy lỗi cho Supabase, tăng pool hoặc tăng TTL để che phần chờ này.

### Release cuối sau sửa phép đo

Commit cuối **`67c5319bdd5bf41db9ab7c37e57d2b9f2854fd8d`**, Production **`dpl_98Yrizi1AaHEJY7eTQdidEfuZ3gB` READY**, URL `https://shoppe-rdjg071q1-hnquan.vercel.app`; alias `https://shoppec.vercel.app` đã xác nhận trỏ đúng deployment. Frontend `index-DEtfgrvM.js` khớp byte với local, SHA-256 `3f9fec530dca16c539576d4382bc5ff9f9df177faf34f0b5e25a1e42385dcc70`.

Release smoke cuối gồm 7 GET không cookie/login hoặc mutation: tất cả HTTP 200, guest anonymous + summary 0, catalog 1.000/12. Đây là kiểm tra phát hành, không lặp lại benchmark private đầy đủ vì code API/nghiệp vụ không đổi so với `cc92bce`. Các số đo private trong bảng trên được giữ đúng theo source/thời điểm ban đầu. Quét runtime error cửa sổ 15 phút sau release cuối không ghi nhận cluster lỗi.

Smoke cuối còn ghi nhận catalog HIT 614,4 ms và live 597,7 ms trong từng mẫu đơn lẻ; vì vậy cũng chưa nghiệm thu public HIT p95 ≤200 ms. Guest summary một mẫu 75,3 ms. Không bỏ mẫu chậm chỉ vì mẫu HIT trước đó đạt 93 ms.

Browser trên bundle cuối đã tái hiện click detail rồi Back ngay: API log `source=aborted`, resource tổng 173 ms, `waitForHeaders=null`, `body=null`; không còn body timestamp giả. Search sau đó giữ `tai`, có 12 card, không còn progress/aria-busy, không có ảnh hỏng; bề rộng desktop 1.265 px bằng scrollWidth. Đã lưu `infra5-final-browser.json` và `infra5-final-production.png`, đóng tab thử và khôi phục viewport. Đây là phép kiểm chứng UI cuối, không phải benchmark thiết bị vật lý.

## Những mục phụ thuộc phép đo tiếp theo

P2 index/read model, split bundle và prefetch không được bật hàng loạt. Audit trên dataset hiện tại cho query default mẫu ~6,7 ms; thiếu bằng chứng chúng giải thích phần chờ ngoài handler. Cần benchmark Postgres dataset lớn/Coverage/trace foreground trước khi chọn migration hoặc tăng request do prefetch. Không xem 17 cảnh báo FK INFO là 17 lỗi phải thêm index ngay.

Ảnh hiện đã WebP/lazy/hero priority và LCP IAB ~1,8 giây trong audit, nên chưa đổi nguồn ảnh hoặc thêm image service. Chưa có bằng chứng kiểm thử Android vật lý/field p75; không tuyên bố mọi thiết bị đã mượt. Cold do chính sách scale-in vẫn được đo riêng.

Artifact local: `infra5-sqlite-api-final.log`, `infra5-build-final.log`, `infra5-fixture-browser.json`, `infra5-checkout.png`, `infra5-lab-benchmark.json`, `infra5-before-release-probe.json`, `infra5-production-probe.json`, `infra5-final-smoke.json`, `infra5-final-browser.json`, `infra5-final-production.png`. Không lưu secret hoặc response private Production.

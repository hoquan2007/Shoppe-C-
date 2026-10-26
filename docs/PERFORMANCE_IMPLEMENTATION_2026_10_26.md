# Kết quả sửa hiệu năng — 26/10/2026

## Trạng thái

Đã sửa mã và kiểm thử local trên SQLite/PostgreSQL riêng. Không thay đổi catalog/ảnh của Production, schema/migration, biến môi trường, gói dịch vụ hoặc region. Sau khi người dùng yêu cầu triển khai, bản sửa đã phát hành lên Production ngày 26/10/2026; xem [báo cáo kiểm tra Production](PRODUCTION_PERFORMANCE_REVIEW_2026_10_26.md) để biết kết quả thực tế và các vấn đề còn lại. Các số đo bên dưới vẫn là baseline local trước phát hành.

Thực hiện theo [audit và kế hoạch](PERFORMANCE_AUDIT_PLAN_2026_10_26.md). Tập trung các điểm nghẽn đã có bằng chứng; giữ C++20, Vite và JavaScript hiện có.

## Thay đổi

### Đọc/ghi dữ liệu

- Cart và checkout tải variants/products/shops theo lô thay vì ba SELECT cho mỗi dòng. Wishlist cũng batch theo các ID thuộc người dùng.
- Checkout thật ghi tồn kho theo batch trong transaction đang giữ khóa bảo vệ; không bỏ khóa hoặc kiểm tra kho. Quote dùng read-only transaction, chỉ tính tiền, không tạo reservation/order/voucher redemption/notification rồi rollback nữa.
- Import catalog ghi product/variant theo batch tối đa 100 hàng, giữ skip-ID hiện có và transaction atomic. Giá/tồn kho hàng đã có không bị ghi đè khi import lại.
- Admin/seller products mặc định 50 hàng, maximum 100, có total/page/page_size/pages. Orders mặc định 20; notifications/audit/reviews/outbox/payment admin có pagination. Chỉ hydrate quan hệ của trang; export CSV tiếp tục xuất đầy đủ.
- Dashboard aggregate tiền, số đơn, hoàn tiền, hàng bán chạy ở SQL; recent orders tối đa 6, low-stock/top products tối đa 5. Có test tiền COD, đối soát, partial return và refund để giữ cách tính cũ.
- Public catalog bỏ description khỏi response card, vẫn trả mô tả đầy đủ tại detail/editor. Rating/count aggregate ở DB; sort giá aggregate biến thể một lần thay vì correlated MIN theo mỗi product.

### Transaction và tác vụ nền

- GET dashboard/orders/payment đọc bằng transaction read-only. Khi cần expiry, transaction ghi dọn expiry kết thúc trước khi quay về snapshot đọc. Dọn auth challenge hết hạn bằng một DELETE thay cho vòng lặp.
- PBKDF2 đăng nhập/đăng ký/reset chạy ngoài khóa ghi. Rate-limit được ghi trước, account/hash/token được kiểm tra lại trước khi tạo phiên/đổi mật khẩu. Vẫn giữ 600.000 vòng PBKDF2 và toàn bộ bảo vệ CSRF.
- Email chuyển sang một `std::jthread` được quản lý vòng đời Application, tối đa một delivery tại một thời điểm mỗi instance. HTTP request chỉ lưu outbox và đánh thức worker. Claim mail có LIMIT 1, lease 120s, retry tối đa 3 với backoff; giữ Idempotency-Key của mail. Không giữ transaction/connection trong lúc gọi Resend.
- Outbox nằm trong DB để có thể phục hồi sau restart; maintenance endpoint có secret tiếp tục là đường khôi phục. Worker không phải hàng đợi chỉ trong RAM. Container vẫn có thể scale to zero; không hứa delivery SLA khi không có instance/tác vụ bảo trì hoạt động. Khi có request tạo mail, worker được đánh thức ngay trong instance đang phục vụ request.
- Log request JSON được ghi và flush nguyên dòng bằng `osyncstream`, tránh log bị trộn/đọng buffer khi nhiều worker cùng ghi.

### Frontend

- Điều hướng giữ nội dung cũ trong khi chờ API; chỉ có trạng thái cập nhật nhỏ. Khi response hoàn tất mới thay view, version/AbortController chặn kết quả của route cũ.
- Tách API client: canonical query, cache public 64 entry/15s, deduplicate request đang bay cùng route, TTL cho metadata, invalidation theo mutation liên quan. Cart/chat/account không xóa toàn bộ cache catalog.
- Detail public dùng `?view=public`, bỏ cookie/CSRF và dùng được cache public. Server ép representation public kể cả request mang cookie admin; preview có quyền vẫn dùng đường private/no-store. Không đưa draft vào cache public.
- Giỏ cập nhật số lượng/checkbox/tổng tiền/badge ngay; một request PUT đang bay, các click mới được gộp và giữ hiển thị. Response cũ không ghi đè ý định mới. Lỗi lưu khôi phục snapshot đã được xác nhận, kể cả khi xóa dòng cuối. Không GET lại cart/badge và render lại toàn route sau mỗi thao tác.
- Đăng nhập không chờ badge giỏ mới chuyển trang; các lượt đọc cart đang bay được dùng chung. Response phiên cũ không ghi đè lần đăng nhập mới. Báo giá checkout có guard theo route/revision để request cũ không ghi đè địa chỉ/voucher vừa đổi.
- Dừng polling khi tab ẩn/rời route, chỉ lên lịch lượt tiếp sau khi request trước hoàn tất. Chat tải 50 message gần nhất, có nút xem lịch sử; polling lấy delta bằng sequence tăng dần của cuộc hội thoại. Sequence nằm trong payload hiện có, không cần migration; legacy messages vẫn đọc được. Tránh mất tin gửi cùng một giây khi ID ngẫu nhiên sắp trước cursor cũ.
- Ảnh bảng admin có kích thước cố định và lazy loading. Pagination dựng 50 hàng thay vì 1.000. Editor vẫn có đầy đủ description/variants, không phải bản card rút gọn.
- Tái sử dụng currency formatter. Giữ chiều cao vùng main tối thiểu theo viewport để footer không nhảy vào/ra màn hình lúc dữ liệu ban đầu tới.
- Thêm Web Vitals chính thức `web-vitals@6.2.3`, pin cả hai lockfile. Đo LCP/INP/CLS vào Performance API local, không gửi telemetry hoặc dữ liệu người dùng ra ngoài. Thêm `?debug-perf=1` để xem log debug; route timing có measure `shoppe:route`.
- Public API cache thêm SWR 15s sau TTL 15s (meta 30s + SWR 30s). Giá/kho checkout vẫn đọc lại từ DB. Nội dung công khai có thể cũ khoảng 30s trong chu kỳ cache này; chưa có purge CDN tức thời, và lần truy cập URL hoàn toàn mới vẫn có thể gặp cold start.

## Số đo trước/sau local

Cùng script, SQLite Debug và quy mô 1.000 sản phẩm mô phỏng. Một lượt mỗi endpoint, không phải p95 và không phải Production. Fixture được tạo lại từ cùng template; page management sau sửa lấy 50 hàng nên thành phần cart được chọn theo trang cũng có khác biệt. Vì vậy số query, giới hạn hàng và kích thước response đáng tin hơn việc suy ra một tỷ lệ latency cho mọi người dùng.

| Luồng | Trước | Sau |
|---|---:|---:|
| Cart GET 1 dòng — DB calls | 9 | 9 |
| Cart GET 10 dòng — DB calls | 36 | 9 |
| Cart GET 50 dòng — DB calls | 156 | **9** |
| Admin products — hàng trả về | 1.000 | **50/1.000** |
| Admin products — JSON byte | 913.635 | **44.762** |
| Admin products — handler | 97,83 ms | **5,80 ms** |
| Dashboard không có đơn — handler | 53,10 ms | **0,85 ms** |
| Public catalog — JSON byte | 10.790 | **7.430** |
| Import 30 demo — DB calls | 72 | **14** |

DB calls là bộ đếm query/executeScript, gồm transaction setup/commit, không chỉ SELECT. Byte sau giải nén; không phải lượng truyền gzip/Brotli.

## Kiểm chứng

- Frontend syntax/build: qua. Bundle sau sửa khoảng 101 KB, gzip 32 KB (bao gồm Web Vitals và các cơ chế queue/cache); không tuyên bố đã giảm bundle bằng code splitting.
- CTest: **7/7 qua**, gồm nhóm performance mới.
- SQLite: **18/18 API integration + 11/11 frontend behavior = 29/29 qua**.
- PostgreSQL local mới, chỉ bind `127.0.0.1:15441`: **29/29 qua**; pool/reuse/read-only/concurrent-read test qua. Không chạy integration test trên Supabase Production.
- Nhóm `performance_tests` cũng chạy trực tiếp trên PostgreSQL trong một database unit test khác và qua, gồm reset tài khoản chưa có password hash. CI đã thêm bước tương ứng với database riêng, không dùng chung dữ liệu fixture với API suite; chưa chạy GitHub Actions cho các thay đổi chưa push này.
- C++ test mới kiểm tra query count giỏ/wishlist 50 dòng, pagination, draft public/preview isolation, dashboard COD/reconciliation/refund/partial return, lịch sử chat và delta cùng giây, email gateway đang chờ không chiếm khóa của giỏ.
- Frontend test kiểm tra canonical cache, credentials public/private, GET retry giới hạn, route cancellation, invalidation race, gộp click, write serialization, response cũ và rollback.
- Browser: buyer đăng nhập, cart 50 dòng, bấm tăng liên tiếp từ 1 tới 4, tổng tiền cập nhật và focus/nút vẫn còn; checkout hiển thị quote COD/phí vận chuyển. Không tạo thanh toán ngân hàng thật.
- Browser: đổi sang admin, dashboard hiển thị; DOM có đúng 50 hàng và 50 ảnh lazy, tổng 1.000; trang 2 và editor có đủ mô tả/biến thể. Desktop document width bằng viewport, không tràn ngang; console không có error/warning trong các bước kiểm tra này.
- Web Vitals local: khi thêm đo lường ban đầu thấy CLS 0,233; sau sửa chiều cao main, một lượt tải lại ghi **CLS 0**, LCP khoảng **108 ms**. Đó là local browser không throttle, có ảnh/tệp có thể đã cache; không thay thế số đo mobile hoặc field p75. INP log 0 trong thao tác rất nhanh không được trình bày như bằng chứng p75 INP của người dùng.
- Proxy lỗi chỉ ở localhost: API chậm 650ms; sau click điều hướng, `aria-busy=true`, vẫn còn heading/trọn 12 card của trang trước và trạng thái cập nhật. Không thay nội dung bằng spinner trống trong lúc chờ.
- Proxy cố ý trả 503 cho lần PUT cart đầu tiên: browser xóa ngay dòng cuối ở optimistic state, sau lỗi khôi phục đúng một dòng/số lượng 1/tổng tiền và thông báo lỗi. Đã kiểm tra bằng DOM và screenshot `performance-cart-rollback.png`.
- Đúng lệnh `npm ci`/build của frontend service cũng qua, SHA-256 bundle trùng bản root build đã kiểm tra. Hai lockfile dùng cùng phiên bản Web Vitals.

Raw metrics và ảnh proof ở `artifacts/` (Git ignore): `performance-local-after-2026-10-26.json`, `performance-admin-after.png`. Baseline trước sửa vẫn giữ nguyên ở `performance-local-2026-10-26.json`.

## Giới hạn còn lại

Cold start 4–5 giây đã đo ở audit trước nằm phần lớn ngoài handler; sửa source không bảo đảm loại bỏ phần khởi động platform. SWR/cache giảm lượt phải chờ origin khi đã có cache, nhưng first uncached URL vẫn cần đo lại sau phát hành. Không tự đổi host, region, pool size hoặc mua dịch vụ.

Chưa thêm index/schema projection hoặc thay framework: dữ liệu đơn Production còn nhỏ và chưa có benchmark chứng minh cần migration cho đợt này. Chưa tách toàn bộ bundle/CSS hoặc dựng WebSocket. Chưa đo mobile có CPU/network throttling hay p75 field; đã có instrumentation để tiếp tục đo đúng.

## Tham khảo

- [Container runtime](https://vercel.com/docs/functions/runtimes/container): vòng đời và scale-in container; outbox phải có state bền vững để retry sau restart.
- [Web Vitals library](https://github.com/GoogleChrome/web-vitals): đo metric bằng thư viện chính thức, phân biệt local debug và số liệu người dùng.

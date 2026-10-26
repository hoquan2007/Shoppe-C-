# Rà soát hiệu năng và kế hoạch tối ưu — 26/10/2026

## Kết luận

Web có nhiều nguồn gây chờ cộng dồn: backend khởi động khi có request chưa được cache; frontend xóa nội dung khi chuyển route; thao tác giỏ hàng gọi API liên tiếp; giỏ hàng và wishlist có truy vấn theo từng mặt hàng; admin/seller vẫn tải danh sách không giới hạn; một số GET dùng khóa ghi toàn hệ thống; gửi email chạy trong thời gian phục vụ request.

Người dùng xác nhận thấy lag ở **tất cả thao tác**. Vì vậy cần tối ưu toàn luồng, đồng thời đo riêng tải trang, chờ API và phản hồi tương tác. Chưa có trace CPU/INP/FPS để kết luận nguyên nhân khựng khi cuộn là JavaScript hay CSS.

Đợt này chỉ kiểm tra, đo baseline và lập kế hoạch. Không sửa mã chạy, schema, cấu hình Production, catalog hoặc ảnh; không push/deploy. Các fixture đo local là SQLite riêng, đã tắt dịch vụ thanh toán/email/storage/Google thật.

## Phạm vi và phiên bản

- Đối chiếu frontend JavaScript/CSS/HTML/Vite, backend C++ HTTP/application/domain/security/payments/catalog/Google, database adapter/schema/migrations, scripts vận hành, Docker, Vercel và CI/test.
- Checkout local: `99bc042`; Production thực tế: `537738e44058ae3ae04b98f68ed20daf0cd3f54c`, deployment `dpl_2zaiLnZ6fUU4ZbV9DoN2U6kdU4YS`, alias `shoppec.vercel.app`, region `sin1`, READY. Chênh lệch local với commit Production chỉ là ba file tài liệu.
- Supabase `QuanShop`: ACTIVE_HEALTHY, PostgreSQL 17.11, Singapore. Catalog công khai hiện có **1.000 sản phẩm**; không sử dụng baseline 600 sản phẩm cũ như số đo hiện tại.
- Đã đo 23 HTTPS GET tuần tự, không cookie, không cache-busting; đọc metadata/log vận hành và SELECT/EXPLAIN chỉ đọc trên Supabase. Browser kiểm tra trang chủ và điều hướng catalog/phân trang.
- Không đăng nhập Production hoặc benchmark giỏ/đơn/payment của người dùng thật. Những nhận định về route riêng tư dựa trên mã và fixture local, không phải latency Production đã đo.

## Baseline mới

### HTTP Production

Đo lúc khoảng 10:34 ngày 26/10/2026, UTC+7, từ một máy đo. Thời gian dưới đây là từ lúc bắt đầu HTTPS GET tới nhận response headers, gồm mạng/TLS/CDN/platform. Mẫu nhỏ có chủ đích đối chiếu cache; **không đại diện p95 người dùng hay cache hit rate thực tế**.

| Request | MISS — ms | HIT kế tiếp — ms | Handler ở response MISS — ms |
|---|---:|---:|---:|
| `/api/home`, lượt backend đầu tiên trong mẫu | 4.695,8 | 59,6 | 212,1 |
| `/api/products` | 623,9 | 75,3 | 31,0 |
| `/api/products?page=2` | 951,5 | 67,3 | 30,5 |
| `/api/products?sort=price` | 1.044,7 | 82,0 | 66,2 |
| `/api/products?q=tai` | 962,4 | 58,5 | 86,2 |
| Chi tiết `demo-shoppe-51-3`, không cookie | 935,4 | 79,2 | 26,9 |
| JS có hash | 657,3 | 59,4 | Không áp dụng |
| CSS có hash | 544,7 | 60,9 | Không áp dụng |

- `/api/auth/me` không có cookie: hai lần **837,2 / 916,6 ms**, handler **9,0 / 8,6 ms**, private/no-store. Đây là route không hưởng CDN cache; không được khắc phục bằng cache dùng chung.
- HTML đầu tiên: **1.066,7 ms**, 1.155 byte. Catalog trang 1: **18.370 byte**, 12/1.000 sản phẩm. Home: **20.610 byte**. Byte đo với `Accept-Encoding: identity`, không phải lượng truyền khi dùng gzip/Brotli.
- Có 10 HIT / 13 MISS trong mẫu được thiết kế gọi từng URL hai lần; cả 23 request trả 200. Không suy ra tỷ lệ cache toàn hệ thống từ tỷ lệ này.
- Log startup khớp request `/api/home` đầu tiên: `schema_mode=verify`, startup ứng dụng **183,4 ms**. Chứng minh có instance khởi động trong luồng này; phần chênh với 4,70s vẫn gồm platform/mạng/điều phối, chưa tách được toàn bộ.
- `Server-Timing` và `X-Request-Id` trên HIT có thể là header của response đã cache. Chỉ dùng mẫu MISS để mô tả handler, không coi HIT là một lần C++ chạy mới.

### Database Production

- Thống kê tích lũy `pg_stat_statements`: catalog mới nhất trung bình **5,67 ms**, đếm tổng **1,33 ms**, chọn đại diện danh mục **12,00 ms**, sort giá **18,11 ms**, count tìm kiếm chuẩn hóa **24,22 ms** tại lúc lấy mẫu. Có cả truy vấn lịch sử trước tối ưu; không dùng số trung bình tích lũy làm latency của request hiện tại.
- EXPLAIN ANALYZE một truy vấn chọn ID tương đương sort giá: **6,64 ms**, không đọc disk; subplan MIN giá biến thể chạy **1.000 lần**, có dùng `variants_product`. Đây là phần SQL có thể tối ưu khi tăng dữ liệu, nhưng chưa giải thích được độ trễ HTTP gần một giây hoặc 4,70s.
- Đã kiểm tra index hiện có: thiếu index cho các đường truy cập như `order_items(order_id)`, `refunds(order_id)` và `refunds(checkout_id)`. Tập đơn hiện còn nhỏ; bổ sung phải có EXPLAIN và benchmark, không xem thiếu index là nguyên nhân chính của mọi độ trễ.

### Fixture local: 1.000 sản phẩm mô phỏng

SQLite, backend Debug, cùng mã nguồn hiện tại. Tạo database tạm, nhập demo đóng gói rồi nhân bản dữ liệu mô phỏng trong **chính fixture đó** tới 1.000 sản phẩm. Không phải bản sao dữ liệu cá nhân Production.

| Luồng | Kết quả |
|---|---|
| Public catalog | 12/1.000 sản phẩm, 8 lượt gọi database theo instrumentation |
| Admin products | **1.000 sản phẩm**, **913.635 byte JSON**, handler **97,8 ms**, 9 lượt gọi database |
| Dashboard admin, chưa có đơn | Handler **53,1 ms** dù response chỉ 188 byte; vẫn đọc catalog/variants để tính số liệu |
| Giỏ 1 mặt hàng | **9 lượt gọi database** |
| Giỏ 10 mặt hàng | **36 lượt gọi database** |
| Giỏ 50 mặt hàng | **156 lượt gọi database** |

Instrumentation đếm mỗi lời gọi `query/executeScript`, gồm transaction setup/commit; không phải chỉ SELECT. Giỏ hiện tăng theo **6 + 3 × số dòng** trong fixture này. SQLite loopback nhanh không phản ánh chi phí 156 round trip PostgreSQL qua mạng.

## Các điểm nghẽn và hướng xử lý

### 1. Cache MISS/cold start làm chậm lần đầu — ưu tiên cao nhất

**Bằng chứng:** số đo HTTP và startup ở trên. Static frontend/CDN đã hoạt động, asset hash có immutable. Không cần làm lại đợt tách frontend ngày 24/10.

**Kế hoạch:** đo cache theo route và query; thử TTL/SWR có giới hạn cho representation công khai, chuẩn hóa URL để `/products`, `?page=1`, `?sort=new` không vô tình chia nhỏ cache cho cùng kết quả. Cần thống nhất URL ở frontend/redirect phù hợp, không chỉ chuẩn hóa sau khi request đã qua CDN. Prefetch có chọn lọc trang kế tiếp/sản phẩm khi người dùng thể hiện ý định, giới hạn số request và không prefetch toàn catalog.

Có thể thử public catalog TTL 30–60s và SWR 60–120s trong preview; đây là phương án thử, **chưa phải cấu hình chốt**. Cần cơ chế invalidation/purge phù hợp khi ẩn hàng/khóa shop; nội dung bị kiểm duyệt không nên sống lâu hơn SLA cho phép. Checkout vẫn xác thực lại giá/kho từ DB. Lần truy cập một URL chưa có cache vẫn phải chờ origin.

Nếu trace cho thấy first uncached request vẫn nhiều giây sau tối ưu, so sánh cấu hình runtime được nền tảng hỗ trợ với backend C++ chạy liên tục cùng khu vực. Quyết định vận hành dựa trên chi phí và số đo; không cam kết nâng gói sẽ tự loại bỏ cold start. Không dùng cron ping như giải pháp gốc. Vercel Services đang được dự án sử dụng và tài liệu skill ghi Beta.

### 2. Điều hướng xóa trang, cache chưa bao phủ detail — ưu tiên cao

**Mã:** `frontend/app.js:140`, `:475`, `:1128`.

- `renderRoute()` thay toàn bộ `#content` bằng spinner rồi mới chờ dữ liệu; browser quan sát được trạng thái này khi chuyển catalog. Mỗi MISS khiến người dùng nhìn trang trống dù shell vẫn giữ.
- Cache client chỉ nhận `/meta`, `/home`, `/products` dạng danh sách; **không cache `/products/:id`**. Detail gửi cookie phiên; backend chỉ cho cache chung detail khi không có cookie (`application.cpp:927`). Người đã đăng nhập dễ mất đường cache công khai khi mở sản phẩm.
- Cache key là chuỗi path thô; chưa hợp nhất request đang bay. Mọi mutation đều xóa toàn cache public, kể cả mutation không đổi catalog. `ensureMeta()` lại giữ promise lâu hơn TTL cache nên cần tách rõ vòng đời.

**Kế hoạch:** giữ nội dung cũ kèm trạng thái loading khi lọc/phân trang, skeleton theo bố cục khi route mới chưa có dữ liệu; cache kết quả đã xem; chuẩn hóa query và deduplicate in-flight request. Tách API/detail DTO công khai khỏi preview của admin/seller trước khi bỏ cookie cho đường public; draft vẫn phải kiểm tra quyền. Cache riêng tư phải xóa khi đổi tài khoản, không dùng chung CDN. Giới hạn prefetch và giữ AbortController/version guard.

### 3. Giỏ hàng có N+1 và chuỗi request dư — ưu tiên cao

**Mã:** `application.cpp:1162`, `frontend/app.js:1256`, `:1266`, `:1281`, `:1548`.

Backend đọc variant → product → shop cho từng dòng. `PUT /cart` vừa kiểm tra từng variant vừa dựng lại toàn bộ lines. Frontend thêm hàng gọi GET cart → PUT cart → GET cart; thay số lượng/checkbox thường PUT → GET badge → GET khi render lại trang.

**Kế hoạch:** batch các ID variant/product/shop theo giỏ đã được phân quyền; dùng response PUT làm trạng thái chính thức cho lines/badge/tổng tiền. Cập nhật đúng dòng thay vì render lại toàn trang. Queue/coalesce cập nhật số lượng để tránh ghi đè giữa click nhanh; optimistic UI có rollback và trạng thái pending. Chỉ retry GET phù hợp, không tự retry checkout/mutation.

**Nghiệm thu:** giỏ 1/10/50 dòng có số lượt gọi DB gần như cố định, mục tiêu ≤12 theo cùng bộ đếm; mỗi thao tác giỏ bình thường chỉ một mutation khi state đã sẵn sàng; chọn hàng, kho thay đổi và click nhanh vẫn đúng.

### 4. Admin/seller tải toàn bộ catalog, ảnh eager — ưu tiên cao

**Mã:** `application.cpp:185` (helper `productViews`), `:1237`, `:2033`; `frontend/app.js:855`.

Helper này batch nên không phải N+1, nhưng đọc **toàn bảng variants/shops/reviews**, ngay cả seller chỉ cần sản phẩm của một shop. Admin trả 1.000 bản ghi rồi frontend tạo 1.000 dòng DOM; ảnh bảng không có lazy loading. Admin còn chờ `/admin/shops` sau cặp request đầu tiên.

**Kế hoạch:** pagination/filter/sort server riêng cho management, 25/50 dòng/trang, maximum 100; chỉ lấy quan hệ của ID trong trang. Trả field summary cần cho bảng, chỉ lấy description/variants đầy đủ khi mở editor. Lazy ảnh có kích thước cố định; tải shop lookup song song hoặc chỉ lúc mở editor. Bắt đầu bằng pagination, chỉ dùng virtualized table nếu thực sự cần nhiều dòng cùng lúc.

### 5. Khóa ghi toàn hệ thống bao trùm nhiều GET và hash mật khẩu — ưu tiên cao

**Mã:** `database.cpp:262`, `application.cpp:728`, `:999`, `:1021`, `:1349`.

Mọi transaction ghi dùng chung `pg_advisory_xact_lock(72134001)`. Dashboard, orders, payment GET và chat GET được đánh dấu stateful nên cũng lấy khóa. Public read gặp checkout hết hạn sẽ nâng thành transaction ghi, dọn expiry rồi tiếp tục route. PBKDF2 600.000 vòng của login/register/reset nằm trong transaction đang giữ khóa. Quote checkout thực hiện logic dự trữ/ghi rồi rollback, vẫn chiếm khóa trong quá trình tính.

**Kế hoạch:** tách expiry thành bước ngắn, bounded và recheck đúng dữ liệu liên quan; sau đó đọc dashboard/orders bằng read-only snapshot. Đưa password derivation/verify ra ngoài transaction ghi nhưng giữ rate-limit accounting, re-read trạng thái/hash/phiên trước commit và không tạo race khi reset/khóa tài khoản. Quote nên tính từ snapshot, checkout thật revalidate và reserve nguyên tử. Trước mắt **giữ cơ chế bảo vệ stock/voucher**, chỉ thu hẹp phạm vi khóa; khóa theo row/domain là bước sau khi có test PostgreSQL cạnh tranh.

**Nghiệm thu:** dashboard/chat không chặn cập nhật giỏ; login chậm không giữ khóa stock; không oversell, voucher không dùng quá giới hạn, expiry/restock/idempotency/webhook vẫn đúng trên nhiều request/instance.

### 6. Email còn nằm trên đường trả response — ưu tiên cao

**Mã:** `application.cpp:934`, `:2104`; `vercel.json` cron maintenance chạy hằng ngày.

Sau mỗi mutation, handler gọi `processMail()` tối đa bốn lần. Khi email được cấu hình, mỗi lần lại mở transaction ghi và đọc cả outbox; nếu có mail thì request chờ HTTP Resend. DB đã commit/nhả connection trước network, **không phải giữ khóa DB suốt lúc gửi email**, nhưng worker HTTP và response của người dùng vẫn bị chiếm. Bốn worker C++ không có nhiều dư địa cho các tác vụ mạng chậm.

**Kế hoạch:** response chỉ enqueue outbox trong transaction nghiệp vụ; worker/tác vụ nền bền vững claim mail theo batch có LIMIT, retry/backoff và idempotency. Dùng cơ chế thực thi nền được deployment hỗ trợ; không detach thread rồi giả định container tiếp tục chạy sau response. Cron hằng ngày hiện tại không đáp ứng nhu cầu email gần thời gian thực.

### 7. Orders/dashboard/notifications/chat chưa giới hạn dữ liệu — ưu tiên trung bình đến cao

**Mã:** `application.cpp:1518`, `:1713`, `:1740`, `:1758`, `:1942`, `:1981`, `:2000`; `frontend/app.js:797`, `:1236`.

- Orders đã batch quan hệ qua `orderViews`, nhưng đầu vào vẫn là toàn bộ danh sách.
- Dashboard dựng toàn bộ orders/items/returns/refunds và catalog; frontend chỉ slice 6 recent orders/5 low-stock/5 top products.
- Chat GET cập nhật read marker và tải toàn bộ lịch sử; frontend sort và thay toàn bộ messages mỗi 7s. Chat có kiểm tra `document.hidden`, nhưng chưa có chống request chồng. Payment polling 7s chưa kiểm tra tab ẩn; request GET có thể timeout/retry lâu hơn chu kỳ polling.

**Kế hoạch:** orders/notifications/audit/payment admin có pagination; dashboard aggregate trên SQL và LIMIT trước khi hydrate. Chat lấy trang lịch sử + delta bằng cursor `(created_at,id)`, append message mới, read marker chỉ cập nhật khi cần. Poll tiếp sau khi request cũ hoàn tất, hủy khi rời trang, pause tab ẩn, backoff khi lỗi; dùng cùng quy tắc cho payment. Không cần đưa WebSocket vào trước khi giải quyết tải dư hiện tại.

### 8. Catalog SQL và DTO còn dư chi phí — ưu tiên trung bình

**Mã:** `catalog_query.cpp:19`, `:42`, `:66`, `:99`, `:130`, `:146`.

Tên/created_at/variant active đọc từ JSON TEXT, PostgreSQL cast JSONB trong lúc query. Tìm kiếm chuẩn hóa và `%keyword%` phải tính theo hàng; sort giá có correlated aggregate; homepage window function quét để chọn đại diện danh mục. Response card còn mang description và toàn bộ variants; server đọc đầy đủ payload review của các sản phẩm trong trang chỉ để tính rating/count.

**Kế hoạch:** public card DTO chỉ giữ dữ liệu hiển thị; rating/count aggregate trong SQL thay vì tải comment/payload review. Tách trường tìm kiếm chuẩn hóa/created_at và summary giá thành cột hoặc projection được cập nhật nhất quán nếu benchmark chứng minh cần; thử index phù hợp query trước khi chọn migration. Trigram cho contains search chỉ là lựa chọn PostgreSQL cần đánh giá, không mặc định thêm extension; giữ ngữ nghĩa tìm kiếm tiếng Việt và SQLite. Với 1.000 sản phẩm, ưu tiên này đứng sau giảm chờ origin và giỏ hàng.

### 9. Index, import và dọn dữ liệu — ưu tiên trung bình

**Mã:** `database/schema.sql`, `catalog.cpp:125`, `database.cpp:411`.

`Repository::list()` luôn trả payload và không có LIMIT mặc định. Import mới ghi product/variant từng hàng trong một transaction giữ khóa chung; preview/import hàng loạt có thể ảnh hưởng mutation khác. Sessions/email tokens/rate limits/outbox/audit cần chính sách retention khi dữ liệu tăng.

**Kế hoạch:** repository query theo use case với LIMIT bắt buộc cho list tương tác; batch insert/upsert khi import, giữ atomicity/idempotency và không ghi đè sản phẩm cũ. Bổ sung index FK/query thực sự dùng sau EXPLAIN; index theo cursor mới chỉ tạo sau khi chốt schema. Dọn dữ liệu theo batch trong job, có retention rõ ràng cho audit/payment, không xóa lịch sử tùy tiện.

### 10. Bundle/CSS/ảnh — ưu tiên sau các điểm trên

Build hiện tại: JS **85,56 KB / gzip 26,79 KB**; CSS **55,93 KB / gzip 11,75 KB**, chỉ 5 module Vite. Chưa có bằng chứng bundle là nguyên nhân chính gây chờ vài giây. JS tập trung cả buyer/seller/admin trong một file; CSS cũ và redesign cùng được nhập.

**Kế hoạch:** sau khi có CPU trace, tách module theo route/feature và lazy-load editor/admin/Google; tái sử dụng `Intl.NumberFormat`/date formatter; loại CSS bị override hoặc không dùng sau screenshot regression. Giữ preload/fetchpriority có chọn lọc; ảnh card đã lazy, ảnh hero đã high-priority và có preconnect. Kiểm tra cache/size của bộ ảnh hiện tại trước khi đề xuất host lại; không đổi bộ ảnh hay catalog. Không đổi framework chỉ để xử lý lag.

## Thứ tự triển khai đề xuất

Ước lượng cho một người làm, chưa phải cam kết thời gian; mỗi đợt có bản preview và số đo trước/sau. Các hạng mục có schema/worker/runtime cần nghiệm thu riêng.

| Đợt | Công việc | Ước lượng | Điều kiện hoàn tất |
|---|---|---|---|
| 0 — Đo đủ toàn luồng | Bổ sung browser route timing, LCP/CLS/interaction; chia trace thành queue/startup/pool/lock/SQL/serialize/external I/O; phân loại cache và cold/warm | 0,5–1 ngày | Có baseline guest/logged-in/mobile/admin; không log cookie, secret hoặc PII |
| 1 — Cảm giác phản hồi và request | Giữ nội dung khi đổi trang; cache detail public an toàn; canonical query/in-flight dedup; giảm GET giỏ; queue update giỏ; chặn polling chồng | 1–2 ngày | Điều hướng/giỏ phản hồi ngay; không stale overwrite; request dư giảm theo waterfall |
| 2 — API đúng khối lượng | Batch cart/wishlist; pagination admin/seller/orders; dashboard aggregate; summary DTO, lazy ảnh bảng; index đã được chứng minh | 2–3 ngày | Giỏ 50 dòng ≤12 DB calls; management tối đa 50 dòng mặc định; dashboard không hydrate toàn bộ lịch sử |
| 3 — Transaction và background | Thu hẹp khóa; hash ngoài khóa có recheck; quote read-only; tách email worker; giới hạn expiry/import, retention | 2–3 ngày | Mixed load không bị mail/login/chat chiếm toàn bộ worker; stock/payment/permission regression qua trên PostgreSQL |
| 4 — Chốt first uncached load | Thử TTL/SWR và invalidation; đánh giá runtime/container, image size, DB connect; tối ưu code-splitting/CSS theo trace | 1–2 ngày, tùy phương án | Có số cold/warm tách biệt; đưa ra quyết định vận hành nếu cold latency vẫn vượt mục tiêu |

Đợt 0 cần đi trước để đo; nên đưa phần giỏ hàng ở đợt 1–2 lên đầu vì người dùng báo lag trên toàn bộ thao tác. Cache/SWR có thể thử sớm sau khi chốt representation public và yêu cầu freshness. Không tăng thread/pool hoặc bỏ khóa trước khi đo tải hỗn hợp và connection budget trên nhiều instance. Supabase/backend đã cùng khu vực, không cần đổi region theo phỏng đoán.

## Tiêu chí nghiệm thu

- **Trải nghiệm:** phản hồi loading/pending trong ≤100 ms sau click; giữ nội dung đang xem khi refresh/filter; không mất focus/scroll vì cập nhật một dòng giỏ; không có request polling chồng hoặc kết quả route cũ ghi đè.
- **Web Vitals mục tiêu:** LCP ≤2,5s, INP ≤200ms, CLS ≤0,1 tại p75, báo riêng desktop/mobile. Lab kiểm tra lần đầu và tương tác có script; field cần đủ dữ liệu. Không lấy thời gian tool mở tab, TBT hoặc HTTPS GET làm INP/LCP.
- **API mục tiêu ban đầu:** catalog cache HIT p95 <200ms; warm public MISS p95 <500ms; warm private read p95 <700ms từ cùng runner đã xác định. Đây là mục tiêu thử nghiệm, chưa đạt chỉ vì test local qua. Cold request báo riêng; không gộp HIT vào warm origin latency để làm đẹp số.
- **Dữ liệu:** catalog 12/24/48; management 25/50 có cap; card DTO giảm byte so với 18.370 byte baseline hiện tại; giỏ không tăng truy vấn theo số dòng. Cần giải thích riêng payload lớn hợp lệ như export CSV, không áp pagination tùy tiện vào file xuất.
- **Tải hỗn hợp trên môi trường test:** 1/5/20 client, có browser+API và login/cart/catalog/admin cùng lúc; mail gateway giả lập chậm; pool/lock wait/queue không vượt budget. Không stress Production.
- **Bất biến:** tìm kiếm có/không dấu, thứ tự phân trang ổn định, quyền shop/user, CSRF, draft không vào cache chung, thay tài khoản không lộ cache, giá/kho được revalidate, không oversell, voucher đúng, quote không ghi state, idempotency/webhook/refund/expiry vẫn đúng.
- **Phát hành:** preview + PostgreSQL test trước; deploy từng đợt với khả năng rollback. Migration cần chiến lược tương thích, không để rollback app làm schema không đọc được. Theo dõi số đo cùng profile sau phát hành, đặc biệt sau hết TTL/idle, không chỉ bấm reload ngay khi cache còn nóng.

## Kiểm tra đã chạy và giới hạn

- `npm run check`: qua.
- `npm run build`: qua; asset hash trùng bản Production hiện tại.
- `cmake --build build -j2`: qua; có warning compiler về tham số không dùng trong adapter SQLite và header thư viện Windows.
- `ctest --test-dir build --output-on-failure`: **6/6 qua**.
- API integration SQLite với cổng riêng 18121: **18/18 qua**. Lần đầu sandbox chặn loopback nên readiness thất bại; chạy lại với quyền mạng localhost thành công. Không coi lần bị chặn đó là lỗi ứng dụng.
- Fixture riêng 1.000 sản phẩm và cart 1/10/50: qua, server đã dừng sau đo. Không chạy lại suite PostgreSQL local trong đợt này; Production chỉ SELECT/EXPLAIN và GET công khai.
- Browser xác nhận trang chủ/catalog có dữ liệu, tổng 1.000, trang 2 hiển thị 13–24/1.000; chuyển route xuất hiện spinner. Chưa đo chuẩn LCP/INP/CLS, FPS, CPU throttling/mobile hoặc luồng đăng nhập Production trọn vẹn.
- Raw HTTP và local metrics nằm tại `artifacts/performance-http-2026-10-26.json`, `artifacts/performance-local-2026-10-26.json`; script tái lập tương ứng `artifacts/audit-http-2026-10-26.mjs`, `artifacts/audit-local-2026-10-26.mjs`. Thư mục artifacts bị Git ignore; tài liệu này giữ các số đo chính để review.

## Tài liệu đối chiếu

- [Vercel Cache-Control](https://vercel.com/docs/caching/cache-control-headers): cơ chế TTL/SWR và tách cache dùng chung/riêng tư; phải xác nhận header/hành vi thực tế trên service container trước áp dụng.
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres): chọn direct/session/transaction theo runtime; không đổi pooler chỉ dựa trên tên serverless.
- [Web Vitals](https://web.dev/articles/vitals): ngưỡng LCP/INP/CLS và đánh giá p75 theo thiết bị.
- Báo cáo cũ [24/10](PERFORMANCE_IMPLEMENTATION_2026_10_24.md) dùng để phân biệt việc đã sửa với điểm còn tồn tại, không thay thế baseline mới.

# Kế hoạch tối ưu tiếp trên Vercel + Supabase — 26/10/2026

## Kết luận và phạm vi

Ưu tiên **giảm số lần phải chờ origin**, khép các lỗ hổng khóa cache và giảm request trùng trước khi tăng worker, connection hoặc thêm index. Những lượt chậm hiện có phần thời gian lớn nằm ngoài application handler. Tối ưu SQL vẫn có ích nhưng chưa đủ cơ sở để hứa giải quyết toàn bộ độ trễ 3–4 giây.

Người dùng đã chọn giữ hạ tầng hiện tại, chưa phát sinh phí. Phương án Render tạm gác. Kế hoạch này dùng Vercel frontend/container và Supabase hiện có; chưa tạo tài nguyên, đổi cấu hình Production, migration hoặc deploy mới. Đợt rà soát chỉ đọc API/DB và tạo tài liệu/bằng chứng local.

Source ứng dụng được rà: `c7eca88733c62db4576ee6914619e14129cdc272`; HEAD tài liệu `fc2fea1`. Alias `https://shoppec.vercel.app` xác nhận trỏ `dpl_944oxJrovLcHZRA5Qe5QYvPXdsXT`. Backend `sin1`, Supabase QuanShop `ap-southeast-1`, trạng thái ACTIVE_HEALTHY. Không có bằng chứng cần đổi vùng.

## 1. Bằng chứng mới

### HTTP và cache, khoảng 21:23 UTC+7

42 request tuần tự, chỉ đọc, không login, cookie hay load test. Mẫu nhỏ từ một runner; không phải field p95. Chỉ hai request liên tiếp trên mỗi public URL, không dùng tỷ lệ HIT của bài cố tình gọi lặp để đại diện traffic thật.

| Nội dung | MISS/lần đầu | HIT/lần kế |
|---|---:|---:|
| Health đầu tiên | 3.834,6 ms | Không cache |
| HTML tĩnh | — | 76,9 ms |
| JavaScript chính | — | 75,5 ms; Brotli 37.542 byte, immutable |
| Home API | 999,8 ms | 59,5 ms |
| Meta API | 891,2 ms | 73,7 ms |
| Catalog mặc định + meta | 159,8 ms | 61,1 ms |
| Tìm kiếm `tai` + meta | 989,1 ms | 71,8 ms |
| Chi tiết public | 962,4 ms | 61,5 ms |

Health đầu có instance age ~19 ms; log startup cùng instance **51,5 ms**. Các instance trình duyệt khác startup **44,1 và 46,7 ms**. Đây chỉ là khởi tạo ứng dụng, chưa gồm thời gian platform chuẩn bị container trước khi process bắt đầu. Cắt thêm vài ms khỏi startup app chưa giải thích hết cold 3,8 giây.

Ví dụ meta MISS: tổng 891,2 ms nhưng app 12,34 ms, queue 0,021 ms. Detail MISS: tổng 962,4 ms, app 31,17 ms. Pool wait trong các mẫu public MISS dưới 0,002 ms. Không quy phần chênh lệch thành SQL hay một thành phần platform duy nhất khi chưa có trace đầy đủ.

Health keep-alive 5 mẫu: 109,7–1.026,4 ms. Kết nối TLS mới 5 mẫu: 245,2–284,8 ms; mốc secureConnect tính từ đầu request 130,5–140,3 ms, đã gồm DNS/TCP/TLS. Guest session H1 5 mẫu: 111,5–144,6 ms; H2 3 mẫu: 110,4–122,3 ms. Hai nhóm chưa xen kẽ/ngẫu nhiên và không đủ mẫu để kết luận HTTP/2 chữa jitter. Backend phía sau Vercel vẫn là HTTP/1.1; protocol client→CDN và CDN→container là hai đoạn khác nhau.

### Phân mảnh cache được xác nhận

- `/api/products?include=meta&q=tai` và `/api/products?q=tai&include=meta` tạo MISS riêng, dù body cùng kích thước 11.582 byte. **Frontend hiện đã sort query**, nên đây chủ yếu là rủi ro URL gọi thẳng/client khác, không phải một lỗi sort cần sửa lại trong UI hiện tại.
- Catalog mặc định và bản thêm `page=1&sort=new` tạo entry riêng ở CDN. Frontend **đã bỏ các default này** trong `canonicalApiPath`; giữ regression hiện có.
- `debug-perf=1` còn đi qua `location.search` vào request search/detail, không bị canonicalizer loại. URL catalog thêm debug MISS 989,4 ms dù body vẫn 11.413 byte; detail thêm debug MISS 998,4 ms dù body vẫn 1.627 byte. Tracking/query không phục vụ nội dung cũng chưa bị allowlist loại khỏi request.
- Tất cả response probe không có Set-Cookie. Public read phía client dùng `credentials: omit`; giữ nguyên ranh giới này khi tối ưu.

### Trình duyệt desktop IAB, 21:23–21:27 UTC+7

Guest home phát **hai API** `/home` và `/auth/me`, không có `/meta` riêng, không có `/cart`. Hai API chạy song song; public content không chờ phiên đăng nhập. Trong lượt này chúng vẫn mất lần lượt **3.696,8 / 4.759,7 ms**. Log platform cho thấy hai instance mới khác nhau cho hai request; chưa đủ dữ kiện để kết luận quy tắc autoscaling.

Search route **3.617,9 ms**, API 3.550,1 ms, app 80,89 ms. Detail route **3.647 ms**, API 3.563,2 ms, app 29,05 ms. Back lần đầu về search 202,4 ms; mở lại detail 87,5 ms với request 71,2 ms; Back tiếp về search **75,3 ms, không thêm API products trong log thu được**. Cache hiện có đã giúp một số lượt quay lại, không mô tả như chưa có cache.

LCP document 1.824 ms, CLS 0,00235; vẫn có INP **3.072 ms**, processing 15,3 ms, presentation delay 3.056,7 ms. Không suy ra JavaScript chặn CPU 3 giây: long frame thu được có blocking 0. Cần trace Chrome foreground/thiết bị vật lý để phân biệt trình duyệt, render, mạng và môi trường automation. Hai lần công cụ chờ selector hết deadline vẫn được kiểm tra lại và trang đã tải; không ghi chúng thành lỗi HTTP của ứng dụng.

Home có 22 phần tử ảnh; hero high priority, card/category lazy. Ảnh mẫu là WebP thumbnail rộng 300 px; không coi tất cả ảnh là ảnh gốc nặng. JavaScript chính đã Brotli + immutable; nén asset không phải việc còn thiếu.

### PostgreSQL chỉ đọc

- Dataset hiện khoảng 1.000 products/variants, 1 shop, 4 users. Không dùng dữ liệu Production nhỏ để suy rộng cho 10.000 user/shop.
- `pg_stat_statements` có sẵn. Query probe expiry đã chạy 1.032 lần, mean **0,034 ms** execution bên PostgreSQL. Đây không phải RTT app→DB và là thống kê tích lũy, có cả các lần kiểm thử trước.
- Các nhóm catalog có mean execution khoảng 2,6–42,6 ms trong mẫu thống kê chọn lọc. Cần lấy delta theo cửa sổ khi benchmark để tách workload thực, không reset stats Production.
- EXPLAIN ANALYZE query đại diện default list (chỉ SELECT id, không phải toàn endpoint): **6,718 ms**, scan 1.000 products và top-N sort; shared read 0, không spill ra đĩa. Query tách `payload::jsonb`/created_at trên từng hàng; có hướng tối ưu khi dữ liệu tăng.
- Performance advisor có **17 FK thiếu covering index**, mức INFO, và 4 index chưa dùng. Không coi đây là 21 lỗi gây lag hoặc tự xóa index. `order_items(order_id)`, `addresses(user_id)`, `conversations(shop_id)` là ứng viên kiểm tra theo query thật; unique index có sẵn đã phủ một số FK khác.
- Snapshot có 7 backend connection idle trên toàn DB; không đồng nhất số này với pool 4 của một process ứng dụng, vì có kết nối quản trị và dịch vụ khác.

## 2. Những gì đã có, cần giữ

| Phần | Hiện trạng |
|---|---|
| CDN public | Catalog/home/detail 15 giây fresh + 15 giây SWR; meta 30 + 30 |
| Client | Cache public 64 entry, TTL 15 giây, dedup request cùng signal/epoch, abort route cũ |
| Request public | Gộp catalog + meta, home + category previews; bỏ cookie khi đọc public |
| UI | Giữ header DOM, phản hồi thao tác trước thay view, cart optimistic + CAS/rebase |
| DB/backend | Batch read, pool tối đa 4/process, read-only transaction, log queue async hữu hạn |
| Poll | Chat/payment mặc định 7 giây, bỏ qua tab hidden, giữ một task đang chạy |
| Thương mại | Quote ký + hạn 5 phút + kiểm tra snapshot, idempotency, không đặt đơn theo tổng cũ |

## 3. Kế hoạch ưu tiên

### P0 — Đo đầy đủ đường chờ để tránh sửa nhầm

**Điểm sửa:** `frontend/performance.js`, `backend/src/application.cpp` Trace, `backend/src/main.cpp` logger.

Trong chế độ debug, thêm mốc request start/responseStart/responseEnd, encoded/decoded bytes, nextHopProtocol, cache source (memory/network), cache age và abort/retry count. Log route phải chuẩn hóa ID, bỏ query/input/PII. Tách app, SQL, pool, queue và thời điểm headers ready; hook hiện tại không phải thời điểm hoàn tất ghi socket. Chỉ nối request ID với origin trên MISS/revalidation, vì HIT có thể lặp lại ID/Server-Timing của lần tạo cache.

Tạo runner tái lập trong CI/staging: cold sau idle thực, warm, cache HIT/MISS, H1/H2 client, reuse/new connection xen kẽ; ghi commit, deployment, instance age và điều kiện mạng. Đo 30 lượt/luồng staging, giữ mọi mẫu xấu; thử tải concurrency 1/10 chỉ trên fixture. Chrome foreground và Android vật lý là hai nhóm nghiệm thu riêng khi có thiết bị. Không dùng mẫu IAB làm field p75.

**Đạt khi:** có thể giải thích mỗi lượt >1 giây thuộc phase nào hoặc đánh dấu rõ phần chưa quan sát; số request/route đếm được; kết quả không bị query debug tạo khóa cache khác. Phụ thuộc của mọi thay đổi transport tiếp theo.

### P1-A — Khóa cache đúng và kiểm soát độ cũ

**Điểm sửa:** `frontend/api.js:1`, `frontend/app.js:486,554`, `backend/src/application.cpp:1060`.

1. Dùng allowlist query riêng cho catalog/detail. Giữ filter, sort, page, size, shop, include, view và review pagination; bỏ debug/tracking trước fetch. Không loại bừa token/phân trang ở route khác. Giữ canonical sort/default đã có. Test URL tương đương chỉ gọi fetch một lần; URL khác nội dung vẫn là key khác.
2. Cache hiện đặt `until=now()+15s` sau nhận response mà không đọc Age. Do đó dữ liệu CDN gần hết hạn hoặc stale có thể được giữ thêm 15 giây ở memory. Đọc generation/age/TTL để cap thời gian còn lại; trạng thái stale chỉ dùng để hiển thị và revalidate có giới hạn. Không kéo dài TTL từ thời điểm nhận như thể dữ liệu vừa được tạo.
3. Ban đầu giữ TTL CDN đang có, đo freshness và HIT rate trên traffic cacheable. Chỉ tăng TTL cho dữ liệu thay đổi chậm sau khi tách khỏi giá/tồn kho và có cơ chế invalidation kiểm chứng. Không cache shared session/cart/checkout/address/admin hoặc response lỗi.
4. Mutation hiện invalidate memory của tab, chưa chứng minh purge CDN ngay lập tức hoặc tab khác. Kiểm tra seller/admin sửa giá/ẩn shop/review trên fixture + Preview: tab thao tác đọc lại fresh theo contract, tab khác tuân freshness budget. Nếu cần purge/version thì thiết kế phạm vi public cụ thể trước; tránh header cache chung `/api/*`.

**Đạt khi:** debug/tracking không tăng origin call; invalidation không nhận response cũ sau mutation; không rò private payload; Back về dữ liệu còn fresh không phát API mới. Giá/tồn kho/order luôn được backend kiểm lại qua quote, không biến cache thành nguồn quyết định giao dịch.

### P1-B — Bỏ request trùng và giảm waterfall private

**Điểm sửa:** `frontend/app.js:624,653,1561,2331`, `frontend/api.js:111`, route `/api/auth/me`.

Public guest home đã 2 API song song, giữ làm baseline. Với user đã đăng nhập, startup chạy `/auth/me` rồi `/cart` để lấy badge, trong khi checkout gọi `/cart` trực tiếp; hai đường không dùng cùng in-flight helper. Đây là khả năng trùng xác định từ code, chưa được đo lại bằng tài khoản có giỏ trong đợt này. Cart page thông thường đã dùng `refreshCart` dedup, không sửa lại như chưa có.

Ưu tiên đưa các đọc cart qua helper chung theo user/context/revision, giữ hàng rào chờ write và CAS. Đo trước rồi mới thêm tùy chọn bootstrap private gồm session + cart summary/revision để badge không tải toàn bộ cart lines. Bootstrap không có CDN cache; logout/đổi tài khoản phải xóa state và chống response của phiên cũ.

Checkout có thể gộp addresses + cart snapshot + cấu hình checkout thành **một endpoint context chỉ đọc**, sau session và mọi write pending. Quote vẫn là bước riêng trên đúng địa chỉ/phương thức/voucher, có token và tái xác nhận khi snapshot thay đổi. Không gộp thao tác tạo đơn vào endpoint tải trang.

| Luồng | Baseline | Ngân sách đề xuất sau sửa |
|---|---|---|
| Guest public lần đầu | 2 API quan sát thực tế | ≤2, public content không chờ auth |
| Đã login vào public từ document mới | 3 theo code: session, public data, cart | ≤2 nếu bootstrap summary được triển khai |
| Chuyển search/sort/page | 1 API khi memory miss | ≤1; 0 khi key còn fresh |
| Cart sau session | Dùng refreshCart, thường 1 | ≤1, không fetch trùng với startup |
| Checkout sau session/meta | Addresses + cart + quote, có thể thêm meta | Context + quote: ≤2; write pending vẫn phải chờ |

**Đạt khi:** test direct navigation/Back/nhập nhanh/logout/login khác user không phát GET trùng, không mất cập nhật giỏ; quote và stock regression cũ vẫn qua. Retry GET hiện tối đa 2 lượt x timeout 12 giây; bổ sung tổng deadline và retry budget để mất mạng không giữ trang chờ gần 24 giây. Mutation không tự retry thiếu idempotency.

### P1-C — Phản hồi tải trang và scheduling

**Điểm sửa:** `frontend/app.js:1342`, `frontend/render-scheduling.js`, card/detail image markup.

`renderRoute` đang chờ `afterPaint()` trước khi bắt đầu request route khi đã có view; fallback 60 ms. Thử khởi tạo công việc đọc dữ liệu sớm, cho progress/pressed state paint, rồi commit DOM khi đúng route/version. Giữ abort và không để protected fetch chạy trước session/authorization. Không bỏ feedback paint chỉ để làm số đo route đẹp hơn.

Ở search, cân nhắc skeleton đúng cấu trúc hoặc nội dung cached trong lúc revalidate, thể hiện đang cập nhật rõ ràng. Trên card/chi tiết, review ảnh đầu viewport eager/high có chọn lọc; ảnh dưới fold lazy, có width/height/decoding. Kiểm tra chất lượng ảnh hero đang dùng thumbnail 300 px trước khi đổi srcset; chỉ dùng biến thể ảnh có URL đã xác minh. Không phát request tải mọi ảnh hoặc thêm image service trả phí.

**Đạt khi:** feedback thao tác ≤100 ms trong lab foreground, CLS ≤0,1; cache-hit route p95 ≤200 ms trong bài 30 lượt được kiểm soát. Trace mẫu INP xấu phải được xem, không loại mẫu vì presentation delay lớn. LCP của khung không thay cho thời điểm sản phẩm sẵn sàng.

### P2-A — Giảm round trip và query CPU có bằng chứng

**Điểm sửa:** `backend/src/application.cpp:848,1098,1110`, `backend/src/catalog_query.cpp`, `backend/src/database.cpp:260`, migration mới nếu thật sự cần.

- Mỗi GET hiện mở transaction, probe checkout hết hạn rồi mới route. Tách liveness không DB khỏi readiness có DB, giữ contract health/smoke tương thích. Guest auth không có token có thể trả anonymous sớm sau kiểm tra request; meta/session không cần xử lý stock expiry. Vẫn giữ expiry đúng ở catalog/cart/quote/checkout và bảo toàn maintenance/recovery, không dời toàn bộ sang cron ngày một lần.
- Settings/categories xuất hiện trong nhiều response: đo query count và cache nhỏ trong process nếu cần, có TTL/invalidation rõ. Cache process không thay được CDN và không đồng bộ giữa instance; không giữ session, giá hoặc stock lâu để giảm SQL giả tạo.
- Default list phải parse JSON created_at và sort; search chuẩn hóa tiếng Việt mỗi hàng, count và list lặp predicate; price sort aggregate variants. Benchmark fixture 1k/10k products trước/sau. Xem cột read model/index cho created_at/search key hoặc giá tối thiểu nếu EXPLAIN chứng minh có ích; phải cập nhật atomically cùng write và giữ tương thích SQLite/PostgreSQL.
- Chọn index theo access path: thử order_items(order_id), addresses(user_id), conversations(shop_id) và các query hot khác trên fixture lớn. Không thêm cả 17 index theo advisor hoặc bỏ 4 index chỉ vì chưa được dùng trong khoảng thống kê ngắn.
- Giữ pool 4/process và TLS. Theo dõi tổng connection x số instance; tăng pool chỉ khi wait cao có tương quan với load. Không đổi Supavisor mode dựa trên phỏng đoán; ghi lại host/port/mode an toàn khi cần, không in connection string/secret.

**Đạt khi:** app p95 catalog/search ≤100 ms, cart/session ≤50 ms trong bài staging cùng vùng; query count không tăng tuyến tính với số card; kết quả giá/review/stock bằng baseline. End-to-end private warm p95 mục tiêu ≤500 ms được đánh giá riêng; app đạt mà mạng/platform chưa đạt thì chưa đóng mục hiệu năng.

### P2-B — Prefetch và tách bundle sau khi có số đo

Prefetch theo ý định hover/focus/touch cho **một** chi tiết hoặc trang kế tiếp, chỉ public GET, sau dữ liệu route hiện tại; giới hạn concurrency, tổng request và bỏ khi Save-Data/mạng chậm/tab hidden. Không prefetch toàn grid. Hiện pending dedup yêu cầu cùng AbortSignal, nên prefetch background và route dễ gọi trùng: phải có subscriber-aware cancellation hoặc chỉ tái sử dụng request đã hoàn tất trước khi bật tính năng.

Bundle chính đã nhỏ và nén; đo Coverage/parse/long tasks trước khi tách admin/seller/chat thành import riêng. Đảm bảo người mua không tải workspace chunk, nhưng không tạo waterfall nhiều chunk làm trang đầu chậm hơn. Không rewrite framework chỉ để đạt mục này.

**Đạt khi:** số request toàn phiên và bytes không tăng ngoài budget; một ý định điều hướng không tạo hai fetch cùng key; cải thiện thời gian mở detail có đối chứng, mạng chậm không xấu hơn baseline.

## 4. Thứ tự thực hiện và nghiệm thu

1. **Đợt 1: P0 + P1-A** — bổ sung đo và sửa key/freshness; ít ảnh hưởng nghiệp vụ, lợi ích trực tiếp khi giảm MISS. Gate: unit cache + browser route race/invalidation.
2. **Đợt 2: P1-B + P1-C** — helper cart, bootstrap/context nếu số đo xác nhận lợi ích, scheduling và ảnh đầu viewport. Gate: fixture checkout multi-tab, rapid navigation, mạng lỗi và trace foreground.
3. **Đợt 3: P2-A** — health/anonymous fast path và read models/index theo EXPLAIN, một thay đổi mỗi lần. Gate: hai DB, fixture lớn, transaction/stock/mail regression; migration kiểm tra riêng nếu có.
4. **Đợt 4: P2-B có điều kiện + release** — chỉ giữ prefetch/split mang lại cải thiện đo được. CI đúng commit → Preview giả → Production đúng config → kiểm alias/hash → probe reads → cold/warm/browser riêng. Rollback về deployment đã kiểm chứng nếu tăng lỗi hoặc lag.

Ngân sách dùng để nghiệm thu, **chưa phải kết quả đã đạt**: public HIT p95 ≤200 ms, private warm p95 ≤500 ms, feedback ≤100 ms, route memory-hit p95 ≤200 ms; field p75 riêng mobile/desktop LCP ≤2,5 s, INP ≤200 ms, CLS ≤0,1 khi có đủ mẫu. Ghi riêng sản phẩm/checkout-ready và cold start. Nếu vẫn còn lượt >1 giây không giải thích được, giữ mục đó mở.

Vercel công bố container tự scale xuống sau 5 phút idle Production/30 giây Preview. Kế hoạch giảm các lần cần origin và chi phí khởi tạo trong app; không hứa giữ instance luôn nóng trên chính sách hiện tại. Không bổ sung cron ping hoặc dịch vụ trả phí để che phép đo cold.

## 5. Hồ sơ và nguồn đối chiếu

- `artifacts/audit4-cache-probe.json`: 42 request chỉ đọc, headers/cache/transport timings. Probe ban đầu gắn listener vào socket reuse gây warning của chính script; đã sửa script để chỉ gắn khi socket mới. Warning này không phải lỗi ứng dụng và không đổi số response/timing đã thu.
- `artifacts/audit4-browser.json`, `audit4-search.png`: console timing và trạng thái browser; không có warning/error ứng dụng trong tập log thu được. Đã đóng tab thử sau lưu bằng chứng.
- `artifacts/audit4-platform.json`: snapshot metadata/advisor/index/stats/startup; không chứa credential hay response private. API probe không login; SQL chỉ đọc metadata/statistics và SELECT plan.
- [Kết quả sửa trước](PERFORMANCE_FIX_COMPLETION_2026_10_26.md); các test 44/44 và CTest 8/8 là của release trước, không phải chạy lại trong đợt lập kế hoạch này.
- [Vercel Cache-Control](https://vercel.com/docs/caching/cache-control-headers): SWR, targeted CDN headers và việc proxy bỏ s-maxage trước khi trả client. Không coi header client chỉ còn max-age=0 là CDN chưa cache.
- [Vercel Container Runtime](https://vercel.com/docs/functions/runtimes/container): chính sách scale in.
- [Supabase kết nối Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres): direct/session/transaction pooling; chế độ cần theo mô hình kết nối thực.
- [Supabase query optimization](https://supabase.com/docs/guides/database/query-optimization), [FK index advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused index advisor](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index): đối chiếu query/EXPLAIN trước thay index.
- [Web Vitals](https://web.dev/articles/vitals): ngưỡng trải nghiệm đánh giá theo p75 thực địa.

Changelog Supabase đã đọc: thay đổi TLS HTTP API tháng 11 và bản Postgres 17.11 cần lưu ý theo tích hợp; đợt này không đổi TLS, extension hoặc SDK, không thấy yêu cầu thay pooling để thực hiện kế hoạch.

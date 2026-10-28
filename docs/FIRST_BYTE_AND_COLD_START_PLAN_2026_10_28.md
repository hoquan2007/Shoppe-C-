# Kế hoạch xử lý private API ~1 giây và cold ~4,1 giây — 28/10/2026

Trạng thái: **kế hoạch, chưa triển khai thay đổi ứng dụng hoặc phát hành mới trong lượt này**. Giữ Vercel + Supabase, không thêm dịch vụ/gói trả phí, không dùng cron ping để giữ nóng. Tiếp nối [kết quả đợt trước](EXISTING_INFRA_OPTIMIZATION_RESULT_2026_10_26.md).

## 1. Kết luận từ bằng chứng hiện có

Source ứng dụng gần nhất đã kiểm chứng: `67c5319bdd5bf41db9ab7c37e57d2b9f2854fd8d`; HEAD tài liệu lúc lập kế hoạch: `a7f9920`. Đây là các mốc lịch sử đã kiểm chứng ngày 27/10, không phải xác nhận lại alias/live ngày 28/10. Trước thực thi phải kiểm tra lại source, alias và bundle.

| Quan sát ngày 26–27/10 | Ý nghĩa và giới hạn |
|---|---|
| Private summary median ~980 ms; context ~1.037 ms, mỗi nhóm 10 mẫu | Chưa đủ để suy ra field p95; vẫn có lượt private dưới 200 ms. |
| Handler summary ~12 ms, context ~19 ms; pool wait rất thấp trong mẫu | Phần lớn thời gian client chờ chưa được giải thích bằng handler. Chưa có cơ sở tăng pool hay thêm index hàng loạt. |
| Health đầu tiên ~4.106 ms; startup process trước đó ~44–52 ms | Không thể đồng nhất 4,1 giây với khởi tạo C++. Số startup này chưa gồm platform chuẩn bị container và không phải toàn bộ listen-ready. |
| Browser HTTP/2 vẫn có request ~3,5 giây trước header, guest không DB cũng chậm | Không đủ cơ sở quy lỗi riêng SQL, session hoặc HTTP/1.1 phía client. |
| Có cả public CDN HIT ~614 ms | Cần nhóm đối chứng static/CDN để phân biệt đường mạng với origin. HIT không chứng minh C++ chậm. |

Ba nhánh cần điều tra: **client/CDN/ingress**, **HTTP server và socket write**, **khởi tạo container/process/DB**. Có thể tồn tại nhiều nguyên nhân cùng lúc.

Các tối ưu đã hoàn tất không làm lại: canonical cache key, freshness theo Age/generation, guest session không DB, session kèm cart summary, checkout context + quote, tổng deadline GET 12 giây. Hiện TCP_NODELAY đã bật; worker pool 4→32 và DB pool tối đa 4/process. Không xem các cấu hình này là thiếu sót chưa sửa.

## 2. Đợt A — Khép khoảng trống phép đo (ưu tiên đầu tiên)

**Điểm sửa:** `backend/include/http_runtime.h`, `backend/src/main.cpp`, `backend/src/application.cpp`, `frontend/performance.js`; bổ sung runner trong `scripts/` thay vì chỉ giữ script một lần trong `artifacts/`.

1. Chuẩn hóa trace với request ID của ứng dụng, ID nền tảng khi có, instance ID/request ordinal, tuổi instance, source/deployment, cache status, protocol và socket reuse. ID request là dữ liệu đối chiếu, không dùng làm cache key hoặc query debug. Không thêm custom header public khiến cache phân mảnh.
2. Phân biệt các mốc: task enqueue → worker nhận → request parse xong → app xong → header serialize xong → bắt đầu ghi socket → ghi xong response hoặc lỗi/ngắt kết nối. Enqueue là mốc hàng đợi trong ứng dụng, không phải thời điểm CDN nhận request hay kernel accept.
3. `set_logger` hiện nằm trước socket write. Không đổi tên nó thành send-complete. Rà API của cpp-httplib v0.61.0 để chọn hook thực sự phù hợp; nếu không có hook, thử adapter/patch nhỏ có kiểm soát trên fixture, lưu patch vào repo và cập nhật quy trình pin/checksum. Không sửa lén `.cache/deps/httplib.h`. Chưa có hook đáng tin thì giữ phase này là chưa quan sát.
4. Ghi write duration/bytes/kết quả vào log sau response, không cố đặt nó trong `Server-Timing` của chính response đã gửi. Ghi xong socket chỉ chứng minh dữ liệu được giao cho tầng socket, không chứng minh client đã nhận. Không dùng callback giải phóng body làm bằng chứng write thành công.
5. Bổ sung startup phases: đọc config, DB connect/verify schema, tạo app/server, bind/listen-ready; dùng mốc start handler được xác minh. Log `startup` hiện trước `startMailWorker()` và `listen()` nên chưa đo hết readiness. Không bỏ kiểm tra schema, TLS hoặc phục hồi outbox để làm cold ngắn giả tạo.
6. Tách thời gian pool chờ slot, tạo/reset DB connection, transaction setup và SQL nếu trace cho thấy chúng đáng kể. Metrics hiện tại có phần acquisition gộp connect; `db` là thời gian gọi DB phía ứng dụng, không tương đương CPU PostgreSQL.
7. Log dùng route template, bỏ ID người dùng/đơn, query, cookie, CSRF, body và connection string. Log bounded/asynchronous, có sampling khi cần; instrumentation lỗi không được làm response lỗi.

**Đạt khi:** mỗi request chậm có chuỗi mốc cùng ID; abort/HEAD/keep-alive/error không tạo phase âm hay timestamp giả; có thể chỉ rõ phần đã đo và phần còn thiếu. Không tính `TTFB - app` thành riêng “lỗi Vercel”: phần dư còn gồm đường mạng và các mốc chưa đo. Không trừ timestamp tuyệt đối giữa client/server khi chưa chứng minh clock đồng bộ; chỉ so các duration không chồng lắp.

## 3. Đợt B — Đối chứng để chọn đúng cách sửa

Trước đo, kiểm alias/deployment/hash, điều kiện mạng, phiên đăng nhập, region và observer đang chạy. Không bật DevTools Disable cache cho nhóm đo cache thông thường. Giữ cùng runner/mạng, foreground browser, không VPN thay đổi giữa lượt; nhóm IAB và Chrome/Android thực tế báo riêng khi có thiết bị.

| Nhóm | Cách đo | Dùng để phân biệt |
|---|---|---|
| Static control | HTML/hashed JS trong cùng cửa sổ thời gian | Mạng/client/CDN có chậm ngay cả khi không cần backend? |
| Origin không DB | `/api/live`, guest `/api/auth/me?include=cart` không cookie | HTTP/platform so với DB/session |
| Origin có DB | `/health`, session summary, cart, checkout context; editor đo riêng | Connect/transaction/SQL so với transport |
| Public cache | Catalog/detail: HIT, MISS, STALE, revalidation tách riêng | Cache có bỏ được origin và chậm ở đâu? |
| Transport | H1/H2 client; kết nối mới/reuse; request đầu và tiếp theo | Jitter có gắn với reuse/protocol? Không suy protocol CDN→container từ browser. |
| Cold | Sau idle tự nhiên, instance mới + ordinal/age + startup log | Platform trước process, khởi tạo app/DB, request đầu |

- Warm: tối thiểu 30 mẫu **cho mỗi endpoint/nhóm cần so sánh**, báo n/min/median/p95/max và tỷ lệ >1 giây; 30 mẫu chỉ là p95 lab sơ bộ. Không gộp guest với authenticated, warm với cold, hay endpoint khác nhau.
- Xen kẽ/ngẫu nhiên hóa thứ tự các nhánh trong từng block; ghi seed và socket thực tế. Không gọi hết H1 rồi mới H2 và quy chênh lệch theo thời gian thành cải thiện.
- Cold: thu ít nhất 10 lần instance mới được xác minh qua nhiều cửa sổ idle, báo median/max và từng mẫu, chưa gọi là p95 ổn định. Production đang có traffic có thể không thật sự cold; ghi “không xác minh được” nếu thiếu bằng chứng. Preview idle ngắn hơn chỉ dùng sàng lọc, không thay số Production.
- Mọi request chậm/lỗi/timeout được giữ lại; abort do chuyển route báo riêng, không bỏ lỗi khỏi tỷ lệ thành công. Đếm request, retry và bytes toàn phiên.
- Production chỉ probe đọc có giới hạn, không load test; không sửa giỏ/địa chỉ/đơn, không thanh toán/email/OAuth confirmation. Dữ liệu buyer, cart và concurrency 1/10 chỉ trên fixture hoặc môi trường giả. Tài khoản admin giỏ rỗng không đại diện checkout buyer có giỏ.
- Với CDN HIT/STALE, origin request ID/Server-Timing có thể thuộc lần tạo cache cũ; không ghép nó như handler vừa chạy. Ghi Age/generation và request ID nền tảng riêng.

**Đầu ra:** bảng trace các mẫu >1 giây; biểu đồ phân bố theo endpoint/cache/socket/instance; một test case tái hiện đủ để chọn nhánh C. Không phát hành “fix transport” khi mới có tương quan một vài mẫu.

## 4. Đợt C — Sửa theo nguyên nhân được xác nhận

| Bằng chứng từ A/B | Thay đổi ứng viên | Điều kiện giữ thay đổi |
|---|---|---|
| Chậm giữa header-ready và socket write/complete, nhất là reuse | Kiểm HTTP framing/Content-Length, response compression, write batching; đối chứng keep-alive hiện tại 2 giây với biến thể nhỏ và close trong fixture/Preview | Giảm tail latency cùng điều kiện, không tăng reset/retry/socket churn. Không ép close hoặc sửa timeout hàng loạt trên Production. TCP_NODELAY đã có. |
| Worker queue cao khi có socket idle/concurrency | Xác minh thời gian worker bị giữ; điều chỉnh quản lý socket/queue trước khi tăng worker | Có queue/CPU/load evidence; DB connection vẫn bounded, không mất request khi scale/drain. |
| Pool acquisition/connect/reset hoặc DB round trip chiếm phần lớn | Giảm lượt query/setup lặp; gộp các read cùng snapshot; index chỉ theo EXPLAIN và dataset đại diện | Session/cart/stock/quote đúng trên cả SQLite và PostgreSQL. Không đổi pooling mode/tăng pool khi wait thấp. |
| Static/HIT/live cùng chậm, app/write đều nhanh | So cùng thời điểm từ runner thứ hai sẵn có và browser foreground; rà rewrite/service hop, PoP/region, protection và log nền tảng | Giữ Protection/WAF; chỉ sửa routing khi chứng minh có hop/config sai. Nếu phần platform không quan sát được, chuẩn bị hồ sơ trace cho hỗ trợ, không tự khẳng định root cause. |
| Platform trước process chiếm phần lớn cold | Đo kích thước/layer runtime image; thử strip binary, giảm file/layer runtime và nội dung frontend trùng nếu fallback không cần | So nhiều cold đã xác minh; kiểm TLS/libpq/schema/static fallback đầy đủ. Build nhanh hơn không được tính là cold nhanh hơn. Không rewrite backend/runtime chỉ vì một mẫu. |
| Startup app/DB/listen thực sự chậm | Giảm công việc lặp trên đường readiness, tối ưu verify/read file hoặc DB setup có bằng chứng | Fail-fast schema/TLS, readiness và phục hồi nghiệp vụ còn nguyên; không dời lỗi sang request người dùng. |

Mỗi thử nghiệm thay một nhóm biến, so với baseline trong cùng cửa sổ điều kiện. Chỉ phát hành nhánh đã đạt kiểm chứng; các nhánh khác vẫn mở. Không stream header rỗng hay trả thành công sớm chỉ để làm TTFB đẹp trong khi dữ liệu vẫn chưa sẵn sàng.

## 5. Đợt D — Giảm cảm giác đứng trang, giữ số request trong ngân sách

Thực hiện sau khi baseline/trace đã ổn định; đây là mục trải nghiệm riêng, không thay cho sửa latency.

- Public Back/search/detail: tận dụng cache còn fresh hiện có; với bản stale, thiết kế hiển thị snapshot gần nhất có giới hạn tuổi và trạng thái đang cập nhật, kèm đúng URL/filter/sort/scroll. Một revalidation/key, epoch/version guard và hủy subscriber đúng; response cũ không ghi đè route mới. Không mở rộng freshness giao dịch.
- Route private: hiện shell/skeleton đúng trang ngay khi chuyển, không để nội dung route cũ có nút thao tác gây nhầm. Giữ session/authorization trước dữ liệu private; không cache shared cart/account/checkout. Logout/đổi user phải xóa snapshot và hủy request cũ.
- Giao dịch vẫn chờ cart write/revision, context và quote hợp lệ; không dùng stale để xác nhận giá/tồn kho hoặc tạo đơn. Không tự retry mutation thiếu idempotency.
- Chỉ thử prefetch public theo hover/focus sau khi có dedup theo subscriber: tối đa một request ý định đang chạy, bỏ trên Save-Data/tab hidden; không prefetch toàn grid. Giữ nếu giảm route-ready và tổng request/bytes không vượt ngân sách đã công bố. Không warm-up định kỳ.

Kiểm chuyển nhanh/Back/đổi filter/offline/retry/logout/login khác user; hiện lỗi có cách thử lại. Đo **feedback**, **nội dung sẵn sàng**, **checkout-ready** riêng, tránh lấy skeleton/LCP khung làm kết quả tải dữ liệu.

## 6. Ngưỡng nghiệm thu và trình tự release

| Chỉ số | Ngưỡng đề xuất, chưa đạt/không phải cam kết |
|---|---|
| Private warm end-to-end | p95 ≤500 ms/endpoint, tỷ lệ >1 giây <5%, đánh giá lỗi riêng |
| Public CDN HIT | p95 ≤200 ms trong lab mạng kiểm soát; báo riêng số field |
| App warm | session/cart p95 ≤50 ms, context/catalog/search p95 ≤100 ms; không thay end-to-end |
| Phản hồi thao tác | p95 feedback ≤100 ms; public memory-hit route-ready p95 ≤200 ms |
| Cold | Báo từng lần và median/max; mục tiêu thử nghiệm median ≤2,5 giây nếu thành phần kiểm soát được cho phép. Không hứa xóa cold trên scale-to-zero. |
| Request budget | Signed-in public startup ≤2 API; checkout sau session ≤1 context +1 quote khi không có thao tác đổi lựa chọn; Back fresh 0 public fetch; revalidation 1/key |
| Đúng dữ liệu | Không rò private/cross-user, không mất cart update, stale quote phải bị từ chối; không phát sinh mutation từ prefetch |

Thứ tự: **A → B → chọn C → D → release**. A/B là ưu tiên cao nhất; chưa ấn định thời gian hoàn tất cold vì cần nhiều cửa sổ idle và traffic thực có thể giữ instance nóng.

1. Bổ sung instrumentation và runner; test timestamp/abort/reuse/HEAD/write error/log redaction, fixture HTTP concurrency 1/10.
2. Baseline cùng source, tái hiện tail; chọn một fix theo bảng C, ghi lý do và điều kiện rollback.
3. Regression npm + CTest trên hai DB và Chromium: startup/checkout, multi-tab cart, quote thay đổi, public cache freshness/invalidation, private session isolation. So overhead instrumentation với baseline, không để logging thành nút nghẽn.
4. CI đúng commit → Preview dùng dữ liệu giả → Production đúng cấu hình hiện có; không promote Preview fixture. Xác nhận alias/hash; đo lại warm/cold/cache/browser theo cùng phương pháp.
5. Giữ rollback về deployment ngay trước thử nghiệm, xác nhận lại ID tại thời điểm release. Rollback nếu tăng lỗi/reset, p95 xấu hơn baseline trên hai block đối chứng, sai freshness hoặc sai dữ liệu. Không đóng hạng mục chỉ vì median tốt hơn.
6. Hồ sơ cuối gồm source/deployment, script/config, bảng toàn mẫu, trace chậm, số request, hạn chế thiết bị và mục tiêu đạt/chưa đạt. Nếu latency vẫn ngoài phần kiểm soát, giữ mục mở và nêu rõ giới hạn; không tự chuyển hạ tầng hoặc nâng gói.

## 7. Nguồn và giới hạn áp dụng

- Code đã đọc: `backend/src/main.cpp`, `backend/include/http_runtime.h`, `backend/src/application.cpp`, `backend/src/database.cpp`, `frontend/api.js`, `frontend/app.js`, `Dockerfile.vercel`, `vercel.json`, cpp-httplib pin/checksum trong `CMakeLists.txt`.
- Artifact lịch sử: `infra5-production-probe.json`, `infra5-final-smoke.json`, `infra5-final-browser.json`. Không chạy lại benchmark hoặc thay Production trong lượt lập kế hoạch này.
- [Vercel Container Runtime](https://vercel.com/docs/functions/runtimes/container), đối chiếu 28/10/2026: tự scale xuống sau 5 phút không traffic ở Production/30 giây Preview; stdout/stderr cần request ID riêng để nối log. Vì vậy giữ hạ tầng hiện tại không đồng nghĩa bảo đảm instance luôn nóng.
- [Vercel debug cache](https://vercel.com/docs/caching/cdn-cache/debug-cache-issues): kiểm timing/cache headers/logs và deployment trước khi kết luận. Không purge toàn CDN để thử tốc độ thông thường.

Kế hoạch không giả định Next.js/ISR: dự án hiện là Vite + C++ container qua Vercel Services. Không áp dụng bytecode cache Node.js hoặc API cache SDK JavaScript như giải pháp trực tiếp cho process C++.

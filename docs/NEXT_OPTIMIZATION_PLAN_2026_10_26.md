# Kiểm tra bổ sung và kế hoạch tối ưu tiếp theo — 26/10/2026

## Kết luận

**Chưa thể nghiệm thu “web chạy mượt”.** Bản đang chạy đúng bản đã phát hành, các phép đọc trong đợt này đều HTTP 200, nhưng còn độ trễ đáng kể và đã tái hiện thêm lỗi nhất quán checkout/giỏ hàng. Ưu tiên tiếp theo là bảo đảm số tiền người dùng xác nhận khớp đơn được tạo, rồi xử lý phần chờ ngoài handler bằng phép đo có đối chứng.

Đợt này là **kiểm tra và lập kế hoạch**. Không sửa mã ứng dụng, không deploy mới, không tạo đơn hoặc thanh toán trên Production. Đơn COD dùng để tái hiện chỉ tồn tại trong database SQLite thử nghiệm mới, mọi tích hợp bên ngoài bị tắt. Các phép đọc private trên Production dùng phiên tạm và đã đăng xuất.

Tiếp nối [báo cáo bản sửa đã triển khai](PERFORMANCE_FIX_FOLLOWUP_2026_10_26.md). Các kết quả 36/36 SQLite, 36/36 PostgreSQL và CTest 7/7 trong báo cáo đó là baseline trước phát hành, không phải một lượt chạy lại trong đợt audit này.

## 1. Bằng chứng hiện tại

### Production

- Alias `https://shoppec.vercel.app` xác nhận lại trỏ đến `dpl_9VQ6DibYMHefdCNGtSnzFLY1wshP`.
- Bundle `index-BuzD24aE.js` khớp byte với local; SHA-256 `d0ab2b00c383c5ae501caebb71c95d041a8401f3ff93aed8794139ded177ee15`.
- Công cụ runtime error không ghi nhận cluster lỗi trong cửa sổ một giờ tại thời điểm đầu audit. Điều này không chứng minh mọi luồng nghiệp vụ đều đúng.
- Catalog vẫn có 1.000 sản phẩm, trang đầu 12 card. Trình duyệt kiểm tra tìm kiếm `tai`, sắp xếp giá, Back và mở chi tiết; tiêu đề, input tìm kiếm và lựa chọn sort khớp trạng thái sau khi route hoàn tất. Trang chi tiết kiểm tra không có ảnh hỏng hoặc tràn ngang desktop; không có console warning/error trong log thu được.

Đo HTTP tuần tự từ một runner, lúc **16:32–16:33 UTC+7**. Mẫu nhỏ, không phải field p95 và không dùng để suy rộng mọi người dùng:

| Phép đo | Số mẫu | Kết quả |
|---|---:|---|
| Health lần đầu | 1 | 3.579 ms; app 9,52 ms; tuổi instance ~18 ms |
| Health cùng instance sau đó | 10 | Median 147,8 ms; min 120,9; max 1.036,8 ms |
| Catalog gộp metadata MISS / HIT | 2 | 179,3 / 111,5 ms |
| Chi tiết sản phẩm MISS | 1 | 876,4 ms |
| Catalog shop MISS | 1 | 1.029,8 ms |
| Tìm kiếm MISS | 1 | 1.127,2 ms; app 88,69 ms |
| Session private | 3 | Median 997,9 ms; app ~16–17 ms |
| Giỏ private | 3 | Median 1.072,5 ms; app ~17 ms |
| Products admin + editor | 3 | Median 1.147,6 ms; app ~43–45 ms |

Các mẫu private đều thuộc cùng instance; pool wait trong các mẫu đó dưới 0,002 ms. Không có bằng chứng pool DB bão hòa trong bài đo tuần tự này. Ngay cả health warm cũng có mẫu ~1 giây, nên không thể giải thích toàn bộ bằng query catalog hoặc cold start.

Trình duyệt IAB ghi riêng: home ~3.777 ms; search có lượt ~305 ms và lượt ~4.210 ms; Back về search ~4.047 ms; chi tiết ~3.910 ms. API tương ứng của những lượt chậm cũng mất ~3,8–4,2 giây, trong khi app đo ~14–157 ms. Môi trường trình duyệt và runner HTTP không được kiểm soát để coi là cùng điều kiện mạng; không so sánh trực tiếp thành tỷ lệ cải thiện.

Một mẫu INP là **3.904 ms**, gồm processing ~12,6 ms và presentation ~3.891 ms, input delay 0; long frame ghi 973 ms nhưng blocking 0. Đây là tín hiệu chưa đạt, cần trace trên Chrome/thiết bị thật. Không kết luận JavaScript chặn 3,9 giây, cũng không bỏ mẫu xấu vì một lần đo trước từng đạt 8 ms. LCP 2.212 ms của document này không thay thế thời gian sản phẩm thực sự sẵn sàng.

Phần chờ ngoài `app` có thể gồm mạng, platform routing, hàng đợi worker, đọc kết nối và truyền response. Server-Timing hiện bắt đầu ở application handler, chưa phân rã được toàn bộ các phần đó. **Chưa đủ bằng chứng quy một nguyên nhân duy nhất hoặc quyết định chuyển host ngay.**

### Tái hiện nghiệp vụ trên localhost

| Trường hợp | Bằng chứng | Kết quả |
|---|---|---|
| Tab A báo giá, tab B sửa giỏ, A đặt đơn | Báo 1 món / 925.000 ₫; B đổi thành 3 món | Backend chấp nhận đơn 3 món / 2.705.000 ₫ mà không yêu cầu A xác nhận lại tổng |
| Đổi voucher khi quote cũ đang chờ | Delay response quote 3 giây; áp dụng CHAO10 rồi xóa input trước response | Response cũ hiện 875.000 ₫ và bật Đặt hàng dù input voucher rỗng; API đặt đơn không voucher tính 925.000 ₫ |
| Hai phiên cùng đọc giỏ rồi thêm hai món khác nhau | A thêm product-2, B gửi snapshot cũ kèm product-3 | Request B thành công và làm mất product-2 |
| Admin users với dữ liệu lớn | 5.000 user giả inactive, yêu cầu `page_size=50` | Trả 5.004 user, 867.231 byte; app local 130,7 ms, chưa gồm dựng 5.004 hàng DOM |

Sửa voucher sau khi quote đã hoàn tất **đang khóa nút đúng**. Lỗi mới nằm ở phản hồi đang bay: handler input xóa `state.quote` nhưng không đổi `quoteRevision`, nên quote cũ vẫn được nhận. Không mô tả sai thành mọi lần sửa voucher đều bị lỗi.

## 2. Danh sách ưu tiên

P1: cần xử lý trước khi nghiệm thu mua hàng/hiệu năng. P2: xử lý tiếp để tránh mất thao tác hoặc lag khi dữ liệu tăng. P3: củng cố vận hành theo mức sử dụng.

| ID | Mức | Trạng thái | Vấn đề và phạm vi |
|---|---|---|---|
| C1 | P1 | Đã tái hiện UI + API local | Quote cũ ghi đè trạng thái voucher mới khi request đang bay |
| C2 | P1 | Đã tái hiện API local + xác minh code | Tạo đơn đọc giỏ/giá/voucher mới mà không ràng buộc snapshot người mua đã xem |
| L1 | P1 | Đã đo Production | Cold ~3,6 giây; warm/private có jitter ~1 giây; browser route có lượt ~4 giây |
| V1 | P1 | Khoảng trống kiểm chứng | Chưa có trace thiết bị thật/field p75; INP automation biến động lớn |
| C3 | P2 | Đã tái hiện hai phiên local | PUT giỏ thay toàn bộ snapshot, thiếu revision/CAS nên ghi đè chéo tab/thiết bị |
| D1 | P2 | Users đã đo; các endpoint khác xác minh code | Chưa giới hạn admin users/shops, approved-shop selector, public reviews, wishlist, conversations, vouchers; export/retry mail còn xử lý toàn tập |
| R1 | P2, điều kiện trước release kế tiếp | Đã kiểm tra Git | Bản phát hành hiện có nhiều thay đổi chưa commit/push; remote CI chưa xác nhận chính snapshot đã deploy |
| O1 | P3 | Rủi ro cần thử staging | SLA gửi mail khi instance nghỉ, retry/lease recovery; kiểm chứng tích hợp chat/payment đầy đủ với dữ liệu thử |

## 3. Kế hoạch triển khai

### Đợt A — Khớp báo giá, đơn hàng và giỏ

**C1, frontend:** tăng revision khi bất kỳ input ảnh hưởng quote thay đổi; hủy/loại response cũ theo revision và fingerprint payload. Giữ Đặt hàng bị khóa đến khi có quote đúng input hiện tại. Snapshot request phải được lấy trước khi gọi API, không đọc lại form để coi response cũ là của input mới.

Điểm sửa: `frontend/app.js` hàm `quoteCheckout` khoảng dòng 694, listener input khoảng 1956 và submit checkout khoảng 2066. Kiểm thử có điều khiển thứ tự response: nhập voucher → quote A → sửa input → A trả về; quote A/B trả ngược; đổi địa chỉ hoặc rời route trong lúc quote. Mọi trường hợp response cũ không được bật Đặt hàng.

**C2, backend + frontend:** trả một fingerprint/token báo giá được server tạo từ snapshot chuẩn hóa: user, dòng hàng đã chọn, số lượng, giá hiện hành, địa chỉ/ship, voucher/discount và thời hạn. Submit gửi tham chiếu này. Trong transaction tạo đơn, backend đọc dữ liệu hiện tại và đối chiếu; khác snapshot thì trả `409 quote_changed` trước khi tạo checkout/order, trừ stock hoặc redeem voucher. Frontend hiển thị thông tin đã thay đổi và yêu cầu xác nhận tổng mới. Không dùng số tiền client gửi làm nguồn tính tiền.

Giữ quy tắc retry: nếu cùng idempotency key đã tạo checkout thành công thì trả lại checkout đó, kể cả giỏ đã bị xóa sau lần thành công hoặc quote hết hạn sau đó. Kiểm thử duplicate submit/response timeout để không tạo thêm đơn hoặc trừ stock lần hai.

**C3, API giỏ:** bổ sung revision và expected revision cho cập nhật giỏ, kiểm tra dưới write transaction; trả conflict nếu snapshot cũ. Client rebase *ý định thay đổi dòng* trên giỏ mới hoặc báo xung đột, không gửi lại toàn bộ snapshot cũ một cách mù quáng. Đồng bộ tab bằng BroadcastChannel/focus refresh giúp giao diện cập nhật, nhưng backend revision vẫn quyết định cho cả thiết bị khác.

Nghiệm thu trên SQLite **và PostgreSQL**: hai phiên đổi giỏ/giá/voucher sau quote không tạo đơn âm thầm với tổng mới; response cũ không mở nút; hai tab thêm hai món không làm mất một món; stock/voucher/idempotency giữ đúng; lỗi ghi giỏ chặn checkout. Không tạo đơn thật để kiểm thử trên Production.

### Đợt B — Tách và giảm nguồn chờ L1

1. Gắn request ID xuyên suốt các mốc nhận socket/request, bắt đầu worker, bắt đầu/kết thúc app, hoàn tất ghi response; thu queue wait, DB pool wait/SQL, instance age, cache status và client TTFB. Không tính `client duration - app` thành riêng “Vercel overhead”.
2. Benchmark staging cùng region, cùng binary/dataset, cùng runner: ít nhất 100 request/endpoint ở concurrency 1 và 10, lặp ba lượt; thêm 20 kết nối idle để kiểm tra worker không bị chiếm hết. Endpoint gồm health, catalog MISS/HIT, detail nhiều review, cart, editor và quote. Tách GET, POST, có/không reuse connection. Bài tải không chạy trên Production.
3. So sánh cấu hình hiện tại với một thay đổi transport/worker mỗi lần. cpp-httplib hiện có 4 worker và keep-alive count 1; phải test chính xác đơn vị timeout theo phiên bản thư viện. Không tái dùng thí nghiệm keep-alive 100 ms đã bị loại. Tăng worker chỉ khi có bằng chứng queue; tính tổng connection DB theo số instance, không tăng cả pool lẫn worker tùy ý.
4. Tách bài cold: chờ idle thực sự trong staging theo chính sách môi trường, đánh dấu bằng instance mới/age. Không gọi liên tục health rồi tuyên bố hết cold start. Vercel công bố tự scale xuống sau 5 phút không traffic Production và 30 giây Preview ([Container Runtime](https://vercel.com/docs/functions/runtimes/container)).
5. Nếu sau đối chứng vẫn không đạt ngân sách, benchmark cùng backend C++ trên dịch vụ chạy liên tục ở Singapore, cùng database thử và frontend Vercel. Chốt giá, vận hành, bảo vệ origin, cookie/CSRF, webhook URL, DB connection budget và rollback trước khi chọn. Không cần đổi framework để làm phép đối chứng.

Ngân sách đề xuất cho bài staging có mạng được kiểm soát: warm API cart/quote/editor p95 ≤500 ms; public cache HIT p95 ≤200 ms; không có đợt warm lặp lại >1 giây không giải thích được. Nếu không đạt, giữ trạng thái chưa nghiệm thu và chọn phương án dựa trên trace. Mục tiêu này là tiêu chí sản phẩm đề xuất, không phải cam kết sẵn của Vercel.

### Đợt C — Giới hạn dữ liệu D1

- Admin users/shops: page 50, max 100; tìm kiếm/lọc/sort ở server, thứ tự ổn định. Selector approved shops chuyển sang tìm kiếm có giới hạn thay vì đính toàn bộ shop vào editor khi số lượng lớn.
- Public detail: chỉ gửi trang review đầu (ví dụ 20) và tổng số/rating aggregate; endpoint tải thêm. Hiện detail đọc cả reviews để render và `productView` cũng duyệt reviews, cần loại đọc lặp. Không xóa mô tả đầy đủ hoặc review khỏi hệ thống.
- Wishlist, danh sách hội thoại và vouchers: pagination/cursor, giới hạn response; lọc thời hạn voucher ở SQL. Riêng messages đã có limit/delta, giữ logic đó.
- Export: đọc theo chunk/cursor và stream hoặc job có file kết quả; không dựng toàn catalog/orders thành một chuỗi lớn trong request khi dữ liệu tăng. Retry mail xử lý batch có giới hạn và không đưa mail đang gửi vào hàng đợi lại.

Nghiệm thu fixture PostgreSQL 10.000 user/shop và nhiều review: page 50 trả tối đa 50 dòng, DOM theo page; query không kéo toàn tập để phân trang bằng JavaScript; thao tác filter/page không mất quyền/scope. Đo bytes, query count, app time và browser render trước/sau. Tăng dataset không làm response trang đầu tăng tuyến tính theo tổng dữ liệu.

### Đợt D — Kiểm thử thật, CI và phát hành

**V1:** kiểm tra Chrome foreground trên máy tính và Android tầm trung, mạng Wi-Fi/4G và một cấu hình throttle cố định. Mỗi luồng ít nhất 10 lần: tải đầu sau idle, tìm kiếm, sort, phân trang, detail, tăng/giảm nhanh, tick chọn, checkout, voucher, Back/Forward, login/logout, admin search/editor. Trace mẫu xấu phải tách input/processing/presentation và request; lưu cả mẫu tốt lẫn xấu. Không coi simulator viewport là chứng minh thiết bị thật mượt.

Mục tiêu trải nghiệm: feedback click ≤100 ms; chuyển view đã cache ≤200 ms trong bài lab. Với dữ liệu thực tế đủ mẫu, nghiệm thu riêng mobile/desktop theo p75 LCP ≤2,5 giây, INP ≤200 ms, CLS ≤0,1 theo [Web Vitals](https://web.dev/articles/vitals). Báo riêng thời gian catalog/checkout sẵn sàng, vì LCP của phần khung có thể tốt trong khi dữ liệu vẫn chưa tải.

Hiện debug chỉ giữ/log tại máy, chưa có telemetry tập trung. Nếu bổ sung RUM, chỉ tổng hợp route chuẩn hóa, loại thiết bị, timing/cache/instance bucket; không thu input, query tìm kiếm, email, địa chỉ, cart/order ID hoặc token. Không cần RUM để chạy bộ browser lab trước.

**O1:** staging kiểm thử hai người dùng chat thực, hidden/resume, delta/history, mất mạng/retry; callback thanh toán trùng/đảo thứ tự/hủy/late receipt bằng payload thử đã ký; outbox restart sau claim và sau gửi trước acknowledge. Muốn xác minh Google OAuth thật cần người dùng thực hiện xác nhận; phạm vi chấp thuận hiện có chỉ đến giao diện trước xác nhận Google. Mọi tích hợp mail/payment dùng sandbox hoặc mock được xác định rõ, không phát sinh gửi/thanh toán thật trong smoke test.

**R1:** trước release kế tiếp, review và đưa đúng source vào commit, chạy CI SQLite/PostgreSQL/container trên commit đó, thêm browser regression C1/C2/C3 và smoke login/search/checkout không đặt đơn thật. Lưu commit + manifest/bundle hash + deployment ID + DB migration version + rollback target. Preview phải qua gate trước promote; sau promote đọc lại alias, đối chiếu asset, smoke API và đo warm/cold riêng. Báo cáo snapshot hiện tại giúp khôi phục, nhưng chưa thay thế được commit và remote CI.

## 4. Thứ tự thực hiện và điều kiện hoàn tất

1. **C1 + C2 trước**, kèm regression có điều khiển timing; triển khai C3 trong cùng giai đoạn nhất quán dữ liệu. Đây là lỗi đã tái hiện, có thể sửa mà chưa cần chọn host.
2. **L1 + V1**, thu trace và đối chứng transport/worker. Chỉ chốt hạ tầng chạy liên tục nếu phép đo chứng minh cần thiết và chi phí được chốt.
3. **D1**, phân trang các màn còn lại và kiểm tra dataset lớn.
4. **O1 + R1**, hoàn thiện staging/CI, phát hành một snapshot tái lập được và đo lại Production.

Không đóng việc chỉ vì build/test unit xanh. Nghiệm thu cần đồng thời: không có mismatch quote/order trong các kịch bản đã nêu; không mất cập nhật giỏ; đáp ứng ngân sách API/browser; không tái phát cạn worker/kết nối; CI và source deploy truy được về một commit. Những luồng chưa test thực tế được đánh dấu còn thiếu, không ghi “toàn bộ đã ổn”.

## 5. Hồ sơ kiểm chứng của đợt này

- `artifacts/next-audit-production.json`: số đo HTTP, header timing/instance/cache, bundle hash; không lưu response private hoặc credential.
- `artifacts/next-audit-production-browser.json`: console timing và trạng thái trang chi tiết, không có warning/error trong tập log thu được.
- `artifacts/next-audit-local.json`: ba reproducer checkout/voucher/giỏ trên fixture mới.
- `artifacts/next-audit-quote-browser.json` và `artifacts/next-audit-stale-quote.png`: input voucher rỗng nhưng tổng 875.000 ₫ và Đặt hàng được bật sau response cũ; chỉ localhost.
- `artifacts/next-audit-scale.json`: yêu cầu 50 user nhưng nhận 5.004 trên fixture riêng.
- Script tái hiện `artifacts/next-audit-{production,local,delay,scale}.mjs`; thư mục artifacts bị Git ignore. Script scale chỉ chạy trên fixture `.cache/next-audit-*` và thêm dữ liệu giả; không trỏ vào database Production.

Các server/proxy thử nghiệm và tab tạo cho đợt audit được dọn sau khi lưu bằng chứng. Không thay đổi alias, tài khoản Google hoặc dữ liệu mua hàng Production.

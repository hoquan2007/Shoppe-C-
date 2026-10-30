# Kiểm tra tốc độ và kế hoạch khắc phục — 30/10/2026

## Kết luận

Đã tái hiện hiện tượng chậm trên https://shoppec.vercel.app. Lần mở trang chủ desktop có LCP 6,072 giây; ở viewport điện thoại là 4,204 giây. Tìm kiếm và mở chi tiết cũng có lượt mất khoảng 3,8 giây. Các API vẫn trả HTTP 200: vấn đề nổi bật là latency, không phải lỗi HTTP hàng loạt.

Hai nguyên nhân cần xử lý riêng:

1. Đường gọi backend container có khoảng chờ lớn ngoài handler C++. Nhiều mẫu chậm trùng với request đầu của instance mới; một số request tiếp theo trên cùng instance vẫn gần một giây. Database/pool/socket write không giải thích phần lớn thời gian chờ trong các mẫu đã ghép.
2. Trang chủ chỉ dựng hero, danh mục và sản phẩm sau khi `/api/home` trả về. Vì vậy khoảng chờ API biến thành vài giây chỉ thấy header/footer và trạng thái loading.

Lỗi chức năng xác nhận thêm: production báo `email_configured=false`; trang quên mật khẩu hiển thị dịch vụ chưa cấu hình và khóa nút gửi. Chưa thể sử dụng luồng khôi phục mật khẩu qua email.

Đây là báo cáo và kế hoạch. Chưa thay đổi logic ứng dụng hoặc cấu hình production, chưa triển khai bản sửa.

## Phạm vi và phiên bản

- Kiểm tra ngày 30/10/2026, bắt đầu khoảng 22:29, giờ Việt Nam/Thái Lan (UTC+7).
- Source local/production: `5c0eb6ef2a144c48d505382d8af44edd6547f7c3`.
- Production READY: `dpl_CsiADNpLddjLsMiDpwwNjrk3FKUu`, region `sin1`; alias đã đối chiếu qua Vercel.
- Frontend Vite tĩnh, service guest Node cho session không cookie, backend C++20 Container Runtime, database PostgreSQL ở production.
- Main JS/CSS production khớp byte với build local. JS SHA-256 `b3a645d71fb2ef48202f6ae2a2832d089472b300951ab2d46c3c0ffe16ea0a76`.
- Chỉ đọc production: không đăng nhập, không sửa giỏ/đơn/thanh toán, không gửi email hoặc thay đổi DNS.

## Bằng chứng đo hiện tại

### Trình duyệt

IAB, có cache tài nguyên từ trước, không throttle CPU/network. Viewport điện thoại là mô phỏng kích thước trong cùng browser desktop, không phải thiết bị Android/iOS thật.

| Luồng | Thời gian API | Thời gian handler C++ | DB nằm trong handler | Cache | Kết quả |
| --- | ---: | ---: | ---: | --- | --- |
| Mở home desktop | 4.892 ms | 220,5 ms | 217,8 ms | MISS | LCP 6.072 ms |
| Tìm `tai` | 3.829 ms | 102,6 ms | 100,4 ms | MISS | 12 card / 35 kết quả |
| Mở sản phẩm Beats Flex | 3.764 ms | 33,2 ms | 31,3 ms | MISS | Chi tiết hiển thị đúng |
| Mở home viewport 390 × 844 | 3.619 ms | 53,7 ms | 51,4 ms | MISS | LCP 4.204 ms |

Home desktop: HTML TTFB ~259 ms, FCP 1.128 ms. `/api/home` bắt đầu ở ~1.137 ms; chờ headers ~4.769 ms, tải body ~1 ms. CLS ~0,044. Một tương tác có INP 16 ms; không dùng một mẫu này làm field p75.

Search/home ở các viewport đã kiểm tra không có document overflow ngang, không có ảnh đã tải bị hỏng. Ảnh lazy chưa được yêu cầu không tính là lỗi ảnh. Không thu được console warning/error trong luồng home → search → detail và home/forgot trên màn hình nhỏ.

### GET tuần tự, không cookie

Runner có sẵn thực hiện 100 mẫu đo, 10 mẫu/endpoint/protocol, xen kẽ H1 reuse và H2 reuse; thêm một GET khởi đầu riêng. Tất cả 101 GET trả 200. Các nhóm có median 73–148 ms; mẫu lớn nhất trong các nhóm đo là ~906 ms. Không tính p95 với chỉ 10 mẫu mỗi nhóm.

Phép đo bổ sung 19 GET không cache-bust, gồm 5 mẫu cho mỗi route home/search/detail và 4 kiểm tra meta/asset:

| Route | MISS quan sát được | App của MISS | Bốn HIT sau đó |
| --- | ---: | ---: | ---: |
| `/api/home` | 4.222 ms | 45,9 ms | 69,5–95,4 ms |
| `/api/products?include=meta&q=tai` | 1.124 ms | 72,3 ms | 69,1–99,2 ms |
| `/api/products/demo-shoppe-107-3?view=public` | 986 ms | 20,5 ms | 64,8–73,4 ms |

Home MISS có instance age ~24,8 ms/request thứ 1. Search/detail MISS tiếp theo dùng cùng instance, request thứ 2/3, age ~1,13/2,17 giây. Điều này cho thấy không thể chỉ tối ưu lúc khởi tạo rồi mặc định mọi request sau sẽ nhanh.

Các HIT lặp lại `Server-Timing`, request ID và instance age của lần tạo cache. Chỉ dùng MISS để ghép log origin; không hiểu age cũ trên HIT là một lần cold mới.

### Ghép log ứng dụng

Home desktop ghép request `d75e43a00ed859d9`, instance `85b84a6a0af71261`: request đầu, instance age ~25 ms, 10 query, pool ~0,001 ms, handler 220,45 ms, socket write ~0,035 ms. Process → listen của instance là ~63,33 ms, chưa tính thời gian nền tảng chuẩn bị trước khi process chạy.

Home GET bổ sung ghép `80afbd7e76434da2`, instance `d3f63c3d5bed2165`: handler ~45,92 ms, request → write end ~46,99 ms, socket write ~0,031 ms, trong khi client mất 4.222 ms.

Search/detail trên browser lần lượt ghép `3711cb0ac284b1a5` và `75433d9f6801f540`; đều là request đầu của instance mới, age ~25/32 ms. Dùng ID/path bên trong JSON của ứng dụng: log stdout container có thể được broadcast tới các invocation đang chạy, nên wrapper Vercel không luôn là request tương ứng.

Trace ingress mới của request home không có sẵn (`Trace not found`). Kết luận chắc chắn của đợt này là phần lớn chờ nằm ngoài handler C++; chưa gán chính xác toàn bộ phần dư cho riêng scheduling, khởi tạo image, routing hoặc mạng. [Trace cũ ngày 28/10](FIRST_BYTE_EXECUTION_RESULT_2026_10_28.md) từng chỉ ra chờ trước Invoke Function, hỗ trợ hướng điều tra nhưng không thay thế trace hiện tại.

## Các vấn đề và mức ưu tiên

| Mức | Vấn đề | Mức xác nhận | Hướng xử lý |
| --- | --- | --- | --- |
| P1 | Backend MISS/instance mới chờ 3,6–4,9 giây; có MISS tiếp theo gần 1 giây | Tái hiện bằng browser, GET và app log | Điều tra lifecycle/dispatch; đối chứng deployment/runtime, giữ C++ nghiệp vụ |
| P1 | Nội dung trang chủ phụ thuộc toàn bộ `/home` | Xác nhận `home()` await trước khi trả HTML, `renderRoute()` mới thay nội dung | Render trước phần tĩnh có ích; khung giữ chỗ cho phần dữ liệu; lỗi/retry theo vùng |
| P1 | Email khôi phục/xác minh chưa hoạt động | Meta false; forgot có thông báo và nút disabled | Hoàn tất sender/domain và kiểm thử ứng dụng gửi email |
| P2 | Bộ CSS ~96,69 KB raw, nhiều lớp style kế thừa | Build xác nhận; chưa đo unused coverage | Đo coverage theo route, gộp rule dư; tách mã workspace khi có lợi |
| P2 | Chưa có thống kê trải nghiệm người dùng theo thời gian | `performance.js` giữ mark cục bộ/debug log | Bổ sung phép đo có phân nhóm cache/route/device và aggregation tối thiểu |
| P2 | Lỗi tải trang chỉ có đường quay về home | Catch của `renderRoute()` | Nút thử lại đúng route và thông báo chờ lâu; giữ navigation hoạt động |

Không phát hiện lỗi cú pháp/build frontend hoặc lỗi logic trong các unit/API test đã chạy. Runtime error clusters 24 giờ và warning/error/fatal logs 30 phút tại thời điểm tra cứu không có kết quả; điều này không chứng minh mọi luồng đều không lỗi.

## Kế hoạch thực hiện

Ước lượng cho một người triển khai, chưa tính thời gian chờ hỗ trợ nền tảng hoặc xác minh DNS. Các đầu việc có thể chồng thời gian.

### 1. Tạo nội dung xuất hiện sớm và khả năng phục hồi — 0,5–1 ngày

Phạm vi: `frontend/index.html`, `frontend/app.js`, CSS hiện hành; thêm kiểm thử browser cho trạng thái API chậm/lỗi.

- Render tiêu đề/giới thiệu/CTA tĩnh ngay; dùng khung đúng kích thước cho danh mục, ảnh hero và lưới sản phẩm. `/home` vẫn là một request dữ liệu gộp, không tách thành nhiều GET tuần tự.
- Không chờ session để hiển thị catalog; giữ hành vi public/session chạy song song đang có.
- Cập nhật riêng vùng dữ liệu khi API hoàn tất, giữ focus/scroll ổn định. Khi điều hướng, tiếp tục chặn thao tác lên dữ liệu route cũ và bỏ response đến muộn bằng route version/AbortController.
- Sau vài giây chờ, hiện thông báo kết nối chậm; khi thất bại cho thử lại route hiện tại. Giữ tổng deadline/retry có giới hạn đang có, không tăng timeout để che lỗi.
- Không hiện giá/tồn kho giả; không bật mua hàng trước dữ liệu hợp lệ. Đo riêng lúc nội dung tĩnh hiện và lúc sản phẩm thật sẵn sàng, tránh chỉ cải thiện LCP của tiêu đề rồi tuyên bố catalog đã nhanh.

Nghiệm thu: giữ `/home` pending 5 giây vẫn thấy nội dung tĩnh/CTA và navigation dùng được; chỉ một GET home; khung không nhảy khi thay dữ liệu; 503/timeout có retry đúng route; điều hướng nhanh không ghi đè trang mới.

### 2. Giảm chờ origin/container — 0,5 ngày đo sâu + 1–2 ngày thử nghiệm

Phạm vi: request trace, `Dockerfile.vercel`, `vercel.json`, startup/runtime hiện có. Chỉ thay cấu hình có cơ sở và có thể đối chứng.

- Thu ít nhất 10 lần instance mới có ID/age xác nhận; chia khoảng idle khoảng 6 phút trở lên theo cơ chế scale-in được công bố, nhưng không mặc định idle đồng nghĩa cold. Tránh probe khác giữ instance ấm trong khoảng đo.
- Thu tối thiểu 30 warm MISS mỗi nhóm mục tiêu, tách HIT/STALE/MISS và protocol. Nếu phải cache-bust cho đối chứng origin, ghi rõ đó là phép đo nhân tạo, không trộn vào phân bố truy cập bình thường.
- Ghép client → ingress trace nếu có → app → socket write; ghi image/deployment/region/instance. Dùng request ID JSON, không chỉ timestamp hoặc wrapper stdout.
- Kiểm kích thước/layer image và dependency runtime. Cắt image/startup nếu có chi phí đo được, không coi giảm vài ms startup C++ là đã chữa vài giây dispatch.
- Chuẩn bị gói bằng chứng tái hiện cho hỗ trợ Vercel; chưa gửi ticket hoặc dữ liệu ra ngoài trong đợt audit này.
- Thử bản Preview chỉ đổi một yếu tố routing/runtime được Vercel hỗ trợ, cùng code/data fixture/region; đo cùng cửa sổ, đảo thứ tự. Chỉ giữ thay đổi nếu giảm tail và giữ parity về API/cache/auth.
- Nếu nền tảng hiện tại vẫn không đạt, lập phương án chạy **cùng backend C++** trên dịch vụ hỗ trợ instance luôn sẵn sàng, giữ frontend CDN. So sánh chi phí, same-origin proxy, cookie/CSRF/TLS, giới hạn DB và rollback trước khi chọn. Đây là quyết định hạ tầng riêng, không mặc định nâng gói hay viết lại toàn bộ API sang Node.

Vercel Container Runtime/Services hiện ở Beta; tài liệu công bố scale-in khi không có traffic 5 phút ở production và 30 giây ở preview. Không dùng kết quả cold của Preview để đại diện lifecycle production. Nguồn: [Container Runtime](https://vercel.com/docs/functions/runtimes/container), [Services](https://vercel.com/docs/services).

### 3. Cache có kiểm soát và ngân sách tài nguyên — 0,5–1 ngày

- Giữ cache public đã hoạt động: catalog hiện `s-maxage=15, stale-while-revalidate=15`, meta 30/30; tài nguyên hash có immutable một năm. Không thêm cache như thể hiện tại chưa có.
- Prefetch theo ý định đã có, tối đa 4 lần/document và một request speculative cùng lúc; browser detail đã dùng pending chung nhưng vẫn chậm vì click gần thời điểm bắt đầu fetch. Giữ dedup/abort/invalidation; không prefetch mọi sản phẩm để làm ấm container.
- Nếu cân nhắc cache lâu hơn hoặc snapshot public, xác định độ cũ tối đa chấp nhận được, cơ chế invalidation khi sửa sản phẩm/shop/giá, và test checkout xác nhận lại giá/tồn kho. Không tăng TTL tùy ý cho dữ liệu thương mại.
- Đo CSS coverage của home/search/detail và seller/admin trước khi xóa; mục tiêu CSS nén ban đầu ≤15 KB nếu coverage cho phép (hiện 18,96 KB gzip). Main JS hiện 40,09 KB gzip; chỉ tách workspace nếu có cải thiện thực tế và không sinh waterfall.
- Motion hiện tải lazy ~28,73 KB gzip, sau dữ liệu; chưa có bằng chứng đây là nguyên nhân chờ API 4 giây. Profile trên mobile chậm rồi quyết định giảm số ảnh eager/animation hoặc hoãn theo idle; giữ reduced-motion/save-data.
- Ảnh hiện dùng thumbnail WebP, có width/height, font tự host/font-display swap. Kiểm tra ảnh LCP thực tế trước khi đổi preload/lazy; không lazy ảnh đầu màn hình. Không suy byte ảnh bằng 0 trong Resource Timing cross-origin là ảnh rỗng/lỗi.

### 4. Khôi phục email — khoảng 0,5 ngày sau khi có DNS/sender

- Đối chiếu cấu hình live với `docs/RESEND_SETUP_2026_10_28.md`; boolean false có thể do thiếu API key hoặc `EMAIL_FROM`, audit này không đọc secret để suy đoán giá trị nào thiếu.
- Dùng domain/subdomain có quyền DNS, xác minh với nhà cung cấp và đặt sender hợp lệ. Không dùng sender thử nghiệm bị giới hạn người nhận làm sender chung cho khách hàng.
- Rà outbox/link đã hết hạn trước khi bật gửi; thử xác minh/khôi phục với tài khoản kiểm thử do chủ dự án kiểm soát và kiểm cả provider event lẫn email nhận được. Không xả hàng loạt outbox cũ.
- Giữ thông báo chưa khả dụng tới khi kiểm chứng thành công; chưa gửi email trong audit.

### 5. Cổng nghiệm thu và theo dõi — 0,5 ngày, sau đó thu mẫu thực tế

| Chỉ số | Mục tiêu đề xuất | Cách đánh giá |
| --- | --- | --- |
| Nội dung tĩnh có ích | ≤1 giây trên cấu hình lab thống nhất | Đo mark riêng, không thay thế products-ready |
| LCP | ≤2,5 giây ở p75 | Mobile/desktop riêng; lab trước, field sau |
| INP / CLS | ≤200 ms / ≤0,1 ở p75 | Luồng tương tác thật, không dựa một click |
| Public API HIT | p95 lab ≤200 ms | ≥30 mẫu, chỉ HIT cùng vùng/mạng |
| Public warm origin MISS | p95 lab ≤500 ms | ≥30 mẫu, chỉ MISS; chưa đạt qua audit này |
| Instance mới | Mục tiêu ≤2 giây dữ liệu, theo dõi từng mẫu/max | ≥10 instance mới, báo rõ đây chưa phải cold percentile ổn định |
| Lỗi chức năng | Không 5xx/unhandled error ở luồng nghiệm thu | Ghi số lần/request/route cụ thể |

Các mốc LCP/INP/CLS dựa trên [Web Vitals](https://web.dev/articles/vitals); các mốc API và products-ready là mục tiêu dự án đề xuất, chưa phải cam kết đã đạt.

Chạy lại JS/API + CTest và browser regression với fixture cô lập: session/cart/checkout race, public cache/credential isolation, route abort, pagination/filter, pending/error/retry, reduced-motion. Khi thay backend phải chạy cả PostgreSQL và SQLite, exact container build và Preview smoke trước production. Có deployment/image rollback xác định; không promote Preview dùng dữ liệu giả thành production.

Đo sau release cùng phương pháp baseline, giữ cả mẫu xấu và tỷ lệ >1 giây; không trộn HIT với MISS để công bố tăng tốc. Nếu thêm thu thập field metrics, chỉ lưu loại route/timing/cache/device cần thiết, không query tìm kiếm, ID khách hàng, cookie hoặc token.

## Kiểm chứng đã chạy và giới hạn

- `npm run check`: đạt.
- `npm run build`: đạt; HTML 1,16 KB, JS 124,36 KB/40,09 KB gzip, CSS 96,69 KB/18,96 KB gzip; chunk motion 72,58 KB/28,73 KB gzip.
- `cmake --build build -j2`: đạt trên SQLite/Windows. Có warning từ vendor `cpp-httplib` ở `CertOpenSystemStoreW(NULL, ...)` (`-Wconversion-null`); chưa có bằng chứng warning này gây chậm production Linux, không sửa vendor trong audit.
- Sau rebuild, `npm test`: 59/59 đạt (~3,80 giây); `ctest --test-dir build --output-on-failure`: 9/9 đạt (~4,77 giây).
- Lượt đầu trong sandbox báo EACCES loopback và test HTTP thất bại; chạy lại cùng suite có quyền mạng loopback thì đạt. Không coi lỗi sandbox là lỗi production.
- Chưa chạy full Playwright regression hoặc PostgreSQL local trong audit này. Luồng mua hàng có tài khoản và email thật chưa được nghiệm thu lại trên production.
- Không có Lighthouse score, CrUX hoặc field p75/p95. Các lần instance mới quan sát được không phải 10 cold có khoảng idle được kiểm soát.

Artifacts local, bị Git ignore:

- `artifacts/performance-audit-2026-10-30/public-probe.json`: 101 GET, runner version/source và từng mẫu.
- `artifacts/performance-audit-2026-10-30/route-probe.json`: 19 GET route/asset, cache/header/hash.
- `artifacts/performance-audit-2026-10-30/route-probe.mjs`: probe public có giới hạn, có thể chạy lại từ root.
- `artifacts/performance-audit-2026-10-30/browser-summary.json`: mẫu browser và log đã ghép.
- `artifacts/performance-audit-2026-10-30/runtime-evidence.txt`: log runtime dùng đối chiếu.
- `artifacts/performance-audit-2026-10-30/tests-node.txt`, `tests-cpp.txt`, `build-cpp.txt`: kết quả kiểm tra local.

Ưu tiên triển khai đề xuất: làm bước 1 và bước 2 trước; hoàn tất email song song khi có sender; tối ưu bundle sau khi có coverage. Những thay đổi nhỏ ở CSS/pool hoặc tăng cache đơn thuần chưa đủ cơ sở để giải quyết các lượt chờ 3–5 giây đã đo.

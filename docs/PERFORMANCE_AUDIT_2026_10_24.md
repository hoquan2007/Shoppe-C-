# Chẩn đoán tải chậm và kế hoạch tối ưu — 24/10/2026

## Kết luận

Đã kiểm tra Production `https://shoppec.vercel.app`, deployment `dpl_HJ23E65anWYVKgXWAdvKP46arWho`, commit `4ce108d`. Vấn đề nổi bật là đường tải đang bắt người mua chờ backend và dữ liệu không cần thiết. Có bằng chứng khởi động container/database trong luồng mở trang; tệp tĩnh chưa được cache hiệu quả; API catalog trả cả 600 sản phẩm; frontend chờ nhiều đợt request trước khi render.

Đây là báo cáo và kế hoạch, **chưa sửa mã chạy, schema, dữ liệu, biến môi trường hoặc deploy**. Catalog và ảnh đang dùng được giữ nguyên. Không đưa lại bộ 74 sản phẩm đã hoàn tác.

## Phạm vi và cách đo

- 22 GET công khai, tuần tự, bằng Node HTTP; 2 GET đối chiếu bằng curl; 3 GET ảnh hiện có. Không phải stress test. Không đăng nhập, tạo đơn hoặc gọi thanh toán.
- Một trang chủ mở bằng trình duyệt thật; kiểm tra DOM, ảnh và console. Ở quan sát đầu tiên sau khi mở tab, trang còn hiển thị “Đang tải nội dung…”, sau đó tải đủ 12 thẻ sản phẩm.
- Đọc log Production gần nhất và metadata deployment. Cửa sổ log 1 giờ bị API từ chối; lấy lại cửa sổ 10 phút thành công. Không coi lỗi log là “không có lỗi hệ thống”.
- Đọc metadata Supabase và SELECT/EXPLAIN ANALYZE trên truy vấn đọc. Không thay schema hoặc cấu hình. Dùng `active = 1` theo kiểu integer hiện có.
- Thời gian HTTP là từ máy đo, gồm mạng/TLS/hạ tầng/ứng dụng. Đây không phải p95 toàn bộ người dùng; không gắn nhãn một mẫu bất kỳ là cold hay warm khi chưa có trace xác nhận.
- API trình duyệt hiện tại không cung cấp Performance API trong phạm vi evaluate, nên chưa có LCP/INP/CLS hoặc waterfall trình duyệt chuẩn. Không suy diễn thời gian công cụ mở tab thành LCP.

## Số đo thực tế

| Hạng mục | Kết quả |
|---|---|
| `/api/products` — 3 lần | TTFB 126–1.018 ms; trung vị 1.012 ms; 600 sản phẩm |
| `/api/products?page=2&limit=12` — 3 lần | TTFB 986–1.059 ms; vẫn 600 sản phẩm, không có phân trang server |
| JSON catalog | 707.281 byte sau giải nén; curl riêng đo 30.590 byte truyền khi yêu cầu Brotli |
| curl đối chiếu catalog | TTFB 4,506 giây; tổng 4,514 giây; HTTP 200 |
| Chi tiết `demo-dummyjson-1` — 2 lần | TTFB 966–1.069 ms; JSON 1.232 byte sau giải nén |
| JS đã build — 2 lần | TTFB 76–1.057 ms; 84.117 byte sau giải nén |
| CSS — 2 lần | TTFB 71–83 ms; 55.928 byte sau giải nén |
| Header API | `Cache-Control: no-store`, `x-vercel-cache: MISS` |
| Header HTML/JS/CSS trong mẫu | `public, max-age=0, must-revalidate`, `MISS`, `age: 0` |
| Ba thumbnail hiện có | HTTP 200, WebP, 5.870 / 8.230 / 10.112 byte; tổng tải 164–464 ms |
| Cache của ba ảnh mẫu | `public, max-age=0, no-store` từ nguồn ảnh |
| Supabase | `ACTIVE_HEALTHY`, `ap-southeast-1`; Vercel `sin1`, cùng khu vực Singapore |
| EXPLAIN đọc 600 sản phẩm | Execution Time **0,295 ms**, shared hit 60, disk read 0 |
| Thống kê SQL catalog đã tích lũy | Products trung bình 1,039 ms / tối đa 46,920 ms; variants 0,228 / 14,645 ms |

Các số trung bình SQL là thống kê tích lũy của các dạng truy vấn tương ứng, không phải phép đo end-to-end cùng request HTTP. EXPLAIN không bao gồm handshake, mạng hoặc dựng JSON trên C++. 707 KB là kích thước JSON giải nén, **không phải** 707 KB truyền qua mạng trong mẫu Brotli.

## Nguyên nhân và bằng chứng mã nguồn

### 1. Mọi request, kể cả frontend, đi vào container C++ — ưu tiên rất cao

`vercel.json:15` rewrite `/(.*)` vào service `shoppe`. `backend/src/main.cpp:92` phục vụ cả file frontend từ container. Mỗi lần container mới lên, trước khi listen, chương trình tạo Database và gọi `app.seed()` (`main.cpp:48`).

Log gần lúc mở trang ghi nhận `CREATE SCHEMA IF NOT EXISTS`, kiểm tra `schema_migrations` rồi `Shoppe C++ listening...`, gắn với request `/`, `/api/auth/me` và `/api/meta`. Đây là bằng chứng startup có xuất hiện trong đường phục vụ người dùng, không phải chỉ xảy ra khi build.

`backend/src/database.cpp:99` mở một kết nối để kiểm tra/tạo schema rồi đóng nó. Sau đó mở kết nối khác qua pool và chạy kiểm tra từng migration. Cả migration và `seed()` dùng transaction ghi/khóa toàn cục. Khi nhiều instance cùng khởi động, khóa chung có khả năng làm chúng chờ nhau; chưa có trace để định lượng phần chờ khóa trong mẫu này.

Hệ quả: người chỉ muốn tải HTML hoặc JS cũng có thể chờ container và database. Chưa phân rã chính xác bao nhiêu ms do runtime/container, handshake, migration hoặc khóa; cần instrumentation ở bước đầu.

### 2. Tệp tĩnh và dữ liệu công khai chưa tận dụng cache — ưu tiên rất cao

Các lượt đo lặp lại vẫn `MISS`. Header JS/CSS có hash chưa có `immutable`. API áp dụng `no-store` chung tại `application.cpp:658`, kể cả catalog và metadata công khai. Điều này làm mở lại trang và điều hướng tiếp tục gọi origin/database.

Cache phải phân biệt dữ liệu công khai và dữ liệu cá nhân. Không sửa bằng cách bật cache toàn bộ `/api/*`: thông tin phiên, CSRF, giỏ, đơn, tài khoản và thanh toán cần tiếp tục riêng tư/`no-store`. Chi tiết sản phẩm hiện có quyền xem bản ẩn theo người dùng, nên chỉ cache representation công khai đã kiểm tra quyền hiển thị.

### 3. Catalog chưa phân trang thật — ưu tiên cao

`application.cpp:1051` lấy toàn bộ sản phẩm active, ghép quan hệ rồi lọc. `productViews()` ở dòng 182 đã batch nên **không phải N+1 theo từng card**; vấn đề là vẫn đọc toàn bộ variants, shops và reviews, kể cả request chỉ cần một danh mục nhỏ.

`frontend/app.js:344` lọc/sắp xếp/phân trang trên toàn mảng. Mỗi trang 12 thẻ vẫn tải 600 sản phẩm, kể cả `page=2&limit=12`. Homepage tải toàn bộ để chọn hero/danh mục rồi chỉ vẽ 12 thẻ. Không thể chỉ cắt mảng homepage còn 12 mà bỏ mất sản phẩm được chọn cho hero/các nhóm ngành.

Với 600 sản phẩm hiện tại, SQL còn nhanh. Đây là khối lượng và thiết kế request cần giảm, chưa phải bằng chứng rằng thêm index đơn lẻ sẽ giải quyết chậm nhiều giây.

### 4. Frontend có chuỗi chờ không cần thiết — ưu tiên cao

`start()` ở `frontend/app.js:1733` chờ `/meta` + `/auth/me`, tiếp tục chờ cart nếu đã đăng nhập, rồi mới render route và gọi API sản phẩm. Homepage lại gọi `/meta` lần nữa ở dòng 302.

`renderRoute():1060` dựng lại toàn shell và spinner mỗi lần điều hướng; không có public data cache hoặc hủy request bằng AbortController trong `api()`. Người dùng đổi trang nhanh vẫn có request cũ tiếp tục chạy, dù version guard đã ngăn render kết quả cũ.

Đây là nguyên nhân trực tiếp làm thời gian chờ mạng hiện rõ thành cảm giác “web lag”. Chưa có đo INP/FPS để kết luận có nghẽn CPU khi cuộn hoặc nhập liệu.

### 5. Ảnh cần tối ưu khả năng dùng lại, nhưng chưa phải tải ảnh quá nặng

Ảnh mẫu đều là WebP thumbnail nhỏ, browser hiện tải được; không có lỗi console trong mẫu. Nguồn ảnh gửi `no-store`, nên người quay lại không được bảo đảm hưởng browser cache. Chưa có `srcset` hay `preconnect` trong HTML; ảnh hero chỉ được phát hiện sau API/render.

Giữ các ảnh hiện tại. Chỉ khi được phép lưu lại asset mới chuyển chính bộ ảnh đó sang Storage/CDN với cache phù hợp; không tự bỏ qua điều khoản hoặc cache directive của nguồn qua proxy, không đổi sang bộ ảnh người dùng đã từ chối.

## Kế hoạch thực hiện

| Đợt | Việc cụ thể | Nghiệm thu |
|---|---|---|
| 0 — Có số đo phân rã | Thêm log JSON/Server-Timing: startup, lấy connection, chờ pool/khóa, SQL, dựng response; request ID, duration, row count; không log key, cookie, email hoặc payload cá nhân | Có trace tách cold startup và request đang dùng instance có sẵn; bộ đo trước/sau chạy cùng cấu hình |
| 1 — Bỏ chờ không cần thiết | Render shell ngay; tải route public song song với metadata/phiên; cart cập nhật sau; dùng lại meta; hủy request route cũ, timeout + retry có giới hạn chỉ cho GET phù hợp | Trang danh sách không phải chờ cart/auth mới bắt đầu lấy sản phẩm; không nhân đôi `/meta`; chuyển trang nhanh không ghi đè kết quả |
| 2 — Giảm tải origin và startup | Phục vụ Vite HTML/JS/CSS bằng frontend static trên Vercel CDN, route `/api/*` vẫn tới C++ container; kiểm tra cấu hình Services hiện có; tách migrate/bootstrap thành bước khởi tạo có kiểm soát, runtime chỉ check schema nhanh, không DDL/seed mỗi startup | HTML/asset vẫn phục vụ khi API không sẵn sàng ở môi trường test; asset hash `max-age=31536000, immutable`, lượt lặp HIT; runtime không tự tạo schema. Migrate hoàn tất trước promotion, checksum/schema-version vẫn được kiểm tra |
| 3 — Catalog gọn, phân trang C++ | C++ xử lý `page`, `page_size` 12/24 và tối đa 48, category/shop/từ khóa/giá/sort; SQL có bind parameters; ID thứ hai làm khóa sắp xếp ổn định; chỉ lấy quan hệ của trang; response có `items,total,page,page_size` | Trang 2 trả đúng 12 sản phẩm, tổng vẫn 600 khi không lọc; không trùng/mất giữa trang khi dữ liệu không đổi; tìm kiếm tiếng Việt/giá không đổi hành vi; không đọc full reviews/variants cho mỗi trang |
| 3b — Dữ liệu homepage | Bundle công khai từ C++ cho hero, category previews, settings cần thiết và 12 gợi ý; hoặc endpoint riêng tương đương để giữ đúng chọn ngành/ảnh | Homepage không cần tải đủ 600 bản ghi; các tab gợi ý/mới nhất/giá lấy đúng phạm vi, không chỉ sort lại 12 bản ghi bất kỳ |
| 4 — Cache có giới hạn | Catalog công khai TTL ngắn ban đầu 15–30s; meta TTL dài hơn; invalidate sau thay đổi shop/sản phẩm; JS cache dữ liệu public theo đầy đủ query; dữ liệu phiên/đơn/payOS không cache chung | Không lộ sản phẩm ẩn hoặc dữ liệu người dùng; cập nhật admin hiện ra trong giới hạn đã định; checkout luôn đọc lại giá/kho và xử lý expiry từ DB |
| 5 — Ảnh và nghiệm thu UX | Giữ ảnh hiện tại, preconnect đúng CDN, ưu tiên hero; chỉ tạo kích thước responsive nếu có quyền host asset; kiểm tra Lighthouse/mobile/slow network + click/scroll | Không đổi catalog/ảnh; đủ kích thước tránh layout shift; có báo cáo trước/sau cả cold/warm và thiết bị di động |

Services của Vercel hiện là Beta; dự án đã dùng mô hình này. Phương án thêm frontend static vẫn giữ toàn bộ frontend/backend trên Vercel. Nếu thay routing chưa thể đưa vào ngay, có thể cấu hình cache HTML/asset từ C++ làm bước chuyển tiếp; cần test header thực tế vì header do function trả có độ ưu tiên riêng.

Không tự tăng pool/thread hoặc bỏ khóa stock để “chạy nhanh”. Pool hiện tối đa 4, server 4 worker; chỉ điều chỉnh sau đo concurrent requests. Database và backend đã cùng vùng, không cần đổi region. Transaction pooler có thể được benchmark sau trong môi trường test; không đổi URI hiện có khi chưa kiểm tra libpq, `SET LOCAL`, transaction và advisory lock.

## Kiểm thử bắt buộc khi triển khai

1. Giữ các test hiện có: session/CSRF, ownership, tồn kho cuối cùng, order state, hết hạn giữ kho, webhook lặp và thanh toán không cấu hình. Không tạo thanh toán thật để benchmark.
2. Test hợp đồng phân trang, tổng số và bộ lọc; không đổi kết quả tìm kiếm tiếng Việt; API input sai bị từ chối; cache không trả draft/giá trị riêng tư.
3. Test schema-check nhanh và quy trình migrate riêng trên database test; không auto DDL khi mở frontend hoặc cold start runtime; không bỏ checksum kiểm tra.
4. Test nhiều người mua cùng sản phẩm trong môi trường test: vẫn không oversell; catalog cache không trở thành nguồn quyết định giá/kho.
5. Kiểm tra mở link trực tiếp `/search`, `/product/:id`, `/login`, tải lại trang; asset không bị catch-all trả HTML; CSP/Google Login và cookie vẫn hoạt động sau tách frontend static.
6. Đo ít nhất 3 lượt cold/warm, desktop/mobile với cùng profile; 20 GET tuần tự để mô tả warm latency. Thử tải đồng thời trong môi trường test, không stress Production hoặc tạo đơn thật.

## Mục tiêu hiệu năng — chưa phải kết quả đạt được

- Catalog một trang chỉ 12/24 sản phẩm; hướng tới JSON giải nén dưới 30 KB mỗi trang hiện tại.
- Warm API public p95 dưới 500 ms tại runner cùng khu vực sau đủ mẫu; báo cold-start riêng, không cam kết cold start bằng 0 trên gói hiện tại.
- Asset có hash được cache browser/CDN; HTML không phụ thuộc khởi tạo database.
- Mục tiêu UX: LCP ≤ 2,5s, INP ≤ 200ms, CLS ≤ 0,1 với phép đo phù hợp. Lighthouse lab chỉ là kiểm tra lab; INP cần tương tác/RUM, không lấy TBT làm INP.
- Mỗi đợt chỉ triển khai tiếp khi số đo cho thấy cải thiện và luồng mua hàng/đăng nhập vẫn đúng.

## Chuẩn bị từ chủ dự án

Chưa cần key mới, đổi ảnh, nâng Vercel hoặc nâng Supabase để làm các đợt đầu. Dùng database test/preview riêng cho migration và thử đồng thời; có thể tạo bản sao không chứa tài khoản/đơn thật hoặc dùng dữ liệu demo hiện có. Xác nhận quyền lưu bộ ảnh hiện tại nếu chọn chuyển ảnh sang Storage. Quyền push/deploy cho thay đổi hiệu năng sẽ được xử lý theo phạm vi người dùng yêu cầu ở bước triển khai; đợt này chỉ chẩn đoán và lên kế hoạch.

## Tài liệu đối chiếu

- [Vercel cache-control headers](https://vercel.com/docs/caching/cache-control-headers): immutable asset, public TTL và dữ liệu riêng tư.
- [Vercel Services](https://vercel.com/docs/services), [configuration](https://vercel.com/docs/services/config-reference): tách static frontend và container backend trong cùng project.
- [Supabase connections/pooler](https://supabase.com/docs/guides/database/connecting-to-postgres): khác biệt session/transaction mode và giới hạn tương ứng.
- [Web Vitals](https://web.dev/articles/vitals): mục tiêu và sự khác biệt đo lab/field.

Raw số đo HTTP và ảnh nằm trong `artifacts/performance-*-2026-10-24.json` (Git ignore). Các file này không chứa key/token/cookie. Đây là dữ liệu của đợt đo nhỏ tại thời điểm kiểm tra, không đại diện mọi thiết bị hoặc mọi mạng.

## Phát hiện bổ sung khi triển khai

Bài đọc 20 request đồng thời local phát hiện `cpp-httplib` giữ worker theo kết nối HTTP, kể cả lúc socket keep-alive nhàn rỗi. Với 4 worker, p95 của đợt thử lên 12.079 ms dù handler từng request chỉ vài ms. Đã đổi upstream server sang một request/kết nối để nhả worker; HTTP/2/TLS công khai do Vercel quản lý, pool database và khóa tồn kho giữ nguyên. Cùng bài local sau sửa: 20/20 đúng, p95 41 ms, tối đa 43 ms. Đây là so sánh local có kiểm soát, không phải p95 người dùng Production. Có test hồi quy tự động 20 GET để bắt lại lỗi này.

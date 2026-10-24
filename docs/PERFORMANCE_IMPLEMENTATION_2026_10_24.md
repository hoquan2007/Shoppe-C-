# Kết quả tối ưu hiệu năng — 24/10/2026

## Đã thực hiện

- API `/products` được lọc/sắp xếp/phân trang bằng C++ và SQL có bind parameters; mặc định 12, tối đa 48, thứ tự ổn định. Chỉ ghép biến thể/shop/review cho ID của trang. Tìm kiếm tiếng Việt dùng cùng quy tắc chuẩn hóa trên SQLite và PostgreSQL, không thêm extension hay migration.
- API `/home` trả 12 gợi ý + metadata + đại diện theo ngành; giữ hero và bộ ảnh hiện có.
- Frontend tải public catalog ngay, không chờ auth/cart; bỏ meta lặp ở homepage; cache public tối đa 15s/32 entry, hủy request route cũ, timeout và tối đa một retry GET; không retry mutation. Giữ đúng phạm vi shop khi lọc/sort/phân trang.
- Frontend Vite độc lập phục vụ qua Vercel CDN; `/api/*` vẫn là C++ container. Header CSP/COOP và asset hash immutable được cấu hình. Bundle service frontend đã build với lockfile riêng và có SHA256 giống bản đã kiểm tra local.
- Production chỉ kiểm tra ledger/checksum bằng transaction đọc; không DDL/seed/bootstrap mỗi cold start. Khởi tạo/migrate là lệnh `shoppe --initialize` có kiểm soát. Không thêm migration và không cần sửa database Production cho bản này.
- Cache public CDN: catalog/home 15s, meta 30s. Phiên, CSRF, cart, orders, payment, admin và draft tiếp tục private/no-store. Checkout luôn kiểm tra giá/kho từ DB. Thay đổi public có thể cần tối đa TTL để hiện cho mọi người; client xóa cache sau mutation.
- Header Server-Timing + request ID và log JSON ghi SQL/pool/handler/startup, không ghi secret/cookie/query-string hoặc payload cá nhân.
- Sửa giữ worker do HTTP keep-alive: nhả worker sau mỗi upstream request; không tăng pool/worker hoặc bỏ khóa tồn kho.

## Kiểm chứng local

| Phép đo | Trước | Sau |
|---|---|---|
| Catalog JSON giải nén | 600 sản phẩm, 707.281 byte Production baseline | 12/600, 14.381 byte trên bản sao local |
| Homepage JSON | Tải toàn catalog + meta lặp | 16.537 byte, gồm 12 sản phẩm và đại diện danh mục |
| 20 GET đồng thời local cùng fixture | p95 12.079 ms | p95 41 ms, max 43 ms; 20/20 trả đúng |
| Truy vấn phiên cố ý chậm 6s | Trước đây catalog chờ phiên theo code | `/home` trả sau 27 ms trong fixture, `/auth/me` sau 6.012 ms; browser đã hiển thị trang chủ khi phiên còn chờ |

Không so thời gian local với Production như một mức tăng tốc được đảm bảo. Các byte là JSON sau giải nén. Không thay ảnh, không tạo thêm sản phẩm, không gọi thanh toán thật.

- CTest: **6/6 nhóm qua**.
- API SQLite: **18/18 ca qua**.
- API PostgreSQL local: **18/18 ca qua**; pool/reuse/read-only runtime/concurrent reads qua.
- Có ca chặn draft trong public catalog, preview có phiên không cache chung, query sai trả 422, phân trang không trùng và 20 GET không bị idle socket giữ worker.
- Browser: trang 2 hiện 13–24/600, sort giá đúng; mobile 390px không tràn ngang, hero/ảnh cũ được giữ. Bản local dùng database sao chép riêng, toàn bộ tích hợp thật bị tắt.
- Chưa đo LCP/INP/CLS chuẩn, chưa lấy p95 field người dùng. Không coi thời gian mở tab hay số đo loopback là Web Vitals.

## Phát hành

Đã phát hành và nghiệm thu domain công khai **https://shoppec.vercel.app** ngày 24/10/2026. Không benchmark bằng đơn hoặc thanh toán thật.

- Commit chạy Production: `51a653317e47f4170ff8df8743664ce361e0b683` (bao gồm thay đổi chính ở `47fa1ed`).
- Deployment: `dpl_BfnDkNnhh89sFP26GQwfEVvDcVTP`, target Production, trạng thái READY, region `sin1`; alias `shoppec.vercel.app` đã gắn đúng deployment.
- [GitHub Actions 40073896176](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40073896176): hai job SQLite/PostgreSQL đều thành công, gồm C++/CTest, API, build container và kiểm tra frontend/container.
- Đối chiếu checksum cả ba migration hiện tại với ledger Supabase trước phát hành: khớp. Không chạy DDL, seed hay sửa catalog Production. Không cần key hoặc migration mới.

## Kết quả trên Production

Mẫu 36 yêu cầu HTTP công khai từ một máy đo; 20 lượt catalog trong cùng mẫu được gọi tuần tự. TTFB gồm mạng/CDN/platform, không phải riêng thời gian C++. Byte bên dưới là sau giải nén, không phải lượng truyền Brotli.

| Phép đo | Kết quả sau phát hành |
|---|---|
| `/api/products` | 12/600 sản phẩm, **14.109 byte**; giảm khoảng **98%** so với baseline 707.281 byte trả cả catalog |
| `/api/home` | **16.287 byte**, đủ metadata, đại diện danh mục và 12 sản phẩm |
| 20 lượt catalog tuần tự | **19/20 cache HIT**, TTFB trung vị **65,5 ms**, p95 mẫu **131 ms**, max **311 ms** |
| JS/CSS gọi lần hai | Cache HIT, TTFB **61/70 ms**, `max-age=31536000, immutable` |
| Handler catalog trên cache MISS | Server-Timing app khoảng **29–30 ms**, DB khoảng **29 ms** |
| Burst 20 GET công khai sau làm nóng cache | **20/20 đúng và HIT**, tổng **278 ms**, p95 mẫu **275 ms**, max **277 ms** |

Đã đối chiếu trang 1/trang 2 không trùng ID, trang cuối 50 đủ 12 sản phẩm, giá tăng đúng theo biến thể đang hoạt động; query sai trả 422/private/no-store; chi tiết hàng công khai trả 200; giỏ hàng chưa đăng nhập trả 401/private/no-store. Cả 36 status trong mẫu chính đều đúng (asset không tồn tại trả 404). Vercel bỏ `s-maxage` khỏi header trả về trình duyệt sau khi sử dụng tại CDN; các lượt HIT và Age đã xác nhận cache hoạt động.

Trang chủ, search, deep link sản phẩm, login và assets đều trả thành công. Browser xác nhận trang 2 hiển thị **13–24/600**, nút Google GIS tải được, không có lỗi/warning console trong các trang đã xem. Mobile viewport 390×844 có document clientWidth/scrollWidth cùng **375 px**, không tràn ngang, ảnh hero/danh mục tải thành công. Ảnh chụp: `artifacts/performance-production-mobile.png` (local, ignored).

`/api/meta` báo payment/storage/google đều đã cấu hình; đây chỉ là kiểm tra cấu hình, **không phải** chứng nhận thanh toán thật hay đăng nhập Google trọn luồng. Log runtime khởi động ghi `schema_mode=verify`, phần khởi động ứng dụng khoảng **47–56 ms**; truy vấn log error trong cửa sổ nghiệm thu 10 phút không có kết quả.

## Giới hạn còn lại và bước tiếp theo

- **Cold start vẫn hiện hữu:** lần gọi backend đầu tiên trong mẫu mất khoảng **4.044 ms**, dù handler chỉ khoảng 12 ms; một burst vào URL catalog chưa có cache mất tối đa **4.995 ms** và 0 HIT. Đây là phần chờ ngoài handler mà tối ưu SQL không loại bỏ được. Không coi các số đo cache HIT là tốc độ mọi lượt truy cập. Cần thu thập thêm log platform để tách chính xác mạng, điều phối và khởi động container; chưa khẳng định mọi giây chờ đều do một nguyên nhân duy nhất.
- Mẫu cũ catalog chỉ có ba lượt (trung vị khoảng 1.012 ms) và số đo sau có cache/mẫu lớn hơn, nên không tuyên bố đây là tỷ lệ tăng tốc đồng nhất cho mọi người dùng. Chưa đo LCP/INP/CLS hoặc p95 thực địa.
- Ưu tiên tiếp theo: đo Web Vitals trên thiết bị thật và đối chiếu request ID/cache MISS với log; theo dõi cache hit rate, tải lần đầu và route riêng tư. Nếu cold start vẫn gây khó chịu, dùng bằng chứng để chọn cách giảm gói khởi động hoặc thay đổi cấu hình vận hành phù hợp ngân sách. Không tự nâng gói hay cài dịch vụ trả phí.
- Cache công khai tối đa 15s (meta 30s); giao dịch vẫn kiểm tra giá/kho trực tiếp. Chưa thêm cơ chế purge CDN tức thời. Trang admin vẫn có API danh sách riêng cần phân trang khi dữ liệu tăng; bản này tập trung đường mua sắm công khai.
- Preview được giữ bảo vệ: công cụ kiểm tra protected Preview bị automatic approval review từ chối vì tạo link chia sẻ tạm/mở thêm quyền truy cập. Không tạo share link và không vượt bảo vệ; thay bằng local/CI và nghiệm thu Production công khai đã được phép phát hành.

Dữ liệu đo local nằm trong các file ignored `artifacts/performance-*.json`. Bộ đo Production dùng GET, không chứa credential/phiên. Một bản kiểm tra phụ ban đầu đọc nhầm `product.price` thay vì giá biến thể; đã sửa bộ đo theo hợp đồng API và chạy lại toàn bộ kiểm tra phụ thành công, không sửa mã ứng dụng vì lỗi bộ đo đó.

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

Chỉ phát hành sau kiểm tra CI Linux/container. Đối chiếu domain, tổng catalog, pagination, cache HIT, asset/deep links, auth riêng tư và lỗi runtime sau phát hành. Không benchmark bằng đơn hoặc thanh toán thật. Số đo Production và deployment ID sẽ được ghi bổ sung sau khi nghiệm thu.

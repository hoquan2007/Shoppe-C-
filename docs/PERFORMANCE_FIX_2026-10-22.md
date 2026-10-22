# Sửa lỗi và tối ưu C++ — 22/10/2026

Mã triển khai cuối: `587664cb264ade1a4e49615eade58c97c99ef30f`, gồm backend `8d13f5f`/`7d85baf` và sửa CSS mobile. Nhánh `codex/deployment-payment-readiness`. Báo cáo cập nhật sau [audit trước sửa](AUDIT_2026-10-22.md). Hướng dẫn tài khoản/key/Shopee: [KEYS_AND_SHOPEE_GUIDE.md](KEYS_AND_SHOPEE_GUIDE.md).

## Thay đổi

1. Pool libpq trong C++, tối đa 4 kết nối trên mỗi container, thay kết nối mới mỗi transaction. Trả kết nối ngay khi commit/rollback; không giữ kết nối trong lúc gọi provider bên ngoài.
2. Gộp BEGIN/search_path/timeout/khóa ghi thành một lượt mạng. GET thuần đọc dùng read-only/repeatable-read, không tranh khóa toàn cục với cập nhật kho. Route cần hết hạn checkout hoặc đánh dấu tin nhắn vẫn dùng transaction ghi.

   GET thuần đọc kiểm tra checkout hết hạn qua index; nếu có, bỏ snapshot và xử lý expiry dưới khóa ghi trước khi trả dữ liệu. Giữ đúng restock khi xem danh mục, không phải chờ cron hằng ngày.

3. Giữ advisory lock xuyên instance cho mutation để bảo vệ kho/voucher. Chỉ retry thiết lập transaction trước SQL nghiệp vụ; không tự phát lại đặt hàng/ghi tiền. Thay socket idle đã đóng khi bắt đầu transaction.
4. Batch checkout/items/returns/refunds theo ID đơn đã được kiểm quyền; batch variants trong dashboard và CSV sản phẩm. Thay các lượt SQL lặp theo từng đơn/sản phẩm ở những màn hình này. Batch dùng placeholders, chia nhóm tối đa 400 ID.
5. Vercel cấu hình runtime `sin1` thay `iad1`, gần Supabase Singapore. Vị trí máy build có thể khác runtime.
6. Giữ `hidden` khi buyer sửa đánh giá. Chỉ admin có thể cho hiện lại.
7. Bảng method/path C++ cho 65 mẫu đường dẫn: sai method 405 kèm Allow, API không tồn tại 404. Chặn POST /cart, GET /payments/webhook và payment subpath tùy ý. HEAD trên route GET trả phần header.
8. CSS mobile: sửa bộ lọc giá bị nút full-width ép hai ô nhập thành ô rất hẹp. Dùng hai cột và nút ở hàng dưới; đã nhập/áp dụng khoảng 100.000–300.000 VNĐ ở viewport 390×844 trên fixture, có 4 sản phẩm phù hợp, hai ô rộng khoảng 151px và không tràn ngang.

Nghiệp vụ vẫn hoàn toàn C++20; HTML/CSS/JavaScript là giao diện. Không thêm backend JavaScript, không thêm secret frontend, không thay schema hay nhập lại catalog.

## Kiểm thử

| Kiểm tra                                       | Kết quả                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| CTest C++ domain/payment/database              | 3/3                                                                                                                |
| HTTP API với SQLite độc lập                    | 15/15                                                                                                              |
| HTTP API với PostgreSQL localhost độc lập      | 15/15                                                                                                              |
| Lỗi biên audit                                 | Sau sửa 6/6; trước sửa 4/6                                                                                         |
| PostgreSQL pool C++                            | Reuse PID, phục hồi socket, read-only chặn ghi, reader không chờ writer, 12 luồng/60 transaction qua pool giới hạn |
| GitHub Actions Linux SQLite + PostgreSQL       | Cả hai job success; build Dockerfile.vercel và smoke frontend/API container                                        |
| Frontend syntax/build, secret scan, diff check | Đạt                                                                                                                |

CI bản cuối: https://github.com/hoquan2007/Shoppe-C-/actions/runs/39809399005. CI bản tối ưu ban đầu: https://github.com/hoquan2007/Shoppe-C-/actions/runs/39808202180.

CI bản thêm CSS: https://github.com/hoquan2007/Shoppe-C-/actions/runs/39810891787.

Fixture bao gồm phân quyền/CSRF/Origin, giá server, nhiều shop, idempotency, mua món cuối đồng thời, hủy/restock, COD, trả một phần, giới hạn hoàn, chữ ký webhook/tiền muộn, token email một lần và restart. Không dùng database Production cho fixture; cluster PostgreSQL local đã được dừng.

## Production và tốc độ

Production **READY**: https://shoppec.vercel.app. Deployment `dpl_3myCo5miftDpuwhft6xisPy3GsCC`, commit `587664c`, runtime **sin1** đã xác minh từ deployment metadata. CI SQLite/PostgreSQL và container của đúng commit đều success.

**36/36 probe Production đạt status kỳ vọng** trên bản cuối; chỉ GET và login/logout, không tạo đơn hoặc chuyển tiền. Bản backend trước CSS cũng đạt 36/36. Ba probe GET kiểm tra method/path trả đúng 405/Allow hoặc 404. Không thấy runtime error/fatal trong cửa sổ 10 phút sau triển khai được lọc theo deployment.

| Endpoint                                  | Trước (ms) | Sau (ms) |
| ----------------------------------------- | ---------: | -------: |
| Danh mục GET /api/products (median 3 mẫu) |       4037 |      192 |
| /api/dashboard?scope=admin                |      12989 |      144 |
| /api/dashboard?scope=seller               |      12888 |     1024 |
| /api/seller/export?kind=products          |      10684 |      201 |

Catalog cuối: 131, 1062, 192 ms; median 192 ms, so với 4037, 3930, 4149 ms trước sửa. Dashboard/export là một mẫu mỗi endpoint trong lượt cuối. Lượt backend sau sửa trước CSS đo dashboard admin 1117 ms, seller 1022 ms, catalog median 306 ms; giữ cả hai lượt để thể hiện dao động, không chọn mẫu tốt nhất làm SLA. Độ trễ còn phụ thuộc mạng, instance và cold start.

Cùng script/client và endpoint, đo tuần tự trên dữ liệu hiện có; không phải load test, p95 hoặc đo với điều kiện mạng được kiểm soát. Request health đầu lượt cuối 938 ms; không đủ bằng chứng gán riêng phần nào cho cold start.

Artifact: `artifacts/audit-production-before-performance-20261022.json`, `artifacts/audit-production-after-cpp-8d13f5f-20261022.json`, `artifacts/audit-production-final-587664c-20261022.json`. Chỉ lưu method/path/status/thời gian, không lưu body riêng tư, cookie hoặc token.

UI đã mở trang chủ, danh mục và chi tiết sản phẩm trên Production; danh mục trả 30 sản phẩm, trang đầu render 12 thẻ. Viewport 390×844 không tràn ngang; không có lỗi JavaScript trong các trang được kiểm tra. Kiểm tra này không thay cho E2E đầy đủ mọi trạng thái buyer/seller/admin.

## Việc còn lại

- Cần bạn cấu hình/xác minh webhook và tự hoàn thành một lần chuyển khoản payOS nhỏ; chưa xác nhận thanh toán ngân hàng end-to-end.
- Còn thiếu Resend API key/sender domain để gửi email thật.
- Chưa có quyền/connector Shopee; catalog hiện là 30 sản phẩm demo. Xem điều kiện Preferred/Mall và giới hạn giao dịch ngoài Shopee trong hướng dẫn.
- Trước khi mở rộng hàng nghìn sản phẩm: thêm pagination/lọc SQL/index, tối ưu ảnh và kiểm thử tải. Pool 4 là mỗi instance; tổng kết nối tăng nếu nền tảng tạo nhiều instance.
- Hobby vẫn có cold start, quota và cron hằng ngày; kết quả này không phải SLA hoặc load test.

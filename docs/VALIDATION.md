# Kết quả kiểm chứng ngày 17/10/2026

## Đã thực hiện

| Hạng mục                                      | Kết quả                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| C++20 build native Windows / MinGW            | Qua, gồm bản SQLite và bản có adapter PostgreSQL                                                          |
| CTest domain/security                         | Qua trên cả hai build                                                                                     |
| HTTP integration với SQLite                   | 13/13 kịch bản qua                                                                                        |
| HTTP integration với PostgreSQL 18.4 cục bộ   | 13/13 kịch bản qua; kiểm tra health xác nhận adapter PostgreSQL                                           |
| Frontend syntax + Vite 7.3.7 production build | Qua                                                                                                       |
| npm audit sau cập nhật dependency             | 0 cảnh báo được registry báo cáo tại thời điểm kiểm tra                                                   |
| Trình duyệt desktop                           | Trang chủ, đăng nhập, chi tiết hàng, giỏ, áp voucher, tạo COD, kết quả, dashboard admin và form thêm hàng |
| Responsive 390 × 844                          | Trang chủ; đã chỉnh khoảng cách hero và đo không tràn ngang toàn trang                                    |

Các kịch bản API bao gồm CSRF/origin, tách quyền shop, CSV xem trước/nhập/xuất, báo giá rollback, chống đặt đơn lặp, giá do server tính, COD và State, trả hàng/hoàn tiền giới hạn, hủy đơn khôi phục kho, đăng ký/duyệt shop, tranh chấp hàng cuối, thiếu cấu hình payOS, chữ ký webhook/duplicate/tiền muộn, dashboard/settings, tìm kiếm có/không dấu, admin sửa hàng/ẩn đánh giá, chat đúng quyền, rate limit và dữ liệu/session còn sau restart backend.

Fixture webhook là server SQLite riêng với khóa thử nghiệm để tránh gọi cổng thanh toán thật. Các luồng nghiệp vụ chính chạy riêng trên từng adapter. Hai suite dùng cổng riêng khi cần; database PostgreSQL của test là database trống, tách dữ liệu chạy preview.

Thư viện C++ HTTP hiện pin cpp-httplib 0.61.0 cùng SHA-256. Lượt build Windows có cảnh báo từ header thư viện về tham số NULL của Windows certificate store; không có lỗi build. Không chỉnh sửa header vendor để che cảnh báo đó.

## Chưa xác minh

- Container Linux: máy hiện chưa có Docker; GitHub Actions đã được thêm nhưng chưa chạy trên GitHub.
- Vercel deployment thực tế: CLI báo token không hợp lệ, cần chủ tài khoản đăng nhập lại.
- Supabase project/Storage thật, email Resend thật và giao dịch ngân hàng payOS thật: cần cấu hình tài khoản/khóa của chủ dự án.
- Responsive toàn bộ các trang trên thiết bị vật lý và các trình duyệt khác: chưa kiểm tra toàn bộ ma trận thiết bị.
- Kiểm thử sanitizer/Valgrind trên Linux: chưa chạy; không suy luận kết quả kiểm tra rò rỉ bộ nhớ chỉ từ unit test.

Hướng dẫn hoàn tất các bước phụ thuộc dịch vụ ở [DEPLOYMENT.md](DEPLOYMENT.md).

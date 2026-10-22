# Triển khai Vercel + Supabase + payOS

## Trạng thái kiểm chứng

- Build C++ và frontend chạy được tại máy phát triển.
- Bộ kiểm thử API chạy qua SQLite và PostgreSQL cục bộ.
- Chưa kiểm chứng build container Linux trên máy này vì chưa có Docker.
- Chưa deploy lên Vercel: `vercel whoami` báo token đăng nhập không hợp lệ.
- Chưa có Supabase project, kênh payOS và cấu hình email thật của chủ dự án. Không coi các integration test là giao dịch ngân hàng thật.

## 1. Supabase

1. Tạo project trên gói Free. Lấy connection URI PostgreSQL trong phần Connect; dùng session pooler nếu môi trường không kết nối được direct IPv6.
2. Thêm `sslmode=require` (hoặc `verify-full` cùng CA phù hợp) vào URI. Encode các ký tự đặc biệt trong mật khẩu khi đặt trong URI.
3. Backend tạo schema riêng `shoppe`, các bảng và chỉ mục khi khởi động. Không thêm schema `shoppe` vào danh sách schema công khai của Data API. Không cần frontend kết nối trực tiếp database hoặc Supabase Auth.
4. Tạo bucket công khai `product-images` để đọc ảnh sản phẩm. Đặt giới hạn 2MB và MIME PNG/JPEG/WebP. Không tạo policy cho phép khách ẩn danh ghi/xóa ảnh.
5. Lấy Project URL và service-role/secret key tương thích Storage API, chỉ cấu hình cho backend. Quyền tải ảnh được kiểm tra lại trong C++.

Đây là schema khởi tạo phiên bản đầu. Trước khi thay đổi schema của database đang có dữ liệu, cần thêm migration tương ứng; không xóa database để cập nhật phiên bản.

## 2. Vercel

Repository có `Dockerfile.vercel`, frontend được build bằng Node và backend bằng CMake trên Debian. HTTP server C++ phục vụ cả frontend và `/api`, nên session/CSRF dùng cùng origin.

1. Đăng nhập lại bằng `vercel login` trên máy của bạn.
2. Import Git repository hoặc chạy `vercel` tại thư mục gốc. Không chọn preset framework frontend để thay thế Dockerfile.
3. Theo tài liệu Vercel được kiểm tra khi lập dự án, Container Runtime đang Beta trên mọi gói. Kiểm tra khả năng sử dụng trên tài khoản Hobby trước; nếu Vercel từ chối runtime, giữ lại thông báo lỗi để đánh giá phương án, không chuyển nghiệp vụ sang JavaScript một cách âm thầm.
4. Đặt các biến môi trường dưới đây. `APP_URL` phải đúng origin HTTPS của deployment, không có dấu `/` cuối. Đặt `PORT=8080` để khớp cổng server/container.
5. Deploy và kiểm tra `/api/health` trả `engine=C++20`, `database=postgresql`.
6. Tạo người dùng/shop/sản phẩm; khởi động lại hoặc deploy lại rồi kiểm tra dữ liệu vẫn còn.

| Biến                 | Ý nghĩa                                    |
| -------------------- | ------------------------------------------ |
| APP_ENV              | `production`                               |
| APP_URL              | Ví dụ `https://ten-du-an.vercel.app`       |
| PORT                 | `8080`                                     |
| DATABASE_URL         | URI PostgreSQL có TLS                      |
| SUPABASE_URL         | `https://PROJECT.supabase.co`              |
| SUPABASE_SERVICE_KEY | Khóa Storage chỉ dùng server-side          |
| SUPABASE_BUCKET      | `product-images`                           |
| PAYOS_CLIENT_ID      | Client ID kênh thanh toán                  |
| PAYOS_API_KEY        | API key kênh thanh toán                    |
| PAYOS_CHECKSUM_KEY   | Khóa ký/xác minh dữ liệu                   |
| RESEND_API_KEY       | API key gửi email                          |
| EMAIL_FROM           | Địa chỉ gửi đã được nhà cung cấp chấp nhận |
| CRON_SECRET          | Chuỗi ngẫu nhiên ít nhất 32 ký tự          |
| SEED_DEMO            | `false`                                    |

Không bật dữ liệu/tài khoản demo công khai trong production. Các biến `STATIC_DIR` và `SCHEMA_PATH` đã đặt trong Dockerfile. Không lưu database/ảnh tại filesystem của container.

### Admin đầu tiên

Đặt tạm `BOOTSTRAP_ADMIN_EMAIL` và `BOOTSTRAP_ADMIN_PASSWORD` (ít nhất 12 ký tự), deploy một lần rồi xóa hai biến này. Backend chỉ tạo admin nếu email chưa tồn tại, không nâng quyền tài khoản đã đăng ký cùng email. Bootstrap phải dùng email mới do bạn kiểm soát.

Admin có thể mở shop tại `/seller`, duyệt shop trong `/admin/shops`, rồi thêm hàng trong `/admin/products`. Hoặc người dùng đăng ký shop để admin xét duyệt.

## 3. payOS

Cas ID hiện có chưa đủ để tạo link thanh toán qua API. Chủ dự án cần hoàn tất tài khoản/xác minh cá nhân hoặc doanh nghiệp, liên kết ngân hàng và tạo kênh thanh toán ở [payOS](https://my.payos.vn).

1. Cấu hình Client ID, API Key và Checksum Key vào Vercel, redeploy.
2. Đăng ký webhook `https://DOMAIN/api/payments/webhook` trong kênh payOS. Route phải được payOS truy cập được.
3. Endpoint xác minh HMAC-SHA256. Mẫu kiểm tra webhook có chữ ký hợp lệ nhưng không khớp mã đơn trong database chỉ được xác nhận đã nhận, không đánh dấu đơn đã trả tiền.
4. Tạo đơn online trên website, mở trang payOS, người dùng tự quét QR để thực hiện giao dịch demo thật.
5. Đối chiếu mã đơn/số tiền trong website, payOS và ngân hàng; kiểm tra đơn chỉ được xử lý sau khi server xác nhận thanh toán.
6. Nếu callback chậm, dùng nút kiểm tra thanh toán. URL `returnUrl` không tự chứng minh giao dịch thành công.
7. Nếu tiền về muộn hoặc không khớp, giao dịch chuyển đối soát; admin hoàn tiền bên ngoài và nhập tham chiếu sau khi thực hiện. Khi đơn đã giải phóng tồn kho, thanh toán muộn không khôi phục đơn.

## 4. Email và maintenance

Implementation dùng HTTP API Resend để không cần thêm SMTP runtime. Cấu hình API key và địa chỉ gửi hợp lệ; điều kiện gửi tới người nhận khác tùy cấu hình/xác minh domain của tài khoản.

Email được lưu trong outbox trước; sau mutation, server thử gửi tối đa 4 thư. Mỗi thư có idempotency key, số lần thử và trạng thái. Admin xem lỗi/gửi lại ở `/admin/outbox`; không hiển thị nội dung chứa token xác minh/khôi phục trong trang admin.

`vercel.json` đặt maintenance hằng ngày lúc 00:00 UTC. Route `/api/jobs/maintenance` yêu cầu header `Authorization: Bearer CRON_SECRET`, dọn đơn online quá hạn và thử gửi thêm 4 thư. Kiểm tra lịch cron trong dashboard sau deploy. Việc hết hạn còn được kiểm tra khi gọi API, không phụ thuộc cron chạy chính xác từng phút. Đây là cơ chế phục vụ demo nhỏ, không phải hệ thống email khối lượng lớn.

## 5. Kiểm tra bàn giao sau cấu hình

- Khách mua một giỏ hai shop; tạo hai đơn con, tổng tiền khớp báo giá C++.
- COD: giao thành công và ghi thu tiền là hai thao tác độc lập.
- Online: đối soát một giao dịch thật, webhook trùng không ghi nhận thanh toán hai lần.
- Seller A không truy cập/sửa đơn và sản phẩm của seller B.
- Hai người mua số lượng cuối: chỉ một người đặt được.
- Hủy/trả hàng giải phóng tồn kho đúng một lần; hoàn tiền không vượt mức còn phải hoàn.
- Xác minh email, khôi phục mật khẩu và tải ảnh chạy qua dịch vụ thật.
- Mở trang chủ/chi tiết/cart/checkout/admin trên điện thoại; kiểm tra loading, rỗng, lỗi và trạng thái hết hạn.

## Tài liệu nhà cung cấp

- [Vercel Container Runtime](https://vercel.com/docs/functions/runtimes/container)
- [Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Supabase PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [payOS API](https://payos.vn/docs/api/)
- [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email)

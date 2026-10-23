# Google local và quyền truy cập catalog Shopee — 23/10/2026

## Trạng thái

- Thay đổi chỉ ở máy local; chưa commit/push/deploy hoặc chạy migration trên Supabase Production.
- Đã nhận Google Web Client ID và lưu trong `.env.google.local` bị Git bỏ qua. Không lưu Google Client Secret; flow này không cần nó.
- Người dùng xác nhận hiện chưa có bất kỳ quyền API Shopee nào. `.env.shopee.local` chỉ là mẫu trống. Chưa có connector Shopee đang hoạt động, chưa thay/xóa catalog demo.
- Website hiện tại dùng xác thực/phiên do C++ quản lý, không dùng Supabase Auth.

## Việc cần làm trong Google Console

1. Mở [Google Auth Platform](https://console.cloud.google.com/auth/clients), chọn đúng Google Cloud project đã tạo Client ID.
2. Vào **Clients**, mở client loại **Web application** đã cung cấp. Nếu khác loại, tạo Web application mới thay vì dùng client Android/Desktop.
3. Tại **Authorized JavaScript origins**, thêm từng origin riêng:

   ```text
   http://localhost
   http://localhost:18231
   https://shoppec.vercel.app
   ```

   Không thêm đường dẫn `/login`. Nếu xem ở origin khác, phải thêm chính xác giao thức/host/cổng đó. Dùng `localhost` đúng theo preview; `127.0.0.1` là origin khác.
4. Với GIS callback JavaScript này, **không cần Authorized redirect URI hoặc callback Supabase**. Không cần Google Client Secret/API key/service account key.
5. Kiểm tra Branding/Audience. Nếu Console yêu cầu test users trong chế độ Testing, thêm các email demo. Chỉ dùng quyền cơ bản openid/email/profile.
6. Save; chờ cấu hình được áp dụng, mở lại [đăng nhập local](http://localhost:18231/login) trong Chrome/Edge thông thường nếu trình duyệt nhúng chặn popup/Google login.
7. Tài khoản Google chưa có trên web: bấm nút Google để tạo tài khoản buyer. Nếu email đã tồn tại: đăng nhập email/mật khẩu → **Tài khoản của tôi** → liên kết Google cùng email. Vai trò seller/admin giữ theo dữ liệu C++.
8. Sau khi đã duyệt giao diện và cho phép triển khai, mới thêm `GOOGLE_CLIENT_ID` vào server env Vercel và deploy bản mới. Migration 0003 sẽ chạy qua migration runner C++ như các migration hiện có; chưa áp dụng trên Production ở lần này.

Không coi nút hiện lên là đã nghiệm thu đăng nhập thật. Cần hoàn thành chọn tài khoản Google → về web → thấy tài khoản → tải lại vẫn đăng nhập → đăng xuất → thử lại. Chưa kiểm thử hoàn chỉnh bằng tài khoản Google thật của chủ dự án.

### Kiểm thử bản local

- Build C++20 với adapter PostgreSQL bật; các kiểm thử chạy bằng SQLite riêng ở máy local, không kết nối Supabase Production.
- CTest: 5/5 nhóm, gồm JWT RSA tạo khóa thử trong RAM, chữ ký sai, audience/issuer/exp/iat/nonce, email chưa xác minh, nhầm thuật toán, tạo tài khoản buyer, phiên/CSRF, chống phát lại, khóa tài khoản và chống chiếm tài khoản admin qua email trùng.
- Bộ API hồi quy: 16/16 ca qua; kiểm tra cú pháp JavaScript, build Vite và quét secret trong file Git thấy được đều qua.
- HTTP preview: metadata Google bật, dịch vụ payOS/Storage Production bị tách khỏi preview, CSP/COOP, cookie HttpOnly, JWT sai, nonce đã dùng và Origin sai được kiểm tra.
- Công cụ trình duyệt từ chối mở lại tab preview do URL policy. Chưa kiểm tra trực quan nút GIS hoặc đăng nhập tài khoản Google thật; cần người dùng mở link local và hoàn thành thử nghiệm sau khi cấu hình origin.
- Chưa build/chạy container Linux hoặc thử Google với Supabase Production trong lần này. Các bước đó thực hiện sau khi được duyệt push/deploy.

### C++ xử lý gì

`POST /api/auth/google/challenge` kiểm tra Origin/CSRF, phát nonce ngẫu nhiên 10 phút, cookie HttpOnly và bản ghi thử thách. `POST /api/auth/google` kiểm tra cookie và phiên gắn với thử thách, tiêu thụ nonce một lần rồi xác minh RS256 bằng jwt-cpp 0.7.1/OpenSSL, issuer, audience, exp/iat, nonce và email_verified. Chứng thư Google lấy qua HTTPS từ endpoint cố định, có cache theo Cache-Control; không giữ transaction database trong khi gọi mạng.

Danh tính được tra bằng Google `sub` trong `auth_identities`. User mới là buyer. Email có sẵn không được tự ghép. C++ phát session riêng 7 ngày, CSRF riêng; Secure ở Production. Không lưu ID token hoặc mật khẩu Google, không đưa token vào URL hoặc localStorage. Client Secret không tham gia flow này.

Nguồn: [Thiết lập GIS](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [xác minh token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Shopee: có thể không ủy quyền không?

Không có API catalog Open Platform chính thức mở công khai cho người chưa có app/quyền để lấy tùy ý toàn sàn. Các endpoint mà website Shopee tự gọi không phải API tích hợp ổn định cho dự án; không nên phụ thuộc cookie trình duyệt, endpoint nội bộ hoặc dịch vụ bán cookie/token.

| Hướng | Điều kiện thực tế | Phù hợp với dự án hiện tại |
| --- | --- | --- |
| Open Platform | Hồ sơ developer/app được duyệt, quyền API, shop ủy quyền và token | Lấy catalog shop được phép; không phải toàn sàn |
| Affiliate API | Tài khoản Affiliate được cấp API App ID/Secret; không phải từng shop ủy quyền | Offer để giới thiệu/tiếp thị liên kết; không mặc nhiên là kho để bán và thu tiền riêng |
| Sandbox | Có quyền tạo/test app theo Console | Demo kỹ thuật; không phải catalog hàng thật toàn sàn |
| Dữ liệu chủ hàng cung cấp hoặc demo có quyền dùng | File/API/ảnh được phép sử dụng | Triển khai đồ án và checkout payOS độc lập ngay khi nguồn sẵn có |

Theo [hướng dẫn đăng ký Shopee](https://open.shopee.com/developer-guide/12), cập nhật 10/09/2026:

- Người bán VN có điều kiện **Preferred Seller hoặc Mall**. Loại Individual/Registered Business Seller chỉ phục vụ shop của mình.
- ISV cần doanh nghiệp đăng ký, sản phẩm đang hoạt động và tài khoản thử nghiệm cho Shopee kiểm tra. Điều kiện nêu hạn chế lấy listing để tạo giao dịch ngoài Shopee.
- Trang ghi thời gian xử lý hồ sơ Seller 3 ngày làm việc và ISV 10 ngày làm việc; đây không phải bảo đảm được duyệt hoặc thời gian hoàn thành toàn bộ tích hợp.

Vì vậy, thao tác **chủ shop bấm đồng ý** thường đơn giản khi app đã đủ điều kiện. Phần đăng ký/duyệt app khó hơn với sinh viên chưa có shop phù hợp. Việc dùng payOS thay thanh toán Shopee không tự tạo quyền sử dụng dữ liệu listing. Cần xác nhận phạm vi sử dụng với Shopee/chủ dữ liệu trước khi chọn nguồn Production.

### Nếu có đủ điều kiện Open Platform

1. Đăng ký tài khoản developer tại Shopee Open Platform; xác minh email.
2. Console → App Management → App List → chọn loại hồ sơ đúng thực tế. Không khai ISV/doanh nghiệp nếu không có hồ sơ.
3. Gửi hồ sơ và chờ kết quả; tạo app và cấu hình callback/domain theo hướng dẫn Console sau khi được duyệt.
4. Lấy Partner ID/Partner Key đúng môi trường; xin quyền đọc sản phẩm. Secret lưu ở server, không gửi vào chat.
5. C++ tạo URL ủy quyền có chữ ký; chủ shop mở URL, đăng nhập Shopee và đồng ý.
6. Callback C++ xác minh trạng thái phiên ủy quyền, nhận code/shop_id, đổi code lấy access/refresh token và lưu server. Không lưu code/token vào log.
7. Gọi API đọc, preview số lượng/nguồn trước khi nhập; không xóa catalog demo trước khi kiểm tra nguồn thật.

Nhóm API dự kiến: `v2.product.get_category`, `get_item_list`, `get_item_base_info`, `get_model_list`, `get_attribute_tree`, `get_brand_list`. Chưa có key/token nên chưa thể kiểm thử hoặc thay sản phẩm. Chi tiết từng API nằm trong [báo cáo nguồn dữ liệu](DATABASE_GOOGLE_SHOPEE_GUIDE.md).

Đề xuất cho đồ án: hoàn tất Google local và luồng C++/payOS bằng dữ liệu được phép dùng; coi Shopee là một adapter C++ cần quyền truy cập, chỉ bật sau khi có nguồn hợp lệ. Có thể xin chủ shop cung cấp file catalog/ảnh để nhập thay vì chờ API, nhưng vẫn cần quyền sử dụng dữ liệu đó cho website độc lập.

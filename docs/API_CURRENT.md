# API hiện tại — kiểm kê ngày 22/10/2026

Nguồn: `backend/src/application.cpp`, commit backend Production `3548b0b` (backend giống HEAD kiểm tra `807b538`). Base URL: **https://shoppec.vercel.app/api**. Có **77 cặp method/đường dẫn dự kiến**, trên **65 mẫu đường dẫn**. Đây là kiểm kê từ mã nguồn, không phải tuyên bố đã chạy từng endpoint trên Production. Các method ngoài dự kiến chưa được chặn đồng nhất; xem lỗi giỏ hàng trong báo cáo.

## Quy ước gọi

- JSON request/response; lỗi có `error.code`, `error.message`. CSV export trả `text/csv`.
- Ứng dụng dùng session cookie HttpOnly/Secure/SameSite=Lax trên Production; không dùng Supabase Auth cho người dùng shop. Lấy `csrf` từ login hoặc `/auth/me`, gửi `X-CSRF-Token` khi ghi bằng phiên.
- Các mutation thông thường phải có `Origin: https://shoppec.vercel.app`; webhook dùng HMAC và maintenance dùng Bearer secret riêng. API được thiết kế cho frontend cùng origin; chưa có API token cho ứng dụng bên thứ ba hoặc CORS công khai.
- `/api/auth/me` trả `user=null` với HTTP 200 khi chưa đăng nhập. Khách gọi API quản trị nhận 401, user thiếu quyền nhận 403; các lỗi dữ liệu/nghiệp vụ thường là 400/404/409/422; tích hợp có thể trả 502/503.
- `ProductInput`: `shop_id` (admin có thể chọn shop), `name`, `category`, `description`, `image`, `weight`, `active`, `variants:[{id?,name,price,stock}]`. Quyền sở hữu và trạng thái shop được kiểm tra trong backend.
- Checkout bỏ qua giá client; số tiền là số nguyên VNĐ. Một idempotency key gắn với buyer tránh tạo checkout lặp.
- Với nhóm method ghép trong bảng, mỗi method là một operation; đường dẫn không được đếm lặp. Dòng nguồn là vị trí handler, không phải coverage động.

## Hệ thống/công khai

| Method | Đường dẫn (sau /api) | Quyền                                  | Input / kết quả / lưu ý                                     | Handler             |
| ------ | -------------------- | -------------------------------------- | ----------------------------------------------------------- | ------------------- |
| GET    | `/health`            | Công khai                              | Health C++20/PostgreSQL                                     | application.cpp:658 |
| GET    | `/meta`              | Công khai                              | Danh mục, banner, cờ readiness dịch vụ; không trả key       | application.cpp:661 |
| GET    | `/products`          | Công khai                              | q, category, shop; trả toàn bộ tập phù hợp, chưa phân trang | application.cpp:770 |
| GET    | `/products/:id`      | Công khai hoặc quyền xem hàng chưa bán | Sản phẩm, biến thể, shop, đánh giá                          | application.cpp:791 |
| GET    | `/shops/:id`         | Công khai hoặc chủ shop/admin          | Shop approved; shop chưa hoạt động bị hạn chế               | application.cpp:803 |
| GET    | `/vouchers`          | Công khai                              | Voucher active và còn thời hạn                              | application.cpp:810 |

## Tài khoản

| Method     | Đường dẫn (sau /api) | Quyền              | Input / kết quả / lưu ý                                            | Handler             |
| ---------- | -------------------- | ------------------ | ------------------------------------------------------------------ | ------------------- |
| GET        | `/auth/me`           | Công khai/phiên    | user, csrf, shop; user=null khi chưa đăng nhập                     | application.cpp:671 |
| POST       | `/auth/register`     | Công khai + Origin | email, password, name; chỉ tạo buyer                               | application.cpp:675 |
| POST       | `/auth/login`        | Công khai + Origin | email, password; Set-Cookie, user, csrf, shop                      | application.cpp:701 |
| POST       | `/auth/logout`       | Phiên + CSRF       | Xóa phiên và cookie                                                | application.cpp:726 |
| POST       | `/auth/forgot`       | Công khai + Origin | email; enqueue link reset, trả thông báo chung                     | application.cpp:733 |
| POST       | `/auth/resend`       | Công khai + Origin | email; enqueue link verify                                         | application.cpp:733 |
| POST       | `/auth/reset`        | Công khai + Origin | token, password; đổi mật khẩu và thu hồi session                   | application.cpp:754 |
| POST       | `/auth/verify`       | Công khai + Origin | token; xác minh email và tiêu thụ token                            | application.cpp:754 |
| PATCH      | `/account`           | User + CSRF        | name; đổi tên                                                      | application.cpp:818 |
| GET / POST | `/addresses`         | User; ghi cần CSRF | GET danh sách; POST id? + name,phone,street,city,region,is_default | application.cpp:824 |
| DELETE     | `/addresses/:id`     | Chủ địa chỉ + CSRF | Xóa địa chỉ của mình                                               | application.cpp:846 |

## Giỏ hàng/yêu thích

| Method        | Đường dẫn (sau /api)   | Quyền              | Input / kết quả / lưu ý                                                    | Handler             |
| ------------- | ---------------------- | ------------------ | -------------------------------------------------------------------------- | ------------------- |
| GET / PUT     | `/cart`                | User; ghi cần CSRF | PUT items:[{variant_id,quantity,selected}], tối đa 50 dòng; GET cart/lines | application.cpp:853 |
| GET           | `/wishlist`            | User               | Sản phẩm đã lưu                                                            | application.cpp:889 |
| POST / DELETE | `/wishlist/:productId` | User + CSRF        | Thêm/bỏ yêu thích                                                          | application.cpp:898 |

## Người bán

| Method       | Đường dẫn (sau /api)   | Quyền                                         | Input / kết quả / lưu ý                                               | Handler              |
| ------------ | ---------------------- | --------------------------------------------- | --------------------------------------------------------------------- | -------------------- |
| POST         | `/shops/apply`         | User + CSRF                                   | name,description,region; một shop/tài khoản, tạo pending              | application.cpp:908  |
| PATCH        | `/shops/mine`          | Chủ shop + CSRF                               | name,description,region                                               | application.cpp:920  |
| GET / POST   | `/seller/products`     | Chủ shop; đăng bán cần approved; CSRF khi ghi | GET hàng của mình; POST ProductInput                                  | application.cpp:927  |
| PUT / DELETE | `/seller/products/:id` | Chủ shop hoặc admin + CSRF                    | PUT ProductInput; DELETE ngừng bán (soft delete)                      | application.cpp:934  |
| POST         | `/seller/import`       | Chủ shop + CSRF                               | csv,commit; preview/nhập tối đa 200 dòng, ghi dùng kiểm tra approved  | application.cpp:944  |
| POST         | `/vouchers`            | Chủ shop approved hoặc admin + CSRF           | shop_id?,code,type,value,minimum,max_discount,limit,starts_at,ends_at | application.cpp:999  |
| DELETE       | `/vouchers/:id`        | Chủ voucher hoặc admin + CSRF                 | Ngừng voucher, không xóa lịch sử                                      | application.cpp:1028 |
| GET          | `/seller/export`       | Chủ shop                                      | kind=products hoặc orders; CSV                                        | application.cpp:1536 |

## Checkout/thanh toán/đơn

| Method | Đường dẫn (sau /api)           | Quyền                                       | Input / kết quả / lưu ý                                                        | Handler              |
| ------ | ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------ | -------------------- |
| POST   | `/checkout/quote`              | User + CSRF                                 | address_id,method,idempotency_key,voucher?,shop_vouchers?; tính rồi rollback   | application.cpp:1038 |
| POST   | `/checkout`                    | User + CSRF                                 | Cùng payload quote; giá/tồn kho server; tách đơn theo shop                     | application.cpp:1038 |
| GET    | `/payments/:checkoutId`        | Chủ checkout hoặc admin                     | Checkout và đơn con                                                            | application.cpp:1192 |
| POST   | `/payments/:checkoutId/sync`   | Chủ checkout hoặc admin + CSRF              | Đọc provider, đối soát giao dịch; không tin returnUrl                          | application.cpp:1196 |
| POST   | `/payments/:checkoutId/cancel` | Chủ checkout hoặc admin + CSRF              | Hủy checkout pending và giải phóng tồn kho                                     | application.cpp:1202 |
| POST   | `/payments/webhook`            | HMAC payOS hợp lệ; không dùng cookie/Origin | data,signature; chống trùng reference, xử lý tiền muộn/thừa                    | application.cpp:527  |
| GET    | `/orders`                      | User                                        | Đơn của người mua                                                              | application.cpp:1209 |
| GET    | `/seller/orders`               | Chủ shop                                    | Đơn của shop                                                                   | application.cpp:1209 |
| GET    | `/admin/orders`                | Admin                                       | Toàn bộ đơn                                                                    | application.cpp:1209 |
| GET    | `/orders/:id`                  | Người mua/chủ shop/admin liên quan          | Chi tiết, history, items, returns/refunds                                      | application.cpp:1225 |
| POST   | `/orders/:id/status`           | Theo vai trò và state machine + CSRF        | status; buyer hủy/xác nhận nhận; seller xác nhận/chuẩn bị; admin giao vận demo | application.cpp:1231 |
| POST   | `/orders/:id/collect`          | Admin + CSRF                                | Ghi thu COD sau delivered/completed, không thu tiền ngân hàng                  | application.cpp:1266 |
| POST   | `/orders/:id/return`           | Người mua đơn đã nhận + CSRF                | reason,items:[{item_id,quantity}]; cửa sổ 7 ngày, một return/đơn               | application.cpp:1279 |
| POST   | `/returns/:id`                 | Chủ shop hoặc admin + CSRF                  | status approved/rejected; received chỉ admin                                   | application.cpp:1320 |
| POST   | `/admin/refunds`               | Admin + CSRF                                | order_id,amount,reference,note?; ghi hoàn thủ công có giới hạn                 | application.cpp:1350 |

## Đánh giá/chat/thông báo

| Method     | Đường dẫn (sau /api)          | Quyền                              | Input / kết quả / lưu ý                                  | Handler              |
| ---------- | ----------------------------- | ---------------------------------- | -------------------------------------------------------- | -------------------- |
| POST       | `/reviews`                    | Người mua đã nhận hàng + CSRF      | order_item_id,rating 1..5,comment; tạo/cập nhật đánh giá | application.cpp:1374 |
| GET / POST | `/conversations`              | User; ghi cần CSRF                 | GET hội thoại của mình; POST shop_id                     | application.cpp:1394 |
| GET / POST | `/conversations/:id/messages` | Thành viên hội thoại; ghi cần CSRF | GET messages và đánh dấu đã đọc; POST text, rate limit   | application.cpp:1418 |
| GET / POST | `/notifications`              | User; ghi cần CSRF                 | GET thông báo; POST đánh dấu tất cả đã đọc               | application.cpp:1443 |

## Quản trị/báo cáo/hạ tầng

| Method     | Đường dẫn (sau /api)                 | Quyền                                            | Input / kết quả / lưu ý                                                              | Handler              |
| ---------- | ------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------- |
| GET        | `/dashboard`                         | Admin khi scope=admin; chủ shop khi scope=seller | stats,top_products,orders,low_stock; chưa phân trang                                 | application.cpp:1454 |
| GET        | `/admin/export`                      | Admin                                            | kind=products hoặc orders; CSV                                                       | application.cpp:1536 |
| GET / POST | `/admin/products`                    | Admin; ghi cần CSRF                              | GET mọi sản phẩm; POST ProductInput                                                  | application.cpp:1574 |
| PUT        | `/admin/products/:id`                | Admin + CSRF                                     | ProductInput; sửa sản phẩm                                                           | application.cpp:1576 |
| POST       | `/admin/products/:id`                | Admin + CSRF                                     | active; bật/tắt sản phẩm                                                             | application.cpp:1719 |
| GET        | `/admin/shops`                       | Admin                                            | Danh sách shop                                                                       | application.cpp:1578 |
| POST       | `/admin/shops/:id`                   | Admin + CSRF                                     | status approved/rejected/suspended                                                   | application.cpp:1580 |
| GET        | `/admin/users`                       | Admin                                            | Danh sách user đã bỏ password_hash                                                   | application.cpp:1591 |
| POST       | `/admin/users/:id`                   | Admin + CSRF                                     | active?,role?; không tự khóa/đổi quyền mình; khóa thu hồi session                    | application.cpp:1597 |
| POST       | `/admin/catalog/import`              | Admin + CSRF                                     | Nhập catalog bundled; không gọi Shopee; không tự restock hoặc ghi đè chỉnh sửa       | application.cpp:1616 |
| GET        | `/admin/payments`                    | Admin                                            | checkouts,events; đối soát                                                           | application.cpp:1624 |
| POST       | `/admin/payments/:checkoutId/refund` | Admin + CSRF                                     | amount,reference; ghi hoàn khoản review/thu thừa, không chuyển tiền                  | application.cpp:1626 |
| GET        | `/admin/reviews`                     | Admin                                            | Danh sách đánh giá                                                                   | application.cpp:1663 |
| POST       | `/admin/reviews/:id`                 | Admin + CSRF                                     | hidden; kiểm duyệt (có lỗi resubmit làm hiện lại)                                    | application.cpp:1684 |
| GET        | `/admin/outbox`                      | Admin                                            | Metadata mail; không trả text chứa token                                             | application.cpp:1665 |
| POST       | `/admin/outbox/retry`                | Admin + CSRF                                     | Đưa queued/failed về hàng đợi; không bảo đảm gửi ngay hết                            | application.cpp:1673 |
| GET        | `/admin/audit`                       | Admin                                            | Nhật ký thao tác                                                                     | application.cpp:1682 |
| GET / POST | `/admin/settings`                    | Admin; ghi cần CSRF                              | banner_title,banner_subtitle,categories,shipping_local,shipping_remote,shipping_step | application.cpp:1691 |
| POST       | `/storage/images`                    | Admin hoặc chủ shop approved + CSRF              | base64 thuần; PNG/JPEG/WebP dưới 2MiB; trả url public Supabase                       | application.cpp:573  |
| GET        | `/jobs/maintenance`                  | Authorization: Bearer CRON_SECRET                | Hết hạn pending checkout và gửi tối đa 4 mail; cron hằng ngày                        | application.cpp:502  |

## API/dịch vụ bên ngoài đang dùng

| Dịch vụ             | Cách dùng hiện tại                                                                                | Đã xác minh / giới hạn                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Supabase PostgreSQL | libpq → Session pooler:5432, schema riêng shoppe, TLS                                             | Query thật + 36 probe Production; không mở schema cho anon/authenticated                                                         |
| Supabase Storage    | Backend POST `/storage/v1/object/{bucket}/{object}`; đọc `/storage/v1/object/public/...`          | Key và bucket được chấp nhận trong lượt này; upload/read/delete đã thử ở đợt thiết lập trước, không tải lại ảnh trong lượt audit |
| payOS               | GET `/v2/payment-requests/{code}`, POST `/v2/payment-requests`; create/response/webhook có chữ ký | Lượt này chỉ GET order không tồn tại: HTTP 200/code101. Không tạo link hoặc chuyển tiền; checksum mới kiểm tra format và fixture |
| Resend              | POST `https://api.resend.com/emails`, outbox + Idempotency-Key                                    | Chưa có API key/sender thật; email chưa gửi được                                                                                 |
| DummyJSON           | Script tải nguồn catalog, đóng gói `database/demo-catalog.json`; ảnh CDN                          | 30 sản phẩm demo có sẵn, không phải hàng thật; storefront đọc database, không gọi DummyJSON theo từng request                    |
| Shopee              | Không có tích hợp API được ủy quyền                                                               | Chủ dự án chưa có quyền Open Platform/Affiliate; không scrape API nội bộ                                                         |
| Vercel              | Container service phục vụ HTML/CSS/JS và C++; cron GET maintenance mỗi ngày                       | Production READY, runtime iad1; database Singapore; cần tối ưu vị trí và DB round-trip                                           |

Tài liệu chính thức: [Supabase Connect](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase Storage](https://supabase.com/docs/guides/storage), [payOS API](https://payos.vn/docs/api/), [Resend](https://resend.com/docs/api-reference/emails/send-email), [DummyJSON Products](https://dummyjson.com/docs/products), [Vercel Container](https://vercel.com/docs/functions/runtimes/container).

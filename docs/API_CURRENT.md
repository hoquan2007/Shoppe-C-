# API hiện tại — kiểm kê ngày 22/10/2026

Nguồn: `backend/src/application.cpp`, bản catalog API C++ ngày 22/10/2026. Base URL: **https://shoppec.vercel.app/api**. Có **80 cặp method/đường dẫn**, trên **68 mẫu đường dẫn**. Handler C++ có bảng method tường minh: sai method trả 405 kèm Allow; đường dẫn không tồn tại trả 404. HEAD được hỗ trợ cho các route GET và không tính vào 80 operation. Đây là kiểm kê mã nguồn; kiểm thử Production chỉ chạy các probe được nêu trong báo cáo.

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
| GET    | `/health`            | Công khai                              | Health C++20/PostgreSQL                                     | application.cpp:843 |
| GET    | `/meta`              | Công khai                              | Danh mục, banner, cờ readiness dịch vụ; không trả key       | application.cpp:846 |
| GET    | `/products`          | Công khai                              | q, category, shop, min/max, sort, page, page_size/limit (1–48); trả products + total/page/page_size/pages | application.cpp:955 |
| GET    | `/products/:id`      | Công khai hoặc quyền xem hàng chưa bán | Sản phẩm, biến thể, shop, đánh giá                          | application.cpp:976 |
| GET    | `/shops/:id`         | Công khai hoặc chủ shop/admin          | Shop approved; shop chưa hoạt động bị hạn chế               | application.cpp:988 |
| GET    | `/vouchers`          | Công khai                              | Voucher active và còn thời hạn                              | application.cpp:995 |

### Cập nhật hiệu năng 24/10/2026

- `GET /home`: dữ liệu trang chủ từ C++ gồm 12 sản phẩm, tổng số, metadata và ảnh đại diện theo danh mục; không tải toàn catalog.
- `GET /products`: phân trang thật mặc định 12, tối đa 48; `sort=new|price|price-desc`; thứ tự ổn định có ID phụ, lọc giá và tìm tiếng Việt ở server. Khách gọi API cũ cần chuyển sang đọc các trang thay vì giả định một response chứa mọi sản phẩm.
- Catalog công khai cache CDN tối đa 15s; meta 30s. API riêng tư, preview có phiên và lỗi tiếp tục `private, no-store`. Giá/kho tại checkout luôn lấy từ database.
- Response C++ có `X-Request-Id` và `Server-Timing` (`db_pool`, `db`, `app`); header của response cache phản ánh lần tạo response tại origin.
- Bảng kiểm kê phía trên là baseline lịch sử; có thêm một operation GET `/home` so với bản đó.

## Tài khoản

| Method     | Đường dẫn (sau /api) | Quyền              | Input / kết quả / lưu ý                                            | Handler              |
| ---------- | -------------------- | ------------------ | ------------------------------------------------------------------ | -------------------- |
| GET        | `/auth/me`           | Công khai/phiên    | user, csrf, shop; user=null khi chưa đăng nhập                     | application.cpp:856  |
| POST       | `/auth/register`     | Công khai + Origin | email, password, name; chỉ tạo buyer                               | application.cpp:860  |
| POST       | `/auth/login`        | Công khai + Origin | email, password; Set-Cookie, user, csrf, shop                      | application.cpp:886  |
| POST       | `/auth/logout`       | Phiên + CSRF       | Xóa phiên và cookie                                                | application.cpp:911  |
| POST       | `/auth/forgot`       | Công khai + Origin | email; enqueue link reset, trả thông báo chung                     | application.cpp:918  |
| POST       | `/auth/resend`       | Công khai + Origin | email; enqueue link verify                                         | application.cpp:918  |
| POST       | `/auth/reset`        | Công khai + Origin | token, password; đổi mật khẩu và thu hồi session                   | application.cpp:939  |
| POST       | `/auth/verify`       | Công khai + Origin | token; xác minh email và tiêu thụ token                            | application.cpp:939  |
| PATCH      | `/account`           | User + CSRF        | name; đổi tên                                                      | application.cpp:1003 |
| GET / POST | `/addresses`         | User; ghi cần CSRF | GET danh sách; POST id? + name,phone,street,city,region,is_default | application.cpp:1009 |
| DELETE     | `/addresses/:id`     | Chủ địa chỉ + CSRF | Xóa địa chỉ của mình                                               | application.cpp:1031 |

## Giỏ hàng/yêu thích

| Method        | Đường dẫn (sau /api)   | Quyền              | Input / kết quả / lưu ý                                                    | Handler              |
| ------------- | ---------------------- | ------------------ | -------------------------------------------------------------------------- | -------------------- |
| GET / PUT     | `/cart`                | User; ghi cần CSRF | PUT items:[{variant_id,quantity,selected}], tối đa 50 dòng; GET cart/lines | application.cpp:1038 |
| GET           | `/wishlist`            | User               | Sản phẩm đã lưu                                                            | application.cpp:1074 |
| POST / DELETE | `/wishlist/:productId` | User + CSRF        | Thêm/bỏ yêu thích                                                          | application.cpp:1083 |

## Người bán

| Method       | Đường dẫn (sau /api)   | Quyền                                         | Input / kết quả / lưu ý                                               | Handler              |
| ------------ | ---------------------- | --------------------------------------------- | --------------------------------------------------------------------- | -------------------- |
| POST         | `/shops/apply`         | User + CSRF                                   | name,description,region; một shop/tài khoản, tạo pending              | application.cpp:1093 |
| PATCH        | `/shops/mine`          | Chủ shop + CSRF                               | name,description,region                                               | application.cpp:1105 |
| GET / POST   | `/seller/products`     | Chủ shop; đăng bán cần approved; CSRF khi ghi | GET hàng của mình; POST ProductInput                                  | application.cpp:1112 |
| PUT / DELETE | `/seller/products/:id` | Chủ shop hoặc admin + CSRF                    | PUT ProductInput; DELETE ngừng bán (soft delete)                      | application.cpp:1119 |
| POST         | `/seller/import`       | Chủ shop + CSRF                               | csv,commit; preview/nhập tối đa 200 dòng, ghi dùng kiểm tra approved  | application.cpp:1129 |
| POST         | `/vouchers`            | Chủ shop approved hoặc admin + CSRF           | shop_id?,code,type,value,minimum,max_discount,limit,starts_at,ends_at | application.cpp:1184 |
| DELETE       | `/vouchers/:id`        | Chủ voucher hoặc admin + CSRF                 | Ngừng voucher, không xóa lịch sử                                      | application.cpp:1213 |
| GET          | `/seller/export`       | Chủ shop                                      | kind=products hoặc orders; CSV                                        | application.cpp:1718 |

## Checkout/thanh toán/đơn

| Method | Đường dẫn (sau /api)           | Quyền                                       | Input / kết quả / lưu ý                                                        | Handler              |
| ------ | ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------ | -------------------- |
| POST   | `/checkout/quote`              | User + CSRF                                 | address_id,method,idempotency_key,voucher?,shop_vouchers?; tính rồi rollback   | application.cpp:1223 |
| POST   | `/checkout`                    | User + CSRF                                 | Cùng payload quote; giá/tồn kho server; tách đơn theo shop                     | application.cpp:1223 |
| GET    | `/payments/:checkoutId`        | Chủ checkout hoặc admin                     | Checkout và đơn con                                                            | application.cpp:1377 |
| POST   | `/payments/:checkoutId/sync`   | Chủ checkout hoặc admin + CSRF              | Đọc provider, đối soát giao dịch; không tin returnUrl                          | application.cpp:1381 |
| POST   | `/payments/:checkoutId/cancel` | Chủ checkout hoặc admin + CSRF              | Hủy checkout pending và giải phóng tồn kho                                     | application.cpp:1385 |
| POST   | `/payments/webhook`            | HMAC payOS hợp lệ; không dùng cookie/Origin | data,signature; chống trùng reference, xử lý tiền muộn/thừa                    | application.cpp:677  |
| GET    | `/orders`                      | User                                        | Đơn của người mua                                                              | application.cpp:1392 |
| GET    | `/seller/orders`               | Chủ shop                                    | Đơn của shop                                                                   | application.cpp:1392 |
| GET    | `/admin/orders`                | Admin                                       | Toàn bộ đơn                                                                    | application.cpp:1392 |
| GET    | `/orders/:id`                  | Người mua/chủ shop/admin liên quan          | Chi tiết, history, items, returns/refunds                                      | application.cpp:1405 |
| POST   | `/orders/:id/status`           | Theo vai trò và state machine + CSRF        | status; buyer hủy/xác nhận nhận; seller xác nhận/chuẩn bị; admin giao vận demo | application.cpp:1411 |
| POST   | `/orders/:id/collect`          | Admin + CSRF                                | Ghi thu COD sau delivered/completed, không thu tiền ngân hàng                  | application.cpp:1446 |
| POST   | `/orders/:id/return`           | Người mua đơn đã nhận + CSRF                | reason,items:[{item_id,quantity}]; cửa sổ 7 ngày, một return/đơn               | application.cpp:1459 |
| POST   | `/returns/:id`                 | Chủ shop hoặc admin + CSRF                  | status approved/rejected; received chỉ admin                                   | application.cpp:1500 |
| POST   | `/admin/refunds`               | Admin + CSRF                                | order_id,amount,reference,note?; ghi hoàn thủ công có giới hạn                 | application.cpp:1530 |

## Đánh giá/chat/thông báo

| Method     | Đường dẫn (sau /api)          | Quyền                              | Input / kết quả / lưu ý                                  | Handler              |
| ---------- | ----------------------------- | ---------------------------------- | -------------------------------------------------------- | -------------------- |
| POST       | `/reviews`                    | Người mua đã nhận hàng + CSRF      | order_item_id,rating 1..5,comment; tạo/cập nhật đánh giá | application.cpp:1554 |
| GET / POST | `/conversations`              | User; ghi cần CSRF                 | GET hội thoại của mình; POST shop_id                     | application.cpp:1574 |
| GET / POST | `/conversations/:id/messages` | Thành viên hội thoại; ghi cần CSRF | GET messages và đánh dấu đã đọc; POST text, rate limit   | application.cpp:1598 |
| GET / POST | `/notifications`              | User; ghi cần CSRF                 | GET thông báo; POST đánh dấu tất cả đã đọc               | application.cpp:1623 |

## Quản trị/báo cáo/hạ tầng

| Method     | Đường dẫn (sau /api)                 | Quyền                                            | Input / kết quả / lưu ý                                                              | Handler              |
| ---------- | ------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------- |
| GET        | `/dashboard`                         | Admin khi scope=admin; chủ shop khi scope=seller | stats,top_products,orders,low_stock; chưa phân trang                                 | application.cpp:1634 |
| GET        | `/admin/export`                      | Admin                                            | kind=products hoặc orders; CSV                                                       | application.cpp:1718 |
| GET / POST | `/admin/products`                    | Admin; ghi cần CSRF                              | GET mọi sản phẩm; POST ProductInput                                                  | application.cpp:1767 |
| PUT        | `/admin/products/:id`                | Admin + CSRF                                     | ProductInput; sửa sản phẩm                                                           | application.cpp:1769 |
| POST       | `/admin/products/:id`                | Admin + CSRF                                     | active; bật/tắt sản phẩm                                                             | application.cpp:1912 |
| GET        | `/admin/shops`                       | Admin                                            | Danh sách shop                                                                       | application.cpp:1771 |
| POST       | `/admin/shops/:id`                   | Admin + CSRF                                     | status approved/rejected/suspended                                                   | application.cpp:1773 |
| GET        | `/admin/users`                       | Admin                                            | Danh sách user đã bỏ password_hash                                                   | application.cpp:1784 |
| POST       | `/admin/users/:id`                   | Admin + CSRF                                     | active?,role?; không tự khóa/đổi quyền mình; khóa thu hồi session                    | application.cpp:1790 |
| POST       | `/admin/catalog/import`              | Admin + CSRF                                     | Nhập catalog bundled; không gọi Shopee; không tự restock hoặc ghi đè chỉnh sửa       | application.cpp:1809 |
| GET        | `/admin/payments`                    | Admin                                            | checkouts,events; đối soát                                                           | application.cpp:1817 |
| POST       | `/admin/payments/:checkoutId/refund` | Admin + CSRF                                     | amount,reference; ghi hoàn khoản review/thu thừa, không chuyển tiền                  | application.cpp:1819 |
| GET        | `/admin/reviews`                     | Admin                                            | Danh sách đánh giá                                                                   | application.cpp:1856 |
| POST       | `/admin/reviews/:id`                 | Admin + CSRF                                     | hidden; kiểm duyệt; người mua sửa vẫn giữ trạng thái hidden                          | application.cpp:1877 |
| GET        | `/admin/outbox`                      | Admin                                            | Metadata mail; không trả text chứa token                                             | application.cpp:1858 |
| POST       | `/admin/outbox/retry`                | Admin + CSRF                                     | Đưa queued/failed về hàng đợi; không bảo đảm gửi ngay hết                            | application.cpp:1866 |
| GET        | `/admin/audit`                       | Admin                                            | Nhật ký thao tác                                                                     | application.cpp:1875 |
| GET / POST | `/admin/settings`                    | Admin; ghi cần CSRF                              | banner_title,banner_subtitle,categories,shipping_local,shipping_remote,shipping_step | application.cpp:1884 |
| POST       | `/storage/images`                    | Admin hoặc chủ shop approved + CSRF              | base64 thuần; PNG/JPEG/WebP dưới 2MiB; trả url public Supabase                       | application.cpp      |
| GET        | `/jobs/maintenance`                  | Authorization: Bearer CRON_SECRET                | Hết hạn pending checkout và gửi tối đa 4 mail; cron hằng ngày                        | application.cpp      |

## Catalog demo qua API (mới)

| Method | Đường dẫn (sau /api)     | Quyền                 | Input / hành vi                                                                                                    |
| ------ | ------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET    | `/admin/catalog/status`  | Admin                 | Provider/mode/last_sync; không trả token/key                                                                       |
| POST   | `/admin/catalog/preview` | Admin + CSRF + Origin | limit 1..600; tải category-list/products bên ngoài transaction; bổ sung mẫu ShoppeDemo có nhãn khi nguồn không đủ; snapshot gắn admin, TTL 15 phút; rate limit 3/phút |
| POST   | `/admin/catalog/commit`  | Admin + CSRF + Origin | preview_token; dùng snapshot server, token một lần; chỉ thêm ID mới, giữ hàng/tồn kho đã có                        |

[Phạm vi Shopee và hướng dẫn sử dụng catalog API](SHOPEE_API_SELECTION.md). Provider lỗi trả 502, bản xem trước hết hạn/đã dùng trả 409; không tự âm thầm fallback. Bản demo đóng gói vẫn ở POST /admin/catalog/import.

## API/dịch vụ bên ngoài đang dùng

| Dịch vụ             | Cách dùng hiện tại                                                                                  | Đã xác minh / giới hạn                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Supabase PostgreSQL | libpq → Session pooler:5432, schema riêng shoppe, TLS                                               | Query thật + 36 probe Production; không mở schema cho anon/authenticated                                                         |
| Supabase Storage    | Backend POST `/storage/v1/object/{bucket}/{object}`; đọc `/storage/v1/object/public/...`            | Key và bucket được chấp nhận trong lượt này; upload/read/delete đã thử ở đợt thiết lập trước, không tải lại ảnh trong lượt audit |
| payOS               | GET `/v2/payment-requests/{code}`, POST `/v2/payment-requests`; create/response/webhook có chữ ký   | Lượt này chỉ GET order không tồn tại: HTTP 200/code101. Không tạo link hoặc chuyển tiền; checksum mới kiểm tra format và fixture |
| Resend              | POST `https://api.resend.com/emails`, outbox + Idempotency-Key                                      | Chưa có API key/sender thật; email chưa gửi được                                                                                 |
| DummyJSON           | C++ gọi category-list/products khi admin yêu cầu xem trước; snapshot đóng gói làm lựa chọn dự phòng | Dữ liệu demo, không phải hàng thật; storefront đọc database, không gọi provider theo từng request                                |
| Shopee              | Không có tích hợp API được ủy quyền                                                                 | Chủ dự án chưa có quyền Open Platform/Affiliate; không scrape API nội bộ                                                         |
| Vercel              | Container service phục vụ HTML/CSS/JS và C++; cron GET maintenance mỗi ngày                         | Bản sửa cấu hình sin1 cùng vùng Singapore với database; pool C++ tối đa 4 kết nối/container; xem báo cáo hiệu năng mới           |

Tài liệu chính thức: [Supabase Connect](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase Storage](https://supabase.com/docs/guides/storage), [payOS API](https://payos.vn/docs/api/), [Resend](https://resend.com/docs/api-reference/emails/send-email), [DummyJSON Products](https://dummyjson.com/docs/products), [Vercel Container](https://vercel.com/docs/functions/runtimes/container).

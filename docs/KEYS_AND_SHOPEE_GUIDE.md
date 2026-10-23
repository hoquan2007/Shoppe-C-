# Chuẩn bị dịch vụ và API Shopee

Kiểm tra ngày 22/10/2026. Website: https://shoppec.vercel.app. Đây là hướng dẫn cho bản hiện tại; không chứa giá trị bí mật. Tài liệu Open Platform đã được đọc trực tiếp qua trình duyệt vì công cụ tìm kiếm bị Shopee trả 403.

## 1. Hệ thống hiện gọi API nào?

**Hiện có 0 API Shopee được tích hợp.** Có snapshot 30 sản phẩm từ DummyJSON trong `database/demo-catalog.json` và luồng C++ để admin xem trước/nhập 1–600 sản phẩm. Nếu nguồn API không đủ, C++ bổ sung mẫu mô phỏng `ShoppeDemo` có nhãn riêng và ảnh minh họa từ nguồn. Trang chủ đọc database qua C++; không gọi Shopee hoặc DummyJSON mỗi lần mở trang. Giá VNĐ và tồn kho demo phục vụ kiểm thử bài tập; không cần key mới.

| Nhóm                   | Đường đi hiện tại                                                                       | Nhiệm vụ                                                     |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Giao diện → server C++ | `/api/meta`, `/api/products`, `/api/products/:id`, `/api/shops/:id`                     | Danh mục cấu hình, tìm kiếm, hàng hóa, biến thể, trang shop  |
| Giao diện → server C++ | `/api/cart`, `/api/checkout/quote`, `/api/checkout`, `/api/orders`, `/api/payments/:id` | Giỏ, báo giá, tạo đơn, theo dõi, thanh toán                  |
| C++ → PostgreSQL       | libpq qua Supabase Session pooler, TLS                                                  | Tài khoản, phiên, kho, đơn, voucher, trả hàng, audit         |
| C++ → Supabase Storage | `/storage/v1/object/...`                                                                | Upload ảnh, frontend xem URL public                          |
| C++ → payOS            | `/v2/payment-requests` và `/v2/payment-requests/{orderCode}`                            | Tạo link, đối soát; webhook vào `/api/payments/webhook`      |
| C++ → Resend           | `/emails`                                                                               | Email xác minh, khôi phục, thông báo; chưa cấu hình gửi thật |

Danh sách đầy đủ API ứng dụng: [API_CURRENT.md](API_CURRENT.md). Tên `/api/products` là API của dự án, không phải API Shopee.

## 2. Những thứ cần chuẩn bị ngay

| Dịch vụ/biến                                              | Tình trạng                                           | Việc của bạn                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                            | Đã cấu hình Production bằng Session pooler Singapore | Giữ project Supabase hoạt động; không thay lại bằng địa chỉ direct IPv6                                   |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` | Đã cấu hình; bucket `product-images`                 | Chưa cần tạo thêm key cho upload hiện tại                                                                 |
| `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`  | Đã cấu hình; đọc API được chấp nhận                  | Kiểm tra đúng kênh, đúng tài khoản ngân hàng; đăng ký webhook và hoàn thành một vòng demo có chuyển khoản |
| `APP_URL`, `APP_ENV`, `CRON_SECRET`                       | Đã cấu hình cho domain hiện tại                      | Cập nhật APP_URL và webhook khi đổi domain; CRON_SECRET không đưa vào frontend                            |
| `RESEND_API_KEY`, `EMAIL_FROM`                            | **Còn thiếu**                                        | Tạo Resend, xác minh domain gửi email, tạo key có quyền gửi                                               |
| Key Shopee                                                | **Chưa cấu hình; connector chưa triển khai**         | Kiểm tra điều kiện/quyền sử dụng dữ liệu ở phần 4 trước khi xin key                                       |

Không cần Supabase anon key cho kiến trúc hiện tại: người dùng đăng nhập bằng hệ thống C++ và frontend gọi API cùng website. Service key chỉ được giữ trên server. Không thêm service key hoặc khóa thanh toán vào biến có tiền tố `VITE_`.

Các khóa từng gửi trực tiếp trong chat nên được thay trước khi dùng ngoài buổi demo. Thực hiện tại dashboard dịch vụ, cập nhật lại biến Production trên Vercel và redeploy; không gửi giá trị mới vào chat/GitHub. Việc thay khóa không tự đổi mật khẩu admin của ứng dụng.

### Email thật: từng bước

1. Tạo/đăng nhập tài khoản tại [Resend](https://resend.com/docs/dashboard/domains/introduction).
2. Thêm domain bạn sở hữu trong Domains, khai báo các bản ghi DNS Resend cung cấp và chờ Verified. Tên miền `vercel.app` mặc định không phải domain DNS bạn sở hữu để xác minh gửi email.
3. Tạo API key cho việc gửi email. Đặt `EMAIL_FROM` theo domain đã xác minh, ví dụ `Shoppe <no-reply@tenmiencuaban.vn>`.
4. Vào Vercel → project **shoppe-c** → Settings → Environment Variables → Production. Thêm `RESEND_API_KEY` dưới dạng Secret/Sensitive, thêm `EMAIL_FROM`, rồi redeploy.
5. Dùng email của bạn đăng ký tài khoản thử, kiểm tra email xác minh; thử quên mật khẩu, bảo đảm link dùng được một lần. Nếu chưa có domain, email test bị giới hạn theo tài khoản/provider; không tuyên bố đã có gửi email công khai.
6. Outbox có retry ở trang admin; cron Hobby hiện chạy mỗi ngày. Chưa có worker gửi email liên tục hoặc bảo đảm thông báo tức thời.

Nguồn: [Resend Domains](https://resend.com/docs/dashboard/domains/introduction), [Resend API keys](https://resend.com/docs/dashboard/api-keys/introduction).

### Thanh toán thật: từng bước

1. Đăng nhập [payOS](https://my.payos.vn/), mở kênh đang dùng và xác nhận ngân hàng nhận tiền của bạn.
2. Cấu hình webhook HTTPS: `https://shoppec.vercel.app/api/payments/webhook`. Dùng chức năng xác nhận/kiểm tra webhook của payOS; backend kiểm chữ ký và chỉ ghi tiền cho checkout tồn tại.
3. Đặt một đơn **giá trị nhỏ do bạn lựa chọn** từ giao diện, chọn payOS, kiểm tra số tiền/nội dung/tài khoản thụ hưởng rồi tự chuyển khoản.
4. Kiểm tra kết quả: nhóm thanh toán paid, các đơn con đúng shop, không ghi trùng khi nhận webhook lặp. Kiểm tra thêm hủy/chờ hết hạn ở một đơn riêng.
5. Nếu cần hoàn, bạn chuyển tiền thủ công qua ngân hàng rồi admin ghi số tiền và mã tham chiếu. Nút ghi hoàn trong app không chuyển tiền thật.

Đến thời điểm viết: kiểm thử chữ ký bằng fixture và API đọc đã qua; chưa có bằng chứng hoàn tất một giao dịch ngân hàng thật hoặc webhook kênh của bạn. Nguồn: [payOS API](https://payos.vn/docs/api/).

## 3. Các API Shopee phù hợp về mặt kỹ thuật

Những endpoint dưới đây đã được đọc trên tài liệu chính thức, **chưa phải API đang chạy trong Shoppe**. Base Production dành cho local developer trong tài liệu: `https://partner.shopeemobile.com`.

| Method + path                            | Dữ liệu                                   | Điều cần chú ý                                                                           |
| ---------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/v2/product/get_category`       | Cây danh mục, id, parent id, tên hiển thị | VN hỗ trợ `language=vi`; ví dụ gọi có partner_id, shop_id, access_token, timestamp, sign |
| `GET /api/v2/product/get_item_list`      | ID/trạng thái sản phẩm của shop           | Có offset, page_size tối đa 100, item_status; lấy tiếp bằng next_offset                  |
| `GET /api/v2/product/get_item_base_info` | Chi tiết sản phẩm theo danh sách ID       | Batch tối đa 50 ID; dùng sau get_item_list                                               |
| `GET /api/v2/product/get_model_list`     | Biến thể, giá, thông tin tồn kho          | Theo item_id; giữ định danh model và shop tương ứng                                      |

Nguồn: [get_category](https://open.shopee.com/documents/v2/v2.product.get_category?module=89&type=1), [get_item_list](https://open.shopee.com/documents/v2/v2.product.get_item_list?module=89&type=1), [get_item_base_info](https://open.shopee.com/documents/v2/v2.product.get_item_base_info?module=89&type=1), [get_model_list](https://open.shopee.com/documents/v2/v2.product.get_model_list?module=89&type=1).

Đây là Open Platform phục vụ vận hành shop đã cấp quyền. `get_item_list` không cấp quyền tìm mọi hàng hóa trên toàn Shopee. Cây danh mục cũng không đồng nghĩa có hàng để bán hoặc nguồn cung thực tế. Trang chủ hiện dùng danh mục của dự án; không có API chính thức được tích hợp để sao chép feed trang chủ Shopee.

## 4. Kiểm tra điều kiện trước khi đăng ký

Tài liệu đăng ký, cập nhật 10/09/2026, ghi tiêu chí người bán Việt Nam là **Preferred Sellers hoặc Mall Sellers**. Tài khoản người bán cá nhân/doanh nghiệp chỉ phục vụ shop của chính mình. Diện ISV phục vụ nhiều shop yêu cầu doanh nghiệp và hồ sơ sản phẩm đang hoạt động. Vì vậy chỉ tạo tài khoản Shopee mới chưa bảo đảm được duyệt API.

Hướng dẫn ISV cũng loại trừ việc trích thông tin niêm yết để tạo giao dịch ngoài Shopee. Mục tiêu lấy hàng của shop khác rồi nhận tiền payOS tại website hiện tại không phải quyền mặc định của Open Platform. Cần nguồn hàng và quyền sử dụng dữ liệu phù hợp; không dùng cookie của tài khoản hoặc API nội bộ để thay quyền truy cập.

Nguồn: [Developer account registration](https://open.shopee.com/developer-guide/12), [Introduction](https://open.shopee.com/developer-guide/4).

### Đăng ký Open Platform khi đủ điều kiện

1. Mở [Shopee Open Platform](https://open.shopee.com/), chọn Log In → Sign up; xác minh email và tự đặt mật khẩu.
2. Vào Console → App Management → App List, chọn đúng loại hồ sơ. Với shop của chính bạn, kiểm tra diện Shopee Seller; chỉ chọn ISV nếu thực sự đáp ứng hồ sơ doanh nghiệp.
3. Tự hoàn thành xác minh shop/hồ sơ, gửi duyệt. Không gửi giấy tờ cá nhân, mật khẩu hoặc OTP cho tôi.
4. Sau khi hồ sơ được duyệt, Create App, chọn loại app phù hợp và xem API Permission. Diện Seller có app Seller In-house System; không khai app loại khác chỉ để xin thêm quyền.
5. Sau khi tạo app, nhận **Test Partner ID + Test Key**, kiểm thử bằng sandbox. Test key không dùng cho Production.
6. Hoàn thành thử nghiệm, gửi Go Live và chờ duyệt. Chỉ khi Online mới dùng **Live Partner ID + Live Key** theo quyền app.
7. Khai báo Redirect URL Domain và hoàn tất chủ shop ủy quyền; server nhận code, đổi lấy access_token/refresh_token và lưu riêng theo shop. Callback Shopee của dự án **chưa tồn tại**; cần triển khai connector trước khi đăng ký callback sử dụng thật. Không nhập webhook payOS vào trường callback Shopee.

Nguồn: [App management](https://open.shopee.com/developer-guide/14), [Authorization and Authentication](https://open.shopee.com/developer-guide/20). Bài hướng dẫn là trình tự chuẩn; quyết định duyệt/quyền cụ thể do Shopee cung cấp cho hồ sơ của bạn.

### Affiliate nếu chỉ cần giới thiệu hàng hóa

Cổng Việt Nam đã được đọc trực tiếp trong trình duyệt. Đăng ký/đăng nhập tại [Shopee Affiliate Việt Nam](https://affiliate.shopee.vn/), sau khi được duyệt mở **Open API Platform**. Tài liệu xác thực ghi dùng **AppId + Secret**, khác Partner ID/Key của Open Platform. Nếu mục cấp key chưa có, hỏi hỗ trợ ngay trong portal về quyền Open API; việc đọc được tài liệu không chứng minh đã được cấp key.

[API List Việt Nam](https://affiliate.shopee.vn/open_api/list) có các nhóm offer, short link và báo cáo. Truy vấn GraphQL [productOfferV2](https://affiliate.shopee.vn/open_api/list?type=product_offer) hỗ trợ tìm sản phẩm/offer và lọc productCatId. Tài liệu trỏ tới [hướng dẫn danh mục VN](https://banhang.shopee.vn/edu/category-guide) để tra category ID.

Luồng phù hợp: C++ lấy offer → hiển thị thẻ sản phẩm → khách bấm link affiliate sang Shopee để mua. Không nhập offer vào kho của dự án rồi nhận tiền payOS như hàng của shop mình. Nếu triển khai, backend C++ phải đánh dấu nguồn/kiểu checkout bên ngoài, chặn thêm offer vào đơn nội bộ và frontend hiển thị nút “Mua trên Shopee”.

Tài liệu xác thực dùng SHA256 trên AppId + timestamp + JSON payload + Secret và gửi Authorization header; C++/OpenSSL có thể thực hiện. Không đưa AppId/Secret vào JavaScript, không nhầm cơ chế này với chữ ký Open Platform. Nguồn: [Overview VN](https://affiliate.shopee.vn/open_api/document?type=overview), [Authentication VN](https://affiliate.shopee.vn/open_api/document?type=authentication). **Dự án hiện chưa có connector Affiliate, chưa gọi API thật bằng key của bạn.**

## 5. Phương án C++ khi được cấp quyền

Luồng dự kiến: admin yêu cầu đồng bộ → connector C++ gọi API Shopee bằng HTTPS/chữ ký → kiểm tra quyền shop/phân trang → ánh xạ danh mục, hàng và biến thể → PostgreSQL → frontend gọi API C++ hiện tại.

- Server C++ xử lý state chống CSRF cho callback, chữ ký, đổi/refresh token, phân trang, giới hạn tốc độ, retry có kiểm soát và ánh xạ dữ liệu. JavaScript chỉ xử lý tương tác, không giữ secret hoặc quyết định giá/tồn kho/quyền truy cập.
- Credential tĩnh dự kiến: Partner ID, Partner Key và môi trường API. Token động và shop_id lưu riêng từng shop trong kho dữ liệu server; cần mã hóa token trước khi lưu, quản lý vòng đời và thu hồi quyền.
- Đây là cấu hình **dự kiến**, chưa có `SHOPEE_*` biến đang được chương trình đọc. Thêm tên biến vào Vercel lúc này không tự kích hoạt đồng bộ.
- Đồng bộ xuống database có checkpoint và chạy tách khỏi request trang chủ. Không gọi Shopee cho từng thẻ sản phẩm; không ghi đè tồn kho đang giữ cho đơn của dự án. Cần thiết kế quy tắc tồn kho/nguồn hàng trước khi cho bán thật.
- Cron một lần/ngày của Hobby không đáp ứng đồng bộ tồn kho vài phút hoặc refresh token liên tục. Cần lựa chọn lịch/push/refresh theo nhu cầu thực tế và quyền được Shopee cấp. Hướng dẫn auth hiện ghi access_token 4 giờ, refresh_token 30 ngày; server phải dùng thời hạn trả về thay vì frontend tự đoán.

Thứ tự đề xuất: hoàn tất email và thanh toán demo → kiểm tra đủ điều kiện Shopee → chọn đồng bộ shop của mình hoặc Affiliate → triển khai connector C++ tương ứng → kiểm thử sandbox → xin live và kiểm thử dữ liệu thật được cho phép.

Cập nhật catalog API: xem [bảng chọn API và quy trình mới](SHOPEE_API_SELECTION.md). Chế độ demo không cần key mới; không có API Shopee được kích hoạt.

# Database, đăng nhập Google và nguồn dữ liệu Shopee

Ngày đối chiếu: 23/10/2026. Đây là hướng dẫn và phương án triển khai; chưa thêm chức năng Google hoặc connector Shopee, chưa thay khóa/schema/Production, chưa commit/push/deploy.

## 1. Dữ liệu hiện tại

Đã kiểm tra trực tiếp qua kết nối Supabase:

- Project: **QuanShop**, ref `igjwnwzhyxbpntthkapk`, trạng thái `ACTIVE_HEALTHY`.
- Region: `ap-southeast-1` (Singapore).
- Database PostgreSQL: `postgres`; schema ứng dụng: **`shoppe`**.
- 600 sản phẩm, 600 biến thể và 7 giá trị danh mục khác nhau tại thời điểm truy vấn.
- Có 25 bảng ứng dụng cùng bảng `schema_migrations`.
- Bucket Storage `product-images` đã tồn tại, cho phép đọc công khai.

Vercel phục vụ frontend và server C++; dữ liệu lâu dài nằm ở Supabase. C++ kết nối PostgreSQL qua Session pooler/TLS theo cấu hình đã triển khai. Người dùng không truy vấn trực tiếp schema ứng dụng bằng frontend.

Mở [Supabase project](https://supabase.com/dashboard/project/igjwnwzhyxbpntthkapk) → Table Editor → chọn schema **shoppe** để xem. Ảnh upload nằm ở Storage → `product-images`. Với sản phẩm demo, database chủ yếu giữ URL ảnh từ CDN DummyJSON; không phải toàn bộ ảnh demo đã được sao chép vào bucket.

Bản thử giao diện `http://localhost:18231` dùng database **riêng**:

```text
D:\Shoppe-C-\.cache\redesign-preview\preview.db
```

Đây là SQLite; có thể có các file `-wal`/`-shm` khi chạy. Không tự đồng bộ với PostgreSQL Production. Các tiến trình local khác có thể dùng đường dẫn SQLite hoặc DATABASE_URL khác theo cấu hình riêng.

### Những thông tin schema đã hỗ trợ

| Nhóm | Bảng | Thông tin |
| --- | --- | --- |
| Tài khoản | users, sessions, email_tokens | Email, tên, vai trò, trạng thái, password hash, phiên, xác minh/khôi phục email |
| Người bán | shops | Chủ shop, hồ sơ, khu vực, trạng thái duyệt |
| Catalog | products, variants | Tên, mô tả, ảnh/URL, danh mục, nguồn, SKU/biến thể, giá VNĐ, tồn kho |
| Mua sắm | addresses, carts, wishlists | Địa chỉ, điện thoại nhận hàng, giỏ và yêu thích |
| Khuyến mại | vouchers, redemptions | Mã giảm giá, điều kiện, lịch sử sử dụng |
| Đơn/thanh toán | checkouts, orders, order_items, payment_events | Đơn, snapshot hàng/giá, trạng thái, mã payOS, số tiền, sự kiện webhook |
| Sau bán | returns, refunds, reviews | Trả hàng, ghi nhận hoàn tiền, đánh giá |
| Giao tiếp | conversations, messages, notifications, outbox | Chat, thông báo, email chờ gửi |
| Vận hành | settings, audit, rate_limits | Cấu hình, nhật ký thao tác và giới hạn yêu cầu |

Các trường truy vấn chính có cột/index; nhiều thông tin chi tiết được lưu trong `payload` JSON dạng text. Tên/mô tả/source không có nghĩa đều là cột riêng. Danh mục hiện là trường của sản phẩm, chưa có bảng cây danh mục Shopee riêng.

Đăng nhập hiện thuộc C++ (`shoppe.users`/`shoppe.sessions`), chưa dùng Supabase Auth. Password được băm PBKDF2-SHA256; không lưu mật khẩu Google. Thanh toán lưu mã/tham chiếu/trạng thái/số tiền, không cần mật khẩu ngân hàng, OTP hoặc PIN.

Nguồn kiểm tra tại repo: `database/schema.sql`, `backend/src/database.cpp`, `backend/src/security.cpp`, `backend/src/application.cpp` và báo cáo triển khai hiện có. Truy vấn lần này chỉ đọc schema, số lượng và metadata bucket.

## 2. Đăng nhập Google phù hợp với C++

Chọn **Google Identity Services (GIS), callback JavaScript, xác minh ID token ở C++**. Không chuyển tài khoản/giỏ/đơn sang Firebase hoặc Supabase Auth.

1. Frontend hiển thị nút Google bằng thư viện GIS chính thức.
2. Người dùng đồng ý đăng nhập với Google.
3. Frontend gửi ID token qua HTTPS đến endpoint C++ dự kiến `POST /api/auth/google`.
4. C++ xác minh chữ ký bằng thư viện JWT phù hợp, issuer, audience, hạn token, nonce/chống phát lại và bảo vệ CSRF/Origin phù hợp với callback đã chọn.
5. C++ tra danh tính Google bằng `sub`, tạo/liên kết tài khoản theo quy tắc rõ ràng, rồi phát cookie phiên của website như luồng hiện tại.

Ở bản local ngày 23/10/2026 đã bổ sung endpoint Google, bảng `auth_identities` và `auth_challenges`, xác minh token C++ và nút GIS. Production chưa được cập nhật. Mapping Google dùng `sub` với ràng buộc duy nhất; tài khoản mới mặc định buyer. Tài khoản email có sẵn phải đăng nhập bằng mật khẩu rồi liên kết Google từ trang Tài khoản; không tự ghép bằng email hoặc tự cấp quyền admin.

CSP bản local đã cho phép các đường dẫn script/frame/connect GIS cụ thể khi có `GOOGLE_CLIENT_ID`. Không cho phép wildcard. Cấu hình Production chỉ thay đổi sau khi được duyệt triển khai.

Với flow GIS callback trên, cần **OAuth Client ID**. Không cần API key kiểu `AIza...`, service-account key hoặc Client Secret. Nếu sau này chọn Authorization Code Flow do server C++ điều khiển, khi đó mới cần cấu hình Client Secret và redirect URI tương ứng; hai flow không được trộn lẫn.

### Tạo Client ID từng bước

1. Mở [Google Cloud Console](https://console.cloud.google.com/), đăng nhập tài khoản của bạn. Chọn project ở thanh trên → **New Project**; đặt tên ví dụ `Shoppe-C-Demo`, rồi chọn project đó.
2. Vào **Google Auth Platform → Branding → Get started** nếu chưa cấu hình. Nhập tên ứng dụng `Shoppe C`, email hỗ trợ, email liên hệ của bạn. Logo là tùy chọn khi thử. Đọc và tự xác nhận điều khoản được hiển thị.
3. Trong **Audience**, chọn **External** cho tài khoản Gmail cá nhân. Giữ chế độ Testing khi demo; thêm email của bạn và các tài khoản sẽ dùng kiểm thử tại Test users.
4. Trong **Data Access**, chỉ dùng quyền đăng nhập cơ bản: `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`. Không cần quyền Gmail, Drive hoặc danh bạ.
5. Vào **Clients → Create client → Web application**. Đặt tên ví dụ `Shoppe C Web Demo`.
6. Trong **Authorized JavaScript origins**, thêm riêng từng dòng:

   ```text
   http://localhost
   http://localhost:18231
   https://shoppec.vercel.app
   ```

   Nếu thực sự dùng một cổng khác (8080 hoặc Vite 5173), thêm origin đúng cổng đó. Origin chỉ gồm giao thức, host và cổng; không có `/login` hoặc đường dẫn.
7. **Authorized redirect URIs** để trống cho phương án GIS callback JavaScript nêu trên. Không điền callback Supabase vì ứng dụng hiện không dùng Supabase Auth. Nếu UI bắt chọn một flow khác, đối chiếu trước khi tạo thay vì đoán URL.
8. Bấm **Create**, lưu Client ID dạng `....apps.googleusercontent.com`. Nếu trang có hiển thị Client Secret, không gửi nó vào chat; flow này không dùng tới.

Client ID là định danh công khai của ứng dụng. Biến server dùng là `GOOGLE_CLIENT_ID`; bản local đã hỗ trợ. Cần cấu hình đúng origins trong Google Console và kiểm thử bằng tài khoản thật. Tiếp tục thử local trước; cấu hình Vercel và deploy thực hiện sau khi chủ dự án cho phép.

Không điền URL privacy/terms chưa có thực trên website. Khi mở dùng rộng rãi, bổ sung trang chính sách thật và kiểm tra yêu cầu branding/xác minh trong Google Console. Chưa coi việc tạo Client ID là đã nghiệm thu đăng nhập.

Tài liệu Google:

- [Thiết lập GIS, Web client ID và origins](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
- [Branding, Audience, Data Access và test users](https://developers.google.com/workspace/guides/configure-oauth-consent).
- [Xác minh Google ID token tại backend](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
- [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## 3. Shopee là nguồn dữ liệu, payOS là thanh toán của web

Mục tiêu kỹ thuật đã hiểu: Shopee cung cấp dữ liệu catalog khi có quyền sử dụng; C++ của dự án quản lý người dùng, giỏ, giá bán nội bộ, kho, đơn, thanh toán payOS, trả hàng và hoàn tiền.

Một đơn của website không trở thành đơn Shopee. Thanh toán payOS không cập nhật trạng thái đơn hoặc giảm tồn Shopee nếu chỉ tích hợp các API đọc. Giá/kho nội bộ cần có chính sách riêng; dữ liệu đồng bộ không được ghi đè snapshot đơn cũ hoặc tự bù lại hàng đã bán trong web.

### API Open Platform nên chọn

Base trong các mẫu tài liệu: `https://partner.shopeemobile.com`. Các tên dưới đây là API chính thức đã đọc, **chưa tích hợp** vào dự án.

| API | Dữ liệu / ứng dụng |
| --- | --- |
| `v2.product.get_category` | Cây danh mục, ID/parent/tên; VN hỗ trợ `vi` theo phạm vi market/shop |
| `v2.product.get_item_list` | ID/trạng thái/ngày sửa sản phẩm của shop được ủy quyền; phân trang tối đa 100 |
| `v2.product.get_item_base_info` | Tên, mô tả, danh mục, SKU, ảnh URL và dữ liệu cơ bản; batch tối đa 50 item ID |
| `v2.product.get_model_list` | Biến thể, lựa chọn, model ID/SKU, ảnh biến thể, giá và dữ liệu kho |
| `v2.product.get_attribute_tree` | Thuộc tính của danh mục để xây bộ lọc/thông số |
| `v2.product.get_brand_list` | Thương hiệu thuộc danh mục lá |

Tham chiếu:

- [Danh mục](https://open.shopee.com/documents/v2/v2.product.get_category?module=89&type=1).
- [Danh sách hàng](https://open.shopee.com/documents/v2/v2.product.get_item_list?module=89&type=1).
- [Chi tiết và ảnh](https://open.shopee.com/documents/v2/v2.product.get_item_base_info?module=89&type=1).
- [Biến thể](https://open.shopee.com/documents/v2/v2.product.get_model_list?module=89&type=1).
- [Thuộc tính](https://open.shopee.com/documents/v2/v2.product.get_attribute_tree?module=89&type=1).
- [Thương hiệu](https://open.shopee.com/documents/v2/v2.product.get_brand_list?module=89&type=1).

Đọc API không chứng minh app có quyền gọi. Nhóm này cần app/Partner ID, Partner Key, shop đã cấp quyền và token phù hợp. `get_item_list` không phải API lấy tùy ý toàn bộ sản phẩm trên sàn hoặc sao chép trang chủ Shopee.

Luồng đăng ký: tài khoản developer → hồ sơ đúng loại → Shopee duyệt → tạo app Product Management/Seller In House/loại phù hợp được chấp thuận → thử sandbox → shop ủy quyền → lấy token và gọi API đọc bằng C++. Các chi tiết loại app/quyền phải đối chiếu Console khi được cấp.

[Hướng dẫn đăng ký](https://open.shopee.com/developer-guide/12), cập nhật hiển thị 10/09/2026: người bán VN có điều kiện Preferred/Mall; ISV là doanh nghiệp có hồ sơ và sản phẩm dịch vụ. Phần điều kiện ISV nêu hạn chế trích xuất listing để phục vụ giao dịch ngoài Shopee. Vì vậy, việc chỉ dùng ảnh/thông tin, không dùng Shopee Payment, không tự tạo quyền sử dụng catalog cho website payOS. Cần có nguồn/shop được phép và phạm vi Shopee chấp thuận cho mục đích cụ thể.

### Affiliate API là trường hợp khác

[productOfferV2](https://affiliate.shopee.vn/open_api/list?type=product_offer) trả tên, ảnh, shop, category IDs, khoảng giá, rating/sales và link sản phẩm/offer. Có tìm keyword/lọc category/shop và sort. Đây là dữ liệu offer Affiliate, không có đầy đủ mô tả/biến thể/kho như API quản trị shop.

Affiliate có feed và API link/báo cáo riêng; không tạo đơn payOS hoặc quyền bán hàng thay shop. Với dự án hiện tại, không chọn Affiliate làm nguồn kho độc lập mặc định. Nếu muốn dùng chỉ để trưng bày/tham khảo trong đồ án, cần được chấp thuận đúng phạm vi sử dụng; API access không đồng nghĩa được sử dụng ở mọi mô hình.

Affiliate dùng **App ID + Secret** riêng qua GraphQL, khác Partner ID/Key/token của Open Platform. Tài liệu đọc được không chứng minh tài khoản đã có API access; tài liệu productOfferV2 cũng có lỗi thiếu quyền và kênh liên hệ xin quyền. Không mở hoặc lấy secret từ tài khoản trong lần khảo sát này.

## 4. Phương án C++ để phát triển tiếp

```text
Shopee API có quyền / dữ liệu demo
              ↓
Connector C++: xác thực, gọi HTTPS, phân trang, kiểm tra và ánh xạ
              ↓
Supabase PostgreSQL: catalog và nguồn dữ liệu
              ↓
API C++: tìm kiếm, lọc, sort, phân trang và dữ liệu cho giao diện
              ↓
HTML/CSS/JavaScript
              ↓
C++: giỏ → quote → giữ kho → đơn nội bộ → payOS → webhook
```

Nên bổ sung mapping nguồn `(provider, region, shop_id, item_id, model_id)` dạng định danh an toàn và chống trùng; cây danh mục, ảnh, thuộc tính, URL nguồn, thời điểm đồng bộ và kết quả đồng bộ. Cần thiết kế việc lưu/quản lý token riêng, không đặt Partner Key/Secret hoặc token vào frontend.

Các phần chính dự kiến: `ShopeeCatalogProvider` gọi/chuẩn hóa dữ liệu; repository C++ lưu database; dịch vụ đơn/kho/giá C++ hiện có tiếp tục xử lý giao dịch; payOS là cổng thanh toán của website. Đồng bộ qua admin có preview/commit, giữ sửa đổi và tồn nội bộ theo chính sách được thống nhất.

Hiện nguồn 600 hàng vẫn là demo từ DummyJSON cùng các mẫu mở rộng có nhãn demo. Chưa có connector/credential Shopee hoạt động. Hiện UI còn lọc giá/sort/phân trang ở JavaScript; khi nâng phần catalog phục vụ đồ án C++, chuyển chúng vào API C++, frontend chỉ gửi tham số và render.

Thứ tự chuẩn bị: **Google Client ID → triển khai/test Google local → xác định quyền nguồn Shopee → connector C++ và mapping catalog → kiểm thử → chủ dự án duyệt trước Git/deploy**. Trong khi chưa đủ quyền Shopee, tiếp tục demo/fixture hoặc catalog do chủ hàng cung cấp và cho phép sử dụng.

# Những thứ bạn cần chuẩn bị và hướng dẫn thiết lập

Cập nhật ngày 22/10/2026. Thực hiện theo thứ tự Supabase → Vercel/COD → payOS → email. Bạn chưa cần mua hosting hoặc chuyển sang gói trả phí để bắt đầu kiểm chứng demo.

## 1. Danh sách chuẩn bị

| Thứ cần có | Dùng để làm gì | Giá trị đưa vào cấu hình |
| --- | --- | --- |
| GitHub và Vercel Hobby | Lấy source, build, chạy frontend/backend C++ | Đăng nhập tài khoản; không cần gửi token cho người khác |
| Supabase Free | PostgreSQL và ảnh sản phẩm | DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET |
| payOS và tài khoản ngân hàng của bạn | Nhận chuyển khoản và thông báo thanh toán | PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY |
| Resend | Gửi xác minh email, khôi phục mật khẩu, cập nhật đơn | RESEND_API_KEY, EMAIL_FROM |
| Email admin bạn kiểm soát | Đăng nhập quản trị lần đầu | BOOTSTRAP_ADMIN_EMAIL và mật khẩu riêng ít nhất 12 ký tự |
| Ảnh/dữ liệu sản phẩm demo | Chuẩn bị kịch bản bán hàng | Một vài sản phẩm, biến thể, giá, tồn và hai shop |
| Ứng dụng ngân hàng và tài khoản người mua demo | Bạn tự thanh toán khi kiểm chứng online | Không đưa thông tin đăng nhập ngân hàng vào website hoặc chat |

Giữ khóa trong Vercel Environment Variables hoặc file .env tại máy. File .env đã bị Git bỏ qua. Không dán khóa/mật khẩu/URI có mật khẩu vào chat, ảnh chụp hoặc issue GitHub.

## 2. Tạo Supabase Free

1. Mở [Supabase Dashboard](https://supabase.com/dashboard), đăng nhập bằng tài khoản của bạn.
2. Tạo organization nếu chưa có, chọn Free. Tạo project, ví dụ shoppe-demo; lưu mật khẩu database vào trình quản lý mật khẩu.
3. Chọn vùng gần nơi Vercel thực thi backend. Chờ project sẵn sàng.
4. Mở **Connect**, lấy PostgreSQL URI. Nếu kết nối direct IPv6 không dùng được, chọn **Session pooler** và dùng nguyên username/host/port mà dashboard cung cấp.
5. Thay placeholder mật khẩu trong URI bằng mật khẩu database, URL-encode ký tự đặc biệt. Thêm `sslmode=require` vào query string (dùng `&` nếu đã có query). Lưu thành DATABASE_URL. Đặt `connect_timeout=10` nếu cần giới hạn thời gian kết nối.
6. Lấy Project URL, lưu thành SUPABASE_URL. Mở Settings → API Keys, lấy **secret key cho backend**; đặt vào SUPABASE_SERVICE_KEY. Biến vẫn mang tên này để tương thích mã hiện có. Backend đã hỗ trợ secret key mới bằng header apikey và service_role JWT cũ khi còn được nhà cung cấp hỗ trợ.
7. Mở Storage, tạo bucket tên `product-images`, bật public để trình duyệt đọc ảnh sản phẩm. Giới hạn file 2MB và MIME `image/png`, `image/jpeg`, `image/webp`.
8. Không tạo policy cho khách ẩn danh tải lên/xóa ảnh. Việc ghi ảnh đi qua server C++ sau khi kiểm tra tài khoản và shop.
9. Database của ứng dụng dùng schema riêng `shoppe`, tự áp dụng migration khi server khởi động. Không thêm schema này vào danh sách schema công khai của Data API. Ứng dụng dùng auth C++ riêng; không cần cấu hình Supabase Auth cho đăng nhập website.

Chưa cần nhập SQL bằng tay hoặc tạo tài khoản demo trong dashboard database. [Hướng dẫn kết nối PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Storage buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets).

Gói Free hiện có giới hạn dung lượng và có thể tạm dừng project sau thời gian không hoạt động. Trước buổi demo, mở dashboard kiểm tra project đang chạy và thử website trước. Xem [hạn mức hiện hành](https://supabase.com/pricing).

## 3. Đăng nhập và tạo project Vercel

1. Mở PowerShell trên máy, chạy `vercel login` và tự hoàn tất đăng nhập. Kiểm tra bằng `vercel whoami`.
2. Repository hiện có nhánh `codex/deployment-payment-readiness`. Khi import từ GitHub, chọn đúng nhánh có mã nguồn và đã qua CI; nhánh main ban đầu chỉ có README. Nếu chưa merge, có thể đặt nhánh này làm Production Branch của project demo.
3. Tại [Vercel](https://vercel.com/new), import `hoquan2007/Shoppe-C-`, chọn tài khoản Hobby của bạn. Dùng thư mục gốc repository.
4. Giữ cơ chế nhận `Dockerfile.vercel`. Không đặt output directory là dist để chỉ deploy frontend, vì API C++ cũng phải được chạy.
5. Chuẩn bị tên project ổn định, ví dụ `shoppe-cpp-demo`; sử dụng đúng domain Vercel thực sự cấp. APP_URL phải là origin HTTPS chính xác, không có dấu `/` cuối hoặc đường dẫn phụ. Nếu domain thực tế khác dự kiến, cập nhật APP_URL và redeploy trước khi dùng đăng nhập/checkout.
6. Thêm biến môi trường ở bảng dưới cho Production. Với Preview, dùng database thử nghiệm riêng và đúng APP_URL; không trỏ nhiều bản test vào database chứa dữ liệu demo thật.
7. Deploy. Kiểm tra build log, runtime log và `/api/health`. Kết quả phải có `engine: C++20`, `database: postgresql`.
8. Nếu website yêu cầu Vercel Authentication trước khi truy cập, điều chỉnh Deployment Protection cho bản demo và webhook. payOS phải gọi được webhook mà không đăng nhập Vercel. Không gửi bypass token vào URL webhook.
9. Đăng nhập admin bằng tài khoản bootstrap, sau đó xóa hai biến BOOTSTRAP_ADMIN_* khỏi Vercel và redeploy. Admin chỉ được tạo khi email chưa tồn tại; dùng một email mới do bạn kiểm soát.

| Biến | Giá trị |
| --- | --- |
| APP_ENV | production |
| APP_URL | Origin HTTPS chính xác của project |
| PORT | 8080 |
| DATABASE_URL | URI Supabase PostgreSQL với TLS |
| SUPABASE_URL | Project URL |
| SUPABASE_SERVICE_KEY | Secret key backend |
| SUPABASE_BUCKET | product-images |
| SEED_DEMO | false |
| CRON_SECRET | Chuỗi ngẫu nhiên ít nhất 32 ký tự, lưu riêng |
| BOOTSTRAP_ADMIN_EMAIL | Email mới do bạn kiểm soát; chỉ dùng lần đầu |
| BOOTSTRAP_ADMIN_PASSWORD | Mật khẩu riêng ít nhất 12 ký tự; chỉ dùng lần đầu |

Tạo CRON_SECRET bằng trình tạo mật khẩu. Không dùng chuỗi mẫu hoặc mật khẩu demo. Các biến STATIC_DIR/SCHEMA_PATH đã có trong Dockerfile.

Vercel ghi [Container Runtime](https://vercel.com/docs/functions/runtimes/container) đang Beta trên mọi gói. Khả năng dùng thực tế vẫn phải xác minh ở deployment của bạn. [Hobby](https://vercel.com/docs/plans/hobby) dành cho dự án cá nhân phi thương mại; kế hoạch hiện tại là bài tập/demo. Nếu chuyển thành hoạt động kinh doanh, cần đánh giá lại gói và điều kiện sử dụng.

## 4. Chạy thử COD trước

1. Đăng ký hai người dùng để mở hai shop tại `/seller`.
2. Admin duyệt shop ở `/admin/shops`.
3. Seller thêm sản phẩm, biến thể, ảnh và tồn; admin cũng có thể thêm hàng cho shop đã duyệt.
4. Buyer đăng ký, thêm địa chỉ và chọn sản phẩm của cả hai shop vào giỏ.
5. Checkout bằng COD, kiểm tra tổng tiền/voucher/phí ship và hai đơn con.
6. Demo xác nhận → chuẩn bị → đang giao → giao thành công. Admin ghi thu COD riêng.
7. Redeploy rồi kiểm tra tài khoản, session, sản phẩm và đơn vẫn còn. Chỉ chuyển sang thanh toán thật sau khi bước này ổn định.

## 5. Tạo kênh payOS

1. Mở [my.payos.vn](https://my.payos.vn), đăng nhập hoặc tạo tài khoản theo hướng dẫn nhà cung cấp. Cas ID hiện có không thay thế việc kiểm tra kênh API đã sẵn sàng.
2. Hoàn tất xác minh cá nhân/doanh nghiệp và liên kết tài khoản ngân hàng theo dashboard. Đây là thao tác của chủ tài khoản; không đưa giấy tờ định danh vào repository/chat dự án.
3. Trong mục kênh thanh toán, tạo kênh cho website demo theo [hướng dẫn payOS](https://payos.vn/docs/). Lấy Client ID, API Key và Checksum Key từ kênh.
4. Thêm PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY vào Vercel, redeploy.
5. Cấu hình webhook `https://DOMAIN/api/payments/webhook` trong kênh; thay DOMAIN bằng domain thật. Kiểm tra payOS xác nhận webhook thành công.
6. Tạo một đơn demo có giá trị nhỏ phù hợp điều kiện của nhà cung cấp/ngân hàng, chọn payOS và mở link thanh toán do server tạo. Kiểm tra tên người nhận/tài khoản/số tiền; bạn tự thanh toán bằng ứng dụng ngân hàng.
7. Đối chiếu mã đơn, số tiền và trạng thái trên website, payOS, ngân hàng. Khi webhook chậm, dùng nút kiểm tra/đối soát; không coi URL quay về là bằng chứng thanh toán.
8. Admin demo giao hàng. Nếu cần hoàn tiền, bạn tự chuyển khoản hoàn rồi mới ghi số tiền và tham chiếu vào hệ thống.

Nghiệp vụ hiện giữ một tài khoản nhận tiền do bạn sở hữu, không tự chuyển doanh thu cho seller. Khoản thu thừa có đối soát/hoàn riêng; tiền về sau khi đơn hết hạn không tự khôi phục đơn. Tham khảo [điều kiện trước tích hợp và API](https://payos.vn/docs/api/).

## 6. Thiết lập email Resend

1. Tạo tài khoản ở [Resend](https://resend.com), lấy API key, lưu vào RESEND_API_KEY.
2. Nếu chỉ thử gửi đến chính email tài khoản Resend, có thể dùng sender thử nghiệm được dashboard cho phép. Domain resend.dev bị giới hạn người nhận; không coi đây là email phục vụ mọi người dùng.
3. Để gửi xác minh/khôi phục cho các email khác, cần domain bạn sở hữu hoặc được quản lý DNS. Thêm domain trong Resend, điền bản ghi DNS theo dashboard và chờ xác minh.
4. Đặt EMAIL_FROM thành địa chỉ gửi thuộc domain được chấp nhận, ví dụ `Shoppe Demo <donhang@DOMAIN-CUA-BAN>`; redeploy.
5. Thử đăng ký email mới, xác minh và quên mật khẩu. Xem `/admin/outbox` nếu thư lỗi; chỉnh cấu hình rồi dùng gửi lại.

Nếu chưa có domain, có thể kiểm chứng email đến chính chủ tài khoản trước; phần gửi cho người dùng khác vẫn còn phụ thuộc domain/xác minh. Không cần mua domain riêng cho địa chỉ website Vercel để thử COD/payOS. [Domain Resend](https://resend.com/docs/dashboard/domains/introduction), [giới hạn resend.dev](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## 7. Tự kiểm tra cấu hình tại máy

Tạo .env từ .env.example bằng trình soạn thảo, điền giá trị tại máy. Chạy từ thư mục dự án:

```powershell
npm run preflight
npm run preflight -- --production --online --email
```

Lệnh thứ hai kiểm tra cấu hình đầy đủ của bản production. Nó chỉ in tên biến và OK/MISSING/INVALID; không in giá trị khóa. Kết quả qua chỉ chứng minh định dạng và sự hiện diện; vẫn cần thử kết nối, upload, email và thanh toán thật. File .env tại máy không tự đồng bộ lên Vercel.

## 8. Bạn cần phản hồi gì sau khi chuẩn bị

Chỉ cần báo các trạng thái không nhạy cảm sau:

- Vercel đã đăng nhập; tên project và domain HTTPS đã được cấp.
- Supabase đã tạo project/bucket; các biến đã được điền tại máy hoặc Vercel.
- payOS đã xác minh/kênh sẵn sàng; đã điền ba khóa và cấu hình webhook.
- Resend đang dùng email thử nghiệm hay domain đã xác minh.

Không cần gửi giá trị khóa. Nếu gặp lỗi, gửi mã lỗi/thông báo đã che URI, token và dữ liệu ngân hàng. Sau khi cấu hình xong, bước tiếp theo là deploy, kiểm thử COD/ảnh/email và bạn tự thực hiện giao dịch thật để đối chiếu.

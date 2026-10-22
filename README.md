# Shoppe — Sàn mua sắm nhiều người bán bằng C++

Website tiếng Việt cho bài tập lớn OOP, frontend HTML/CSS/JavaScript và nghiệp vụ chạy ở backend C++20. Có giao diện khách hàng, người bán và admin; COD và adapter payOS; database PostgreSQL khi deploy, SQLite để phát triển tại máy.

## Chạy nhanh trên Windows

Máy cần Node.js 24+, CMake 3.24+, compiler C++20, OpenSSL và SQLite development libraries. Script nhận diện toolchain MSYS2 UCRT64 ở `C:\msys64\ucrt64` (có thể đổi `-MsysRoot`).

```powershell
npm ci
pwsh -File scripts/dev.ps1 -Seed
```

Mở [http://localhost:8080](http://localhost:8080). Lệnh này build frontend/backend rồi chạy server C++; dừng bằng Ctrl+C. Dữ liệu SQLite được giữ trong `.cache/shoppe.db`.

`-Seed` là lựa chọn rõ ràng để tạo dữ liệu minh họa **chỉ ở development**. Các tài khoản dùng chung mật khẩu demo `DemoShoppe123!` (hoặc `DEMO_PASSWORD` bạn đặt khi seed lần đầu):

| Tài khoản            | Dùng để                           |
| -------------------- | --------------------------------- |
| buyer@shoppe.local   | Mua hàng, địa chỉ minh họa có sẵn |
| seller@shoppe.local  | An Nhiên Store                    |
| seller2@shoppe.local | Mono Studio                       |
| admin@shoppe.local   | Quản trị toàn sàn                 |

Không bật seed trên bản public/production. Nếu database đã seed, thay biến mật khẩu không đổi mật khẩu tài khoản đã tồn tại.

## Build trên Linux

```bash
sudo apt-get update
sudo apt-get install -y build-essential cmake libssl-dev libsqlite3-dev libpq-dev
npm ci
npm run build
cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug -DSHOPPE_POSTGRES=ON
cmake --build build -j2
cp .env.example .env
# Sửa .env theo môi trường. Nếu muốn seed local, đặt SEED_DEMO=true và DEMO_PASSWORD.
npm start
```

CMake tải hai thư viện header chính thức với phiên bản và SHA-256 cố định vào `.cache/deps`. Không dùng binary build trong Git.

## Chức năng

- Khách: tìm kiếm có/không dấu tiếng Việt, lọc danh mục/giá, sắp xếp, xem sản phẩm, biến thể và trang shop.
- Tài khoản email/mật khẩu; xác minh email, khôi phục mật khẩu; cookie HttpOnly và bảo vệ CSRF.
- Hồ sơ, địa chỉ mặc định, yêu thích, giỏ nhóm theo shop, lựa chọn mặt hàng.
- Báo giá từ C++, voucher shop/toàn sàn, phí ship theo vùng/khối lượng, checkout nhiều shop, chống đặt đơn lặp.
- COD: xác nhận, chuẩn bị, vận chuyển, giao thành công/thất bại, xác nhận nhận hàng. Admin ghi thu COD riêng với trạng thái giao hàng.
- payOS: tạo link, kiểm tra chữ ký, webhook, tra cứu, hết hạn, đối soát tiền về muộn/không khớp. Không có khóa thì online bị vô hiệu hóa rõ ràng.
- Hủy đơn, trả toàn bộ/một phần mặt hàng, duyệt/nhận hàng trả, ghi hoàn tiền thủ công có giới hạn và tham chiếu.
- Người bán đăng ký mở shop, admin duyệt; CRUD sản phẩm/biến thể/tồn kho, upload ảnh Supabase, CSV xem trước/nhập/xuất, voucher, đơn và dashboard.
- Admin thêm/sửa hàng cho shop, duyệt/khóa shop, quản lý người dùng/quyền, kiểm duyệt đánh giá, cấu hình danh mục/banner/phí ship, đối soát thanh toán và audit log.
- Đánh giá sau khi nhận hàng; chat văn bản có lưu trữ, polling khi mở cuộc hội thoại; thông báo trong ứng dụng và email outbox.

Ảnh SVG và danh mục seed là dữ liệu minh họa, không phải quảng cáo hoặc hàng hóa thật.

## Cấu trúc

```text
backend/include/      Interface domain, database, application, security
backend/src/          C++ implementation và HTTP entrypoint
database/schema.sql   Schema chung; PostgreSQL dùng namespace riêng shoppe
frontend/             HTML/CSS/JavaScript, assets SVG cục bộ
scripts/              Chạy local và tạo assets minh họa
tests/                C++ domain/security và HTTP integration tests
docs/                 Kế hoạch, kiến trúc, hướng dẫn deploy
Dockerfile.vercel     Build frontend + C++, runtime phục vụ cùng origin
```

Implementation dùng **cpp-httplib** thay cho Drogon trong đề xuất ban đầu để build trực tiếp được với toolchain hiện có và giảm phụ thuộc. Tính tiền, phân quyền, kho, đơn, thanh toán và các nghiệp vụ vẫn ở C++. Mật khẩu dùng **PBKDF2-HMAC-SHA256, 600.000 vòng, salt ngẫu nhiên**, triển khai qua OpenSSL; không lưu mật khẩu thô. Các khác biệt kỹ thuật được ghi trong [kiến trúc](docs/ARCHITECTURE.md).

## Kiểm thử

```bash
npm run check
npm run build
ctest --test-dir build --output-on-failure
npm test
```

`npm test` tự khởi động server thử nghiệm trên `127.0.0.1:18081/18082`, tạo SQLite riêng trong `.cache/api-test-*`, rồi dừng server. Các khóa payOS trong fixture webhook là chuỗi kiểm thử, không gọi ngân hàng và không tạo giao dịch thật.

Để chạy cùng bộ API test trên PostgreSQL trống, build `SHOPPE_POSTGRES=ON`, rồi đặt `SHOPPE_TEST_DATABASE_URL` tới **database kiểm thử riêng**. Có thể đặt `SHOPPE_TEST_BINARY` nếu binary không nằm ở `build/shoppe`. Không dùng database thật vì suite tạo tài khoản và đơn hàng minh họa. GitHub Actions có matrix SQLite/PostgreSQL.

Nếu chạy nhiều suite trên cùng máy, đặt `SHOPPE_TEST_PORT` khác nhau (ví dụ 18081 và 18091); suite dùng cổng đó và cổng kế tiếp cho fixture webhook. Chạy lại trên PostgreSQL cần một database kiểm thử trống mới.

## Phát triển giao diện

Backend phục vụ `dist/` sau `npm run build`. Nếu dùng Vite hot reload ở cổng 5173, đặt `APP_URL=http://127.0.0.1:5173` cho tiến trình backend rồi chạy `npm run dev`; proxy `/api` đã cấu hình. Chỉ chấp nhận mutation từ origin cấu hình để chống CSRF.

## Triển khai và dịch vụ thật

Xem [hướng dẫn cấu hình Vercel, Supabase, payOS và email](docs/DEPLOYMENT.md), [kiến trúc OOP](docs/ARCHITECTURE.md), [kế hoạch phạm vi](docs/PROJECT_PLAN.md) và [kế hoạch công việc tiếp theo ngày 22/10/2026](docs/NEXT_STEPS.md).

[Báo cáo thực hiện 22/10/2026](docs/REPORT_2026-10-22.md) ghi các thay đổi, bằng chứng kiểm thử và phần còn phụ thuộc tài khoản. Nếu chưa có Supabase/payOS, làm theo [hướng dẫn thiết lập dịch vụ từng bước](docs/SETUP_SERVICES.md). Kiểm tra biến môi trường bằng `npm run preflight -- --production --online --email`; lệnh không hiển thị giá trị khóa.

[Kết quả cấu hình dịch vụ và danh mục tự động](docs/SERVICE_SETUP_2026-10-22.md) ghi trạng thái Supabase/payOS thực tế và các bước còn phải đặt trên Vercel. Admin có nút **Nạp sản phẩm demo tự động** tại `/admin/products`; hoặc đặt `DEMO_CATALOG_AUTO_IMPORT=true` để nạp một lần sau khi có admin. Nạp lại không ghi đè các sản phẩm đã tồn tại. Bộ demo chứa ảnh/tên từ DummyJSON, không cần Shopee API hoặc thêm từng sản phẩm bằng tay.

Các công cụ hỗ trợ:

```powershell
npm run services:check
npm run secrets:check
npm run env:vercel
npm run preflight -- --env-file=.env.vercel --production --online
```

`services:check` mặc định chỉ đọc; `--prepare-storage --test-upload` chỉ dùng khi chủ project cho phép tạo bucket công khai và thử ảnh. `env:vercel` tạo file riêng `.env.vercel` bị Git bỏ qua; bạn cần thêm APP_URL đúng domain Vercel. `catalog:refresh` cập nhật snapshot sản phẩm từ nguồn demo công khai khi cần; không chạy mỗi lần người dùng mở trang. Giá VNĐ dùng quy tắc minh họa cố định, không phải tỷ giá trực tiếp.

Đã kiểm thử build native và API tại máy với SQLite/PostgreSQL. **Chưa xác minh deploy Vercel/container Linux, gửi email thật, upload Supabase thật hoặc giao dịch ngân hàng thật** khi chưa có cấu hình tài khoản. Vercel CLI hiện cần đăng nhập lại. Tài khoản Cas ID cần được bổ sung kênh payOS theo hướng dẫn.

Thiết kế hướng đến quy mô demo bài tập lớn: transaction được tuần tự hóa bằng mutex SQLite hoặc PostgreSQL advisory lock để bảo toàn tồn kho/voucher trên nhiều instance. Danh sách và dashboard dùng cách đọc đơn giản phù hợp tập dữ liệu nhỏ; cần pagination/aggregation ở database, connection pool và worker chuyên dụng trước khi phục vụ tải thương mại lớn.

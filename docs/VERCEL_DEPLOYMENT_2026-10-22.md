# Triển khai Vercel — 22/10/2026

## Đích triển khai

- Team: **HNQUAN**, gói **Hobby**.
- Project: **shoppe-c**, ID `prj_dGxjGIXYCRhdJPicCTAJHqHEA4Pc`.
- Domain: **https://shoppec.vercel.app**.
- Dashboard: https://vercel.com/hnquan/shoppe-c.
- Repository: https://github.com/hoquan2007/Shoppe-C-.
- Nhánh: `codex/deployment-payment-readiness`.
- Commit mã chạy: `3548b0bff0e5fe5385e75d110ef6d93ee9fe4493`.
- Deployment Production đã xác minh: `dpl_BfeeuzDquxPfjNYGms1fcWbtM1vU`.
- Kết nối qua connector Vercel; CLI trên máy chưa đăng nhập. File `.vercel/project.json` riêng tại máy trỏ đúng project trên, không chứa token.

Tên yêu cầu ban đầu là `Shoppe_C`. API tạo project chỉ chấp nhận chữ thường. Tên `shoppe_c` được tạo thành công nhưng push image lên VCR bị `NAME_INVALID`; đã đổi tên cùng project sang `shoppe-c`. Domain do Vercel cấp trước đó vẫn giữ nguyên.

## Cấu hình

Toàn bộ frontend và backend C++ nằm trong cùng service container Vercel. Node dùng ở bước build frontend; runtime phục vụ HTTP bằng C++20. PostgreSQL và ảnh được lưu ở Supabase, không nằm trên filesystem tạm của container.

`vercel.json` chỉ rõ service `shoppe`, root `.`, runtime `container`, entrypoint `Dockerfile.vercel`; toàn bộ request được route vào service này. Build ban đầu chỉ có Dockerfile ở root đã chạy `npm run build` và xuất frontend tĩnh, dẫn đến `/api/health` 404. Không dùng trạng thái READY của bản đó để kết luận backend hoạt động.

Đã cấu hình **13 biến Production** sau khi chủ dự án cho phép đưa các key lên đúng project:

| Loại | Biến |
| --- | --- |
| Secret | `DATABASE_URL`, `SUPABASE_SERVICE_KEY`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `CRON_SECRET` |
| Config server | `APP_ENV`, `APP_URL`, `PORT`, `SEED_DEMO`, `DEMO_CATALOG_AUTO_IMPORT`, `SUPABASE_URL`, `SUPABASE_BUCKET`, `PAYOS_CLIENT_ID` |

Không có key nhạy cảm mang tiền tố `VITE_`; không đưa file `.env*` vào Git hoặc build context container. Không đưa mật khẩu admin lên Vercel vì tài khoản đã có trong Supabase. `APP_URL=https://shoppec.vercel.app`, `SEED_DEMO=false`, `PORT=8080`.

## Xác minh

Deployment Production mới đã READY và phục vụ được website thật tại **https://shoppec.vercel.app**. Toàn bộ frontend/backend chạy trên Vercel; runtime C++ kết nối Supabase qua Session pooler. Build container mất khoảng 3 phút; bộ CTest chạy trong Dockerfile có 3/3 bài qua.

Lỗi HTTP 500 của deployment cũ `dpl_CaJEtWFwAs2feBPREAQCJ7kh6yZP` đã được xử lý bằng URI Session pooler IPv4 do chủ dự án cung cấp: host `aws-0-ap-southeast-1.pooler.supabase.com`, port `5432`, user `postgres.igjwnwzhyxbpntthkapk`. Giữ `sslmode=require`, đã xác minh TLS từ client đến pooler bằng psql và truy vấn đủ 30 sản phẩm. Không suy luận TLS client từ `pg_stat_ssl` của backend vì pooler có hai chặng kết nối. Cả `.env`, `.env.vercel` riêng tại máy và Secret Production đã cập nhật; không in hoặc commit mật khẩu.

Luồng được kiểm chứng: trình duyệt tải trang chủ → API C++ → dữ liệu Supabase → danh mục và ảnh hiển thị. Script kiểm tra trên domain Production qua **10 nhóm kiểm tra**:

| Ranh giới | Kết quả thực tế |
| --- | --- |
| Runtime | `/api/health` HTTP 200, `engine=C++20`, `database=postgresql` |
| Cấu hình Production | `development=false`, payment/storage configured; `email_configured=false` |
| Catalog | API trả 30 sản phẩm; API chi tiết trả đúng ID |
| Frontend | Trang chủ, chi tiết, checkout và admin trả HTML tiếng Việt, deep link hoạt động |
| Phân quyền | Khách chưa đăng nhập gọi API admin bị HTTP 401 |
| Đăng nhập | Admin đăng nhập thành công; cookie có Secure, HttpOnly, SameSite=Lax |
| Phiên PostgreSQL | Request tiếp theo nhận đúng quyền admin và đọc được shop |
| CSRF | Mutation thiếu CSRF token bị HTTP 403 |
| Đăng xuất | Phiên bị vô hiệu hóa; đã dọn phiên thử |
| Trình duyệt | Trang chủ hiển thị 6 danh mục và 12 sản phẩm gợi ý, ảnh tải được; không có lỗi console trong lần kiểm tra |

Bằng chứng tại máy (bị Git bỏ qua): `artifacts/vercel-verification-20261022.json`, `artifacts/vercel-home-20261022.png`, `artifacts/vercel-catalog-20261022.png`. Chưa tạo đơn, gọi tạo link payOS hoặc chuyển tiền trong đợt kiểm tra này.

## Việc chủ dự án cần chuẩn bị

1. Mật khẩu admin riêng có trong file `.env.admin.local` tại máy. Không gửi file này lên GitHub hoặc chat. Đăng nhập qua `/login`, quản trị tại `/admin`, quản lý shop tại `/seller`.
2. Đăng ký webhook payOS `https://shoppec.vercel.app/api/payments/webhook` trong kênh thanh toán, rồi đối soát một giao dịch thật do bạn tự thực hiện. Việc cấu hình key hoặc health không xác minh tiền đã về ngân hàng.
3. Bổ sung `RESEND_API_KEY` và `EMAIL_FROM` với sender/domain đã xác minh nếu cần gửi email xác minh và khôi phục mật khẩu thật. Thêm biến cần deploy lại.
4. Nhánh `main` hiện chỉ có README. Bản Production đã được tạo tường minh từ nhánh tính năng; push nhánh tính năng có thể tạo Preview tự động, nhưng khóa Production chỉ cấp cho Production. Không chuyển deploy sang main khi chưa hợp nhất mã phù hợp.
5. Dữ liệu là 30 sản phẩm demo tự động, không phải nguồn hàng thật hay dữ liệu Shopee được ủy quyền. Không dùng đơn demo để cam kết giao hàng thực tế.

## Giới hạn còn lại

- Chưa thực hiện chuyển tiền, hoàn tiền hoặc xác nhận thanh toán ngân hàng thật trong lần triển khai này.
- Chưa gửi email thật.
- Container Runtime còn Beta; quy trình đánh giá dựa vào API và giao diện thực tế, không chỉ trạng thái deployment.

Tài liệu: [Container Runtime](https://vercel.com/docs/functions/runtimes/container), [Vercel Services](https://vercel.com/docs/services), [Environment Variables](https://vercel.com/docs/environment-variables).

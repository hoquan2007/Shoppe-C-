# Triển khai Vercel — 22/10/2026

## Đích triển khai

- Team: **HNQUAN**, gói **Hobby**.
- Project: **shoppe-c**, ID `prj_dGxjGIXYCRhdJPicCTAJHqHEA4Pc`.
- Domain: **https://shoppec.vercel.app**.
- Dashboard: https://vercel.com/hnquan/shoppe-c.
- Repository: https://github.com/hoquan2007/Shoppe-C-.
- Nhánh: `codex/deployment-payment-readiness`.
- Commit mã chạy: `7310eeac754a35025a03bd806112085fdcfb8e07`.
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

Deployment container `dpl_CaJEtWFwAs2feBPREAQCJ7kh6yZP` đã READY, đẩy image lên VCR thành công sau khi đổi tên project. Build mất khoảng 3 phút và bộ CTest có 3/3 bài qua.

Kiểm tra runtime gặp lỗi HTTP 500 ngay tại `/api/health`. Runtime log ghi `Startup failed: Cannot connect to PostgreSQL; check DATABASE_URL/TLS.`; backend chưa phục vụ request nên chưa tiếp tục kiểm tra đăng nhập hoặc thanh toán. Supabase project đang ACTIVE_HEALTHY, ở Singapore; cần thay URI direct IPv6 bằng Session pooler IPv4 chính xác lấy từ Connect. Đã yêu cầu chủ dự án cung cấp Host/Port/User, không yêu cầu gửi lại mật khẩu. Không coi trạng thái READY là ứng dụng hoạt động đầy đủ.

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

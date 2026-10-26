# Phương án thử backend luôn chạy — chưa triển khai

Đây là phương án dự phòng nếu phép đo sau sửa logger vẫn không đạt mục tiêu. Chưa tạo dịch vụ, nhập credential hoặc đổi routing sang nhà cung cấp mới.

## Phạm vi đề xuất

| Thành phần | Cấu hình để duyệt |
|---|---|
| Frontend/domain | Giữ `https://shoppec.vercel.app` trên Vercel |
| Backend thử | Một Render Docker Web Service, tên đề xuất `shoppec-api-always-on`, region Singapore |
| Compute | `0.5c-512mb`, 0,5 CPU / 512 MB, **7 USD/tháng compute** theo nguồn Render tháng 9/2026; chưa gồm usage, thuế hoặc workspace trả phí nếu được chọn |
| Source | Commit `c7eca88733c62db4576ee6914619e14129cdc272`, `Dockerfile.vercel`, manual deploy |
| Database | Giữ Supabase hiện có; không tạo thêm database trả phí hoặc di chuyển dữ liệu |
| Pilot ban đầu | SQLite giả tại `/tmp`, APP_ENV=test, tắt payment/email/Google/storage; chưa nhận traffic người dùng thật |

Render xác nhận compute trả phí không tự ngủ trong [FAQ](https://render.com/docs/faq). Mức 7 USD/tháng được nêu trong [hướng dẫn chi phí Render](https://render.com/articles/production-rails-hosting-guide) và [so sánh Render/Vercel](https://render.com/articles/render-vs-vercel); kiểm tra lại giá trên màn xác nhận trước khi tạo tài nguyên. Free service không phù hợp vì vẫn tự ngủ. Region phải được kiểm tra khi tạo theo [Regions](https://render.com/docs/regions).

## Điều kiện trước khi chuyển traffic

1. Người dùng duyệt chi phí dịch vụ mới và cung cấp kết nối tài khoản Render qua luồng bảo mật; không gửi API key/secret trong chat.
2. Chạy bộ benchmark cùng runner qua URL backend trực tiếp và qua rewrite Vercel để tách độ trễ của hai đường. Mỗi endpoint ít nhất 100 mẫu ở concurrency 1 và 10; thêm idle/restart/recovery.
3. Sau pilot giả, chỉ cấu hình runtime Production khi được phép chuyển các secret backend cần thiết sang Render: DATABASE_URL, các khóa payOS và Supabase storage đang dùng, và secret email/cron nếu có. Dùng secret settings/API, không ghi giá trị vào repository hoặc báo cáo.
4. APP_ENV=production, APP_URL=https://shoppec.vercel.app, SEED_DEMO=false, DEMO_CATALOG_AUTO_IMPORT=false; kiểm tra TLS tới database và ngân sách tối đa bốn connection/instance. Không đổi webhook URL hoặc yêu cầu liên kết Google thật để thử.
5. Xác minh auth/CSRF, cookie cùng domain, bảo vệ origin, đường callback, stock/voucher/idempotency và outbox bằng fixture; các phép đọc Production dùng phiên tạm rồi revoke. Không tạo đơn hoặc thanh toán thật để benchmark.

Mục tiêu pilot: warm API cart/quote/editor p95 ≤500 ms, không có cold do idle; đo lại sau idle 10 phút. Kiểm tra RSS/CPU trên instance 512 MB trước khi chốt. Chỉ chuyển API khi cả chức năng và ngân sách đạt; việc dùng host khác không tự bảo đảm hết jitter.

## Thay đổi routing để review

Trong `vercel.json`, chỉ thay đích rewrite `/api/(.*)` từ service container `shoppe` sang `https://<hostname-Render-được-xác-minh>/api/$1`. Frontend giữ service Vite hiện có. Hostname phải lấy từ kết quả tạo service, không dùng một URL đoán trước. Sau khi xác minh, bỏ service container Vercel khỏi cấu hình frontend để tránh duy trì hai backend ngoài ý muốn.

Rollback: phục hồi `vercel.json`/deployment Production đã kiểm chứng trước khi chuyển, đọc lại alias và asset, rồi dừng service pilot nếu không đạt. Không đổi schema hoặc chuyển database trong pilot, nên không có thao tác đảo migration dữ liệu.

Phương án này cần phê duyệt riêng vì phát sinh phí định kỳ và đưa credential runtime sang một nhà cung cấp mới. Đó là giới hạn chi phí/quyền truy cập, không phải yêu cầu phê duyệt thêm cho các sửa code đã hoàn tất.

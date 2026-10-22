# Kế hoạch giai đoạn tiếp theo — 22/10/2026

> Kế hoạch này được lập trước khi hoàn tất deploy. Trạng thái mới nhất: [audit](AUDIT_2026-10-22.md); thứ tự ưu tiên và điều kiện nghiệm thu sau audit: [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md).

## 1. Định hướng

Đưa bản hiện có thành bản demo chạy trên Vercel, có thanh toán thật và có thể tái tạo khi chấm bài. Ưu tiên độ đúng của tiền, tồn kho, phân quyền và khả năng triển khai. Giữ nghiệp vụ chính ở C++20; frontend HTML/CSS/JavaScript; PostgreSQL và kho ảnh ở dịch vụ bên ngoài theo phạm vi đã thống nhất.

Đây là kế hoạch dựa trên việc đọc mã nguồn và tài liệu ngày 22/10. Chưa chạy lại bộ kiểm thử hoặc đăng nhập lại dịch vụ trong lượt lập kế hoạch này. Các kết quả kiểm thử bên dưới là bằng chứng ngày 17/10, không phải kết quả mới.

## 2. Trạng thái có bằng chứng

| Hạng mục | Hiện trạng | Việc còn lại |
| --- | --- | --- |
| Nghiệp vụ | Đã có mua hàng nhiều shop, COD, shop riêng, seller/admin, kho, voucher, trả hàng/hoàn tiền, đánh giá, chat, CSV | Đối chiếu từng yêu cầu với luồng hoàn chỉnh trên bản deploy |
| C++ và database | Báo cáo 17/10: build native, CTest; 13/13 kịch bản API qua riêng trên SQLite và PostgreSQL cục bộ | Chạy lại trên Linux và đúng phiên bản sẽ bàn giao |
| Giao diện | Có storefront và các khu vực buyer/seller/admin; đã kiểm tra một số luồng desktop và trang chủ mobile | Kiểm tra mobile cho chi tiết, giỏ, checkout, đơn, seller/admin và trạng thái lỗi |
| Git/CI | Repository mới có initial commit; phần lớn mã nguồn đang untracked; workflow CI đã viết | Chốt mã nguồn vào Git, chạy workflow thật trên GitHub và lưu kết quả |
| Vercel | Có Dockerfile.vercel và cấu hình cron | Build Linux/container, deploy thật, kiểm tra cold start và dữ liệu sau redeploy |
| Dịch vụ thật | Có adapter PostgreSQL/Storage/payOS/Resend | Cấu hình và xác minh trên tài khoản chủ dự án; chưa có bằng chứng giao dịch ngân hàng thật |

## 3. Phương án kỹ thuật

**Phương án chính:** dùng Dockerfile.vercel hiện có. Server C++ phục vụ frontend và API cùng origin trên Vercel; Supabase cung cấp PostgreSQL và Storage; payOS xử lý thanh toán; Resend gửi email. SQLite chỉ dùng để phát triển và kiểm thử cục bộ.

Tài liệu [Container Runtime](https://vercel.com/docs/functions/runtimes/container) được đối chiếu ngày 22/10/2026 ghi runtime đang Beta trên mọi gói, tự nhận Dockerfile.vercel và dùng giới hạn Vercel Functions. Cần xác minh trực tiếp bằng deployment trên tài khoản Hobby. Container có thể bị dừng khi không có traffic; không dựa vào RAM, filesystem cục bộ hoặc thread sống mãi để giữ dữ liệu hay xử lý đơn.

**Nếu deployment thất bại:** phân biệt lỗi build, cổng, biến môi trường, database và quyền runtime; sửa theo lỗi thực tế và thử lại. Nếu vướng giới hạn nền tảng không thể khắc phục, làm một bản thử nhỏ C++ biên dịch WebAssembly chạy phía server trong Vercel Function. [Vercel có hỗ trợ Wasm](https://vercel.com/docs/functions/runtimes/wasm), nhưng đây không phải thay thế trực tiếp cho server hiện tại: phải thiết kế lại adapter HTTP/database và đánh giá công sức trước khi chọn. Không tự đổi yêu cầu hosting hoặc chuyển nghiệp vụ sang JavaScript.

Chỉ xem xét backend ở nền tảng khác hoặc gói trả phí khi chủ dự án chủ động thay đổi ràng buộc. Không đưa các phương án đó vào đường triển khai mặc định.

## 4. Thứ tự thực hiện và điều kiện nghiệm thu

| Mốc | Công việc cụ thể | Điều kiện hoàn thành |
| --- | --- | --- |
| M1 — Chốt phiên bản | Rà soát file đưa vào Git; loại khóa, cache, binary và dữ liệu cục bộ; commit mã nguồn; chạy build/frontend check/CTest/API trên Linux, SQLite và PostgreSQL; audit dependency tại thời điểm chạy | Clone sạch có thể build và test; CI thật thành công, gắn với commit cụ thể |
| M2 — Chứng minh deploy | Kiểm tra Docker build; deploy lên Vercel Hobby; kết nối PostgreSQL thử nghiệm; cấu hình origin HTTPS, cookie, biến môi trường và bootstrap admin; kiểm tra route SPA/API, log, cold start | URL HTTPS hoạt động; health xác nhận C++20/PostgreSQL; session và dữ liệu còn sau redeploy; seed demo tắt |
| M3 — Làm bền dữ liệu | Thêm migration có phiên bản trước lần thay đổi schema tiếp theo; tách dữ liệu test/live; thử backup và restore; xác minh bucket và upload ảnh theo quyền seller | Nâng schema không mất dữ liệu; phục hồi được bản thử; seller không ghi ảnh ngoài quyền được cấp |
| M4 — Chốt logic thanh toán | Kiểm thử và sửa các trường hợp đối soát ở mục 5; tích hợp kênh payOS thật; kiểm tra webhook truy cập công khai, chữ ký, link hết hạn, trang kết quả | Một giao dịch thật khớp website/payOS/ngân hàng; retry không tạo đơn hoặc ghi nhận tiền trùng; tiền muộn/tiền thừa xử lý rõ ràng |
| M5 — Hoàn thiện trải nghiệm | Kiểm tra các luồng buyer/seller/admin trên desktop và mobile; lỗi mạng, loading, rỗng, hết hàng, hết phiên; email xác minh/khôi phục/đơn hàng qua Resend; vận hành outbox và cron | Các kịch bản ở mục 6 qua trên bản deploy; không có nút dẫn đến luồng chưa hoàn thiện; không tràn ngang hoặc che nút thao tác |
| M6 — Đóng bản demo | Chuẩn bị dữ liệu minh họa, kịch bản ba vai trò, log kiểm thử đã che dữ liệu nhạy cảm; gắn phiên bản; cập nhật README/VALIDATION/DEPLOYMENT và ghi giới hạn | Có thể demo lại từ đầu, biết cách phục hồi và có bằng chứng cho từng tiêu chí bắt buộc |

M2 phải được chứng minh sớm. M3 và kiểm thử logic M4 có thể chuẩn bị trong lúc chờ xác minh tài khoản. Chỉ kết luận thanh toán thật sau khi hoàn thành giao dịch thật và đối chiếu kết quả.

## 5. Các điểm cần xử lý trước giao dịch thật

1. **Sổ giao dịch thanh toán:** recordPayment hiện bỏ qua cập nhật tổng tiền khi checkout đã paid. Phải phân biệt sự kiện gửi lại với khoản chuyển tiền mới có reference khác. Khoản thu bổ sung cần được ghi nhận và đưa vào đối soát mà không làm đơn xử lý hai lần.
2. **Webhook và sync:** hai đường đang dùng khóa sự kiện khác nhau; sync dùng amountPaid tổng hợp. Cần kiểm thử webhook trước/sau sync, đặc biệt khi checkout ở review, để cùng một khoản thu không bị cộng hai lần. Thiết kế rõ số tiền đã thu theo giao dịch và số tiền tổng hợp do provider trả về.
3. **Khôi phục sau timeout/hết hạn:** kiểm tra lỗi lúc tạo link, retry cùng mã đơn, tiền về sau khi hoàn tồn, hủy một đơn con trong checkout nhiều shop và hoàn tiền một phần. Không dùng URL quay về làm bằng chứng đã trả tiền.
4. **Vận hành database:** hiện mở kết nối theo transaction và dùng cùng advisory lock cho mọi transaction PostgreSQL. Giữ cơ chế bảo vệ tính đúng trong giai đoạn demo, đo với tải demo dự kiến và chat polling; chỉ thay bằng khóa hẹp hơn sau khi có test tranh chấp tương đương. Không hứa khả năng chịu tải sàn thương mại thật.
5. **Khởi động và dữ liệu:** schema hiện khởi tạo khi server bật. Kiểm tra nhiều instance khởi động cùng lúc, TLS/pooler, backup/restore và graceful shutdown; không xóa database để cập nhật schema.

Các mục trên là ưu tiên rà soát từ mã nguồn; phải có kiểm thử tái hiện trước khi kết luận lỗi và sửa. Chưa thay đổi logic ứng dụng trong lượt lập kế hoạch này.

Sau khi bản deploy ổn định, tách dần application.cpp thành các service auth/catalog/checkout/payment/admin và frontend app.js thành các module theo trang. Mỗi bước giữ nguyên hành vi và chạy lại test liên quan; tránh tái cấu trúc toàn bộ sát buổi demo. Đối chiếu lại phần OOP đã có (Strategy, State, RAII, Money, Rule of Five) với tiêu chí môn học khi đóng phiên bản.

## 6. Bộ kịch bản nghiệm thu bắt buộc

- Người dùng đăng ký → đăng ký shop → admin duyệt → seller đăng sản phẩm/biến thể/ảnh → buyer tìm thấy sản phẩm.
- Buyer đặt giỏ hai shop với voucher/phí ship → hai đơn con có tổng chính xác → admin/seller cập nhật trạng thái đúng quyền.
- COD: giao hàng và ghi thu tiền độc lập; hủy hợp lệ khôi phục kho đúng một lần.
- Online: tạo link → người dùng tự thanh toán → server xác minh → trang kết quả cập nhật; reload/retry/webhook trùng không nhân đôi tác động.
- Hai buyer mua tồn cuối; chỉ một checkout thành công. Seller A không đọc/sửa tài nguyên riêng của seller B.
- Trả một phần → duyệt/nhận hàng → admin hoàn tiền ngoài hệ thống → ghi tham chiếu; số tiền không vượt phần được hoàn.
- Xác minh email, khôi phục mật khẩu, chat đúng người, CSV xem trước/nhập/xuất, ảnh tải lên và dashboard khớp dữ liệu.
- Kiểm tra trang chủ/chi tiết/cart/checkout/kết quả/đơn/seller/admin ở khoảng 390px và desktop; thêm một lượt trên điện thoại thực tế.
- Redeploy không mất đơn/session; outbox lỗi có thể thử lại; log không lộ khóa/token/mật khẩu.

## 7. Phần chủ dự án cần chuẩn bị

| Dịch vụ | Chuẩn bị | Xác minh tại mốc |
| --- | --- | --- |
| GitHub/Vercel | Quyền repo, đăng nhập Vercel đang hoạt động, project Hobby | M1–M2 |
| Supabase | Project Free, URI PostgreSQL có TLS, bucket ảnh và khóa server | M2–M3 |
| payOS | Tài khoản/kênh thanh toán đã hoàn tất điều kiện của nhà cung cấp, ngân hàng nhận tiền do bạn sở hữu, Client ID/API Key/Checksum Key | M4 |
| Resend | API key và địa chỉ gửi được xác minh/chấp nhận | M5 |

Chỉ có Cas ID chưa chứng minh kênh API thanh toán đã sẵn sàng. Chủ tài khoản hoàn tất đăng nhập/xác minh/liên kết ngân hàng; cấu hình khóa trong môi trường local/Vercel, không gửi khóa vào chat hoặc commit vào Git. Người dùng tự thực hiện chuyển khoản demo; hoàn tiền vẫn do admin thực hiện thủ công rồi ghi nhận.

[Cron Hobby](https://vercel.com/docs/cron-jobs/usage-and-pricing) chỉ chạy tối đa hằng ngày và không bảo đảm đúng phút. Giữ kiểm tra hết hạn khi xử lý API; xác minh outbox có retry phù hợp. Ghi nhận hạn mức và trạng thái project Free trước buổi demo; kiểm tra lại điều kiện dịch vụ khi cấu hình tài khoản.

## 8. Dự kiến thời lượng và bàn giao

Ước lượng để sắp xếp công việc sau khi các tài khoản sẵn sàng: M1 khoảng 1 ngày, M2 khoảng 1–2 ngày, M3 khoảng 1 ngày, M4 khoảng 1–2 ngày, M5 khoảng 2 ngày, M6 khoảng 1 ngày. Tổng khoảng 7–9 ngày làm việc; phụ thuộc lỗi deploy và thời gian duyệt tài khoản. Đây là ước lượng, không phải cam kết lịch hoàn thành.

Mỗi mốc lưu bằng chứng: commit, log CI/deploy, ca kiểm thử, ảnh giao diện và các giới hạn chưa kiểm chứng. Báo cáo, slide và phần nộp học thuật là giai đoạn sau theo yêu cầu ưu tiên phần mềm; trong quá trình này giữ lại sơ đồ và bằng chứng để dùng lại.

**Công việc đầu tiên khi bắt đầu thực hiện:** chốt baseline Git/CI và build Linux/container, đồng thời hoàn tất đăng nhập Vercel và chuẩn bị Supabase. Qua mốc deploy mới chốt lịch demo thanh toán thật.

## Tài liệu liên quan

- [Kế hoạch phạm vi ban đầu](PROJECT_PLAN.md)
- [Kiến trúc thực tế](ARCHITECTURE.md)
- [Hướng dẫn triển khai và biến môi trường](DEPLOYMENT.md)
- [Bằng chứng kiểm thử 17/10](VALIDATION.md)
- [payOS — bắt đầu](https://payos.vn/docs/)
- [Supabase — các gói dịch vụ](https://supabase.com/docs/guides/platform/billing-on-supabase)

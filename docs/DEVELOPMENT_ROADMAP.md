# Kế hoạch phát triển Shoppe sau audit 22/10/2026

Đã sửa hai ca biên moderation/method và triển khai tối ưu C++: pool libpq, read-only transaction, batch dashboard/đơn/export, vùng Singapore. Hiện 15/15 nhóm API trên mỗi adapter và 6/6 lỗi biên đều qua. Xem [kết quả sửa/đo](PERFORMANCE_FIX_2026-10-22.md), [chuẩn bị key và Shopee](KEYS_AND_SHOPEE_GUIDE.md), [API hiện có](API_CURRENT.md). Giữ C++ cho nghiệp vụ server, HTML/CSS/JS cho giao diện, frontend/backend trên Vercel; Supabase làm database/storage. Payment/email thật vẫn cần nghiệm thu.

**Ưu tiên tiếp theo:** nghiệm thu payOS/webhook và email ở giai đoạn 3 → hoàn thiện phân trang/SQL/index và UI/E2E → hồ sơ bài tập. API Shopee chỉ triển khai sau khi đủ quyền và chọn mô hình dữ liệu phù hợp. Các giai đoạn dưới đây giữ các đầu việc còn lại; không phải mọi mục trong giai đoạn 1–2 còn chưa làm.

## Giai đoạn 1 — Sửa lỗi kiểm duyệt và chốt contract (P1, khoảng 1–2 ngày công)

1. Giữ hidden/pending khi buyer sửa review đã bị ẩn; admin quyết định gỡ ẩn. Thêm regression public visibility và rating aggregation.
2. Khai báo method/path rõ ràng, chuẩn 401/403/404/405/409/422; không chấp nhận POST cart như GET. Thêm matrix method cho 77 operation dự kiến.
3. Đưa 6 probe biên vừa chạy thành regression test ổn định, thêm token hết hạn/sai purpose và quyền của user bị khóa.

**Nghiệm thu:** hai ca lỗi audit chuyển thành pass; 14 kịch bản cũ trên mỗi adapter vẫn qua; không sửa quyền/flow ngoài phạm vi; code review và CI trên đúng commit trước khi deploy.

## Giai đoạn 2 — Hiệu năng và tính đồng thời (P1, khoảng 3–5 ngày công)

1. Đặt container/function runtime gần database Singapore bằng cấu hình service được Vercel chấp nhận, xác minh region trong deployment/runtime logs. Chỉ đổi region sau kiểm tra hỗ trợ gói hiện tại; không mua add-on để chữa lỗi mạng khi pooler đã dùng được.
2. Đo baseline cùng dữ liệu, endpoint, client và trạng thái warm/cold; thêm timing request/query không chứa thông tin bí mật.
3. Batch dashboard/orderView/export; phân trang catalog/đơn/users/chat/audit; đẩy filter/sort xuống SQL thay vì tải toàn bộ rồi lọc.
4. Tái sử dụng libpq connection có giới hạn, xử lý reconnect; thay khóa advisory toàn cục bằng cơ chế khóa/atomic update hẹp hơn, giữ unique/idempotency và transaction.
5. Migration index theo query thực, ưu tiên 17 FK advisory; EXPLAIN trên dữ liệu thử có kích thước phù hợp; không xóa index chỉ vì project mới ít traffic.

**Nghiệm thu:** mục tiêu thử nghiệm warm catalog median <1 giây và dashboard median <2 giây ở điều kiện tương đương baseline; đây là mục tiêu, chưa phải SLA. Kiểm thử nhiều request/2 instance tranh chấp hàng cuối, voucher cuối, callback trùng, cancel/paid race và refund đồng thời; stock không âm, không thu/hoàn trùng. Báo cáo cold start riêng và kiểm tra lại 28 test Local.

## Giai đoạn 3 — Nghiệm thu dịch vụ thật (P0 trước demo thanh toán, khoảng 1–3 ngày công, phụ thuộc tài khoản)

1. Chủ dự án xác nhận ngân hàng, đăng ký webhook payOS trên domain public và thống nhất số tiền demo. Tạo link với đơn do người dùng đồng ý; kiểm chứng chữ ký response.
2. Người dùng tự thực hiện chuyển tiền. Kiểm tra webhook/sync cùng giao dịch chỉ cộng một lần, code/số tiền/reference khớp payOS và ngân hàng; refresh/replay không nhân đôi.
3. Diễn tập pending/cancel/expire, callback muộn/thu thừa và hoàn thủ công với bằng chứng đối soát. Không dùng trang returnUrl để xác nhận đã paid.
4. Cấu hình Resend sender/domain; test nhận verify/reset thật, replay/expired/revoke session; outbox retry/idempotency không gửi trùng.
5. Xác minh cron có quyền và quan sát lịch chạy mà không làm thay đổi đơn thực ngoài kịch bản đã thống nhất.

**Nghiệm thu:** có biên bản một giao dịch thật và một email nhận thật; secret chỉ ở server, không hiển thị bank/API key/token; rollback/reconciliation được ghi lại. Nếu webhook hoặc email chưa nghiệm thu, demo phải ghi rõ giới hạn.

## Giai đoạn 4 — Độ tin cậy và bảo mật vận hành (P1/P2, khoảng 2–4 ngày công)

1. Rà soát function event trigger SECURITY DEFINER và grant thừa, giữ đúng hoạt động trigger; kiểm tra lại advisors. Tạo role database cho app với quyền tối thiểu, tách quyền migration nếu quy trình cho phép.
2. Chuẩn hóa cấu hình dev/preview/production; Preview không nhận secret/data Production; tạo database fixture riêng cho CI/E2E. Hợp nhất nhánh phù hợp trước khi đổi production branch khỏi nhánh tính năng.
3. Đặt lỗi/log với request ID, không lộ email/token/URI; theo dõi 5xx/timeout, outbox failed, payment review và quota; không coi không có log một lần là monitoring đầy đủ.
4. Backup/restore vào database riêng và diễn tập rollback/redeploy/migration failure; không restore đè Production để thử.
5. Thêm build Linux/container/ASan/UBSan vào kiểm thử phù hợp; audit dependency C++/OS và kiểm tra input size, token expiry, proxy IP/rate limit.

**Nghiệm thu:** khôi phục snapshot test có số lượng/hash dữ liệu khớp, deployment vẫn dùng đúng migration; báo cáo security/advisor được phân loại, test session revocation và cross-shop truy cập trái phép vẫn qua.

## Giai đoạn 5 — UI/E2E và hồ sơ bài tập (P2, khoảng 2–4 ngày công)

1. E2E lấp đầy giỏ nhiều shop → voucher → quote → COD → kết quả → admin/seller xử lý → buyer nhận → review/return/refund, trên môi trường fixture riêng.
2. Mobile: cart có nhiều dòng, checkout có địa chỉ/voucher, modal sản phẩm/CSV, bảng admin, chat, trang lỗi và trạng thái loading; test ít nhất 390px và một kích thước tablet. Mở Chrome/Edge và điện thoại vật lý nếu có.
3. Cải thiện loading/error/empty, bàn phím/focus/label, ảnh lỗi; sửa nhiều h1 trang shop khi làm accessibility; không thay toàn bộ phong cách chỉ vì audit.
4. Sinh OpenAPI với schema/examples/error và đối chiếu tự động route contract. Tạo hướng dẫn dev/deploy, use case, class diagram, ERD, OOP (State/Strategy, copy/move, ownership), script demo, dữ liệu mẫu và ảnh kết quả kiểm thử.

**Nghiệm thu:** E2E buyer/seller/admin tự chạy và kiểm tra dữ liệu sau refresh/restart, không tràn ngang ở các trạng thái chính; tài liệu API không drift; bộ tài liệu nộp bám rubric chủ dự án cung cấp.

## Giai đoạn 6 — Mở rộng theo nhu cầu (P3, chỉ làm sau ổn định)

| Hướng phát triển           | Phụ thuộc                                                 | Giá trị / điều kiện                                                                                |
| -------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| API Shopee hợp lệ          | Có shop/app Open Platform hoặc Affiliate và quyền phù hợp | Đồng bộ theo phạm vi được cấp, không scrape API nội bộ hoặc coi ảnh/demo là kho thật               |
| Đơn vị vận chuyển          | Tài khoản/ủy quyền provider và sandbox                    | Báo phí, tạo vận đơn, tracking/webhook, retry/idempotency; thay luồng admin demo khi đã nghiệm thu |
| Nhiều lần trả / appeal     | Chốt chính sách, mô hình cumulative quantity/refund       | Bỏ giới hạn một return/đơn bằng thiết kế có sổ lũy kế; không đơn giản xóa unique constraint        |
| Tài chính marketplace      | Phí sàn, commission, đối soát seller, quy tắc payout      | Đây là nghiệp vụ mới; hiện chỉ một tài khoản nhận tiền và hoàn thủ công theo yêu cầu ban đầu       |
| Catalog nâng cao           | Sản phẩm thật, truy vấn/phân trang ổn định                | Thuộc tính đa dạng, nhiều ảnh, tìm kiếm, gợi ý, chiến dịch giảm giá                                |
| Chat/notification nâng cao | Nhu cầu thực và quota                                     | Pagination trước, rồi attachment/realtime/push; đo tải và chi phí trước khi chọn dịch vụ           |

Các khoảng ngày là ước lượng khối lượng cho một người phát triển khi tài khoản/dữ liệu đã sẵn sàng, không phải cam kết deadline. Có thể làm nghiệm thu dịch vụ song song với giai đoạn sửa/đo trên fixture, nhưng không dùng thanh toán thật để thay cho test tự động. Không cần triển khai tất cả tính năng P3 để hoàn thành bài tập lớn.

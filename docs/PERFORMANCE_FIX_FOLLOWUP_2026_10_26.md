# Sửa các vấn đề sau kiểm tra Production — 26/10/2026

Tiếp nối [báo cáo Production trước](PRODUCTION_PERFORMANCE_REVIEW_2026_10_26.md). Triển khai theo yêu cầu sửa tiếp của người dùng, giữ C++20, Vite, PostgreSQL, dữ liệu catalog và cấu hình dịch vụ hiện có.

## Thay đổi

- **Form đăng nhập không chờ auth/metadata.** Dựng form trước, tải lựa chọn Google độc lập. Các route private chỉ chờ phiên; checkout và editor chờ cấu hình khi thực sự cần. Metadata đã có được dùng ngay khi refresh nền; lỗi refresh không trở thành unhandled rejection hoặc chặn route độc lập.
- **Gộp dữ liệu màn hình.** Catalog `include=meta` trả sản phẩm và metadata cùng snapshot; trang shop có thêm thông tin shop công khai đã được kiểm tra approved. Không có chuỗi shop → catalog/metadata. Admin products `include=editor` trả thêm trạng thái catalog và danh sách shop approved tối thiểu id/name, thay ba request bằng một. Endpoint cũ tiếp tục hoạt động.
- **Header giữ DOM.** Chỉ dựng lại phần phụ thuộc tài khoản khi identity thay đổi. Đổi route chỉ đồng bộ trạng thái nav/search, giữ input khi chỉ refresh badge/session. Search, link danh mục và Back/Forward khớp URL.
- **Phản hồi tương tác trước thay view.** Cho browser một lượt vẽ feedback trước khi parse/thay nội dung route từ cache; có giới hạn chờ, kiểm tra phiên bản route và không đợi animation frame khi tab ẩn.
- **Google SDK một lần/document.** Controller dùng chung promise init khi mount đồng thời, callback thuộc mount hiện tại; detach khi đổi route. Nonce gắn với user/CSRF context, single-use và hết hạn trước server 60s. Không reuse khi đổi account/session. Account chỉ bắt đầu liên kết Google khi người dùng chọn; khi cần nonce/context mới thì dùng document mới, không initialize chồng lên SDK cũ. Sau đăng nhập Google thành công chuyển sang document mới. Không bỏ CSRF, cookie nonce hoặc kiểm tra nonce backend.
- **Đo INP có nguyên nhân.** Chỉ khi `?debug-perf=1`, tải riêng Web Vitals attribution (~3,55 KB gzip), log input delay, processing duration, presentation delay, long frames, request và route duration. Không log nội dung input, token, query string hoặc gửi telemetry ra ngoài. Bản thường không tải attribution chunk.
- **Backend quan sát instance rõ ràng.** Startup/request có cùng instance ID, tuổi instance và số request; response có `X-App-Instance`/`X-App-Age-Ms`. Chỉ số trên response public HIT thuộc lần origin tạo cache, không được coi là instance đang phục vụ lúc HIT.
- **TCP_NODELAY cho API upstream.** Tránh Nagle giữ các lần ghi header/body nhỏ; giữ nguyên pool và giới hạn keep-alive đã có test chống cạn worker. Hiệu quả phần chờ Vercel phải đo sau phát hành, không suy ra từ tốc độ local.
- **Sửa race giỏ → checkout vừa tái hiện trên Production.** Nếu bấm tăng liên tiếp rồi chuyển ngay sang checkout, GET cart có thể đọc lượt lưu trung gian: UI đã hiện 4 nhưng báo giá lấy 2. Checkout nay chờ toàn bộ lượt ghi giỏ mới nhất hoàn tất trước khi đọc cart/tính quote. Nếu người dùng tiếp tục sửa trong lúc GET đang bay, kiểm tra revision và đọc lại sau khi lưu; nếu lưu lỗi thì dừng checkout, nếu rời route thì bỏ luồng cũ. Có test điều khiển hai lượt ghi đang bay và lượt đọc cũ để chứng minh không quote số lượng trung gian.

## Kiểm chứng trước phát hành

- Build/syntax root và đúng frontend service: qua. Bundle cuối 107,67 KB / 34,55 KB gzip; chunk attribution riêng 8,54 KB / 3,55 KB gzip, chỉ tải debug. Không tuyên bố giảm kích thước bundle.
- CTest SQLite: **7/7 qua**.
- API/frontend bản cuối: **36/36 qua** trên SQLite và **36/36 qua** trên PostgreSQL local trong database mới, gồm 3 test race checkout. PostgreSQL fixture đã dừng sau test.
- PostgreSQL performance unit tests và pool/reuse/read-only/concurrency: qua; không chạy integration test trên Supabase Production.
- Test mới kiểm tra GSI init đồng thời, callback hiện tại, đổi context, nonce single-use/hết hạn và retry challenge trước init. C++ test thêm response gộp và giới hạn dữ liệu shop.
- Browser local qua proxy auth/metadata chậm 2.500 ms: form login dựng **1,5 ms**, LCP **196 ms**, hai API hoàn tất sau ~2.517 ms; form vẫn có sẵn để nhập.
- Browser local search `tai` → danh mục: input thành chuỗi trống; Back → `tai`; 12 card đúng. Không có error/warning. Mẫu INP local 8 ms, trong đó xử lý sự kiện ~0,4 ms; chỉ là local, không thay số đo Production.
- Check secret và diff whitespace: qua.

## Bản phát hành

Bản cuối **READY**: Production `dpl_9VQ6DibYMHefdCNGtSnzFLY1wshP` (`https://shoppe-jeilqzb6k-hnquan.vercel.app`), project `shoppe-c`, region `sin1`. Alias `https://shoppec.vercel.app` đã đọc lại và xác nhận trỏ đúng deployment này. Build Linux khoảng **5 phút 36 giây**, hoàn thành lúc **16:21:06 UTC+7**.

Snapshot cuối 90 file trên nền Git `99bc042b28c316d46ad8fed154eb5c87e0af7f8a`, có thay đổi chưa commit; SHA-256 manifest `60409c28972183b892dd908081f33ac4baede5d23707d26162482237c4a6316c`. Snapshot source chính xác được giữ ở `artifacts/performance-fix2-final-source-snapshot.json`, không chứa `.env`, cookie, credential hoặc DB thử. Chưa push Git/CI remote.

## Kết quả Production

Bản frontend trước barrier đã xác minh:

- Bundle Production `index-CTJ0tkbX.js` khớp byte/SHA-256 với local.
- Form login route dựng **7,2 ms** trong browser, trong khi `/auth/me` và metadata cold mất **3,71–3,77 giây**; form không còn chờ hai API này.
- Search → danh mục: input trống, 12 card đúng. Browser back/forward local đã kiểm tra. Admin DOM 50 hàng/50 ảnh lazy; editor có mô tả 485 ký tự, 1 biến thể và shop hợp lệ. Màn danh sách chỉ gửi 1 request products gộp; metadata chỉ lấy thêm khi editor cần refresh.
- Theo chấp thuận của người dùng, mở giao diện liên kết Google và dừng trước xác nhận: có **1 iframe Google**, không có warning/error init lặp. Không liên kết tài khoản thật.
- Mẫu search/sort trên document mới: INP **8 ms**, input delay ~0,3 ms, processing ~0,1 ms, presentation ~7,6 ms, không có long frame. Đây là một mẫu automation nhỏ, không phải field p75. Một sự kiện login khác ghi 3.136 ms nhưng processing chỉ ~6,3 ms, còn lại presentation, không có long frame; không quy số đó thành JS block 3 giây. Attribution giúp tách ảnh hưởng của môi trường browser tự động.
- Sau khi khôi phục bản đã kiểm chứng, 30 health GET không cache trên **cùng một instance**: median **118,3 ms**, p95 của bài test **145,4 ms**, max **166,9 ms**. Đây chỉ là health, không phải p95 của cart/admin. Catalog gộp metadata MISS 145 ms; shop gộp MISS 817,5 ms.
- Private requests vẫn thường khoảng một giây. Đối chứng HTTPS agent một socket, thay đổi cookie/Origin/content-type và MIME quote không loại bỏ hiện tượng; không thể quy toàn bộ cho Node fetch hoặc JSON header.
- Cold health request vẫn **3.695,8 ms**, handler **8,41 ms**, instance age lúc request ~17,8 ms. Cold start và jitter ngoài handler chưa được loại bỏ bằng các sửa code này.

Phương án thử keep-alive 100 ms đã bị loại: cpp-httplib v0.61.0 nhận phần giây nguyên ở API này nên 100 ms thành 0. Deployment thử `dpl_8QzR3PtdPLz721sB1N4Cefoz7vn6` đã được thay lại bằng bản kiểm chứng `dpl_Uby4rHuXUwsww8E57p5um8QQBgha`; alias Production được đọc lại để xác nhận. Source và binary local đã đồng bộ lại, 33/33 test qua trước khi thêm barrier; bản cuối giữ keep-alive max count 1. Không dùng kết quả của phương án không hợp lệ để tuyên bố cải thiện.

Bản cuối sau READY đã kiểm chứng:

- `index-BuzD24aE.js` trùng byte với bundle local; SHA-256 `d0ab2b00c383c5ae501caebb71c95d041a8401f3ff93aed8794139ded177ee15`.
- Browser Production: cart ban đầu **4**, bấm tăng 3 lần rồi chuyển checkout ngay; checkout hiện **Mặc định × 7**, tiền hàng **7.000.000 ₫**, ship **35.000 ₫**, tổng **7.035.000 ₫**. Không đặt đơn/thanh toán. Bằng chứng `artifacts/performance-fix2-checkout-regression.json`.
- Sau test đã đăng xuất browser; API xác nhận khôi phục giỏ đúng **0 dòng ban đầu**, xóa địa chỉ giả và revoke session. Bằng chứng `artifacts/production-test-cleanup-fix2-2026-10-26.json`.
- Không có log error/fatal trên deployment cuối trong cửa sổ 10 phút kiểm tra lúc **16:23 UTC+7**.
- Mobile cuối: 12 card, viewport/scroll width cùng 375 px, tài khoản đã đăng xuất; ảnh `artifacts/performance-fix2-final-mobile.png`.
- Tổng kết: đã sửa các lỗi UI/vòng đời Google, waterfall và race báo giá. Chưa tuyên bố web hết lag trên mọi thiết bị; cold start ~3,7 giây và jitter private ngoài handler vẫn còn với hạ tầng hiện tại.

## Phạm vi cold start

Container Runtime hiện tự scale xuống sau 5 phút không có traffic Production theo [tài liệu Vercel](https://vercel.com/docs/functions/runtimes/container). Giảm waterfall/đánh thức nhiều instance giúp đường tải trang nhưng không bảo đảm loại bỏ cold start của platform. Không tự mua dịch vụ, đổi host, tạo cron ping giữ nóng hoặc cache công khai dữ liệu giỏ/đơn/account để che độ trễ. Kết luận sẽ dựa trên số đo warm/cold sau phát hành.

GSI lifecycle theo [Google JavaScript reference](https://developers.google.com/identity/gsi/web/reference/js-reference). Chưa đăng nhập Google thật thay người dùng hoặc phát sinh thanh toán/đơn thật.

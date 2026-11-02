# Kết quả sửa giao diện — 02/11/2026

Đã triển khai 12 nhóm sửa trong [kế hoạch audit](UI_AUDIT_FIX_PLAN_2026_11_02.md) vào frontend hiện có. Giữ stack HTML/CSS/JavaScript, thương hiệu, đường dẫn và API. Không triển khai production.

## Thay đổi

| ID | Kết quả triển khai |
| --- | --- |
| UI-01 | Tiêu đề, mô tả, form, divider, vùng Google và footnote cùng một khung tối đa 400px. Nút SDK được cấp đúng chiều rộng khung. |
| UI-02 | `ResizeObserver` cập nhật nút theo chiều rộng thực tế, gộp bằng animation frame; dọn observer/frame khi lỗi, thử lại hoặc chuyển route; không khởi tạo lại Google session khi resize. Khung form có `min-width:0` để chiều rộng nút cũ không giữ cột grid khi thu màn hình. |
| UI-03 | Art xác thực dùng flex với ảnh nằm trong luồng tài liệu, sau chữ; heading có measure/font phù hợp với cột. |
| UI-04 | Footnote dùng màu chữ phụ hiện hành; link dùng màu action đủ đậm; chữ trên nền peach dùng màu ink. |
| UI-05 | Tablet ≤1100px dùng menu ngang trên hàng riêng, workspace nhận toàn chiều rộng. |
| UI-06 | Editor mobile xếp tên và giá thành các hàng riêng; tồn kho có vùng đủ rộng và nút xóa riêng. |
| UI-07 | CSS icon minh họa empty state chỉ áp dụng vào SVG con trực tiếp, không đè kích thước icon trong nút. |
| UI-08 | Breadcrumb có nhãn điều hướng, mục hiện tại và separator được ẩn cùng tên sản phẩm trên mobile. |
| UI-09 | Copy từng trang auth được khai báo riêng, reset có hướng dẫn mật khẩu mới. |
| UI-10 | Thiếu token hiển thị hướng dẫn yêu cầu liên kết mới. Các mã backend `expired_token`, `not_found`, `password_changed` chuyển form sang trạng thái liên kết không còn dùng được. Lỗi dịch vụ tạm thời vẫn giữ form để thử lại. |
| UI-11 | Title voucher theo buyer/seller/admin; empty CTA quản trị mở form tạo voucher đúng scope. Empty state chiếm toàn hàng grid. |
| UI-12 | Trang không tồn tại có h1, title tab và CTA về trang chủ. |

Input trong `.field` trên mobile ≤639px được tăng lên 16px để giữ độ dễ đọc; đây không phải tuyên bố đã kiểm tra Safari/iPhone thật.

## Bằng chứng trước/sau

Artifact trước: `artifacts/ui-audit-2026-11-02/`. Artifact sau: `artifacts/ui-fixes-2026-11-02/`. Các thư mục artifact bị Git bỏ qua; không đưa dữ liệu thử nghiệm vào source ứng dụng.

| Phép đo | Trước | Sau |
| --- | --- | --- |
| Form/nút Google ở desktop 1440px | 433 / 360px | 400 / 400px |
| Nút Google sau resize tới 390px | Giữ 360px trong khung 300px | 300 / 300px |
| Nút Google sau resize tới 768px | Không render lại | 263 / 263px |
| Nút Google sau resize tới 320px | Giữ 360px trong khung 230px | 230 / 230px |
| Heading art login ở desktop/tablet | 3 dòng | 2 dòng |
| Chữ phụ/link auth | Có đoạn 2.9:1, 3.3:1, 4.3:1 | Các đoạn đã nêu đều đạt ≥4.5:1 trong kiểm thử |
| Menu tablet 768px | Khung aside 218px trong layout hai cột | Khung aside 718px trên hàng riêng |
| Ô giá biến thể mobile | Giá mặc định `100000` cần 87px trong ô 81px | `100000000` đọc đủ, scrollWidth bằng clientWidth |
| Icon mũi tên empty CTA | 42px, margin dưới 15px | 15px, margin dưới 0 |
| H1 trang 404 | 0 | 1 |

Các phép đo Google dùng SDK giả lập để kiểm tra hợp đồng kích thước/vòng đời, không dùng làm bằng chứng OAuth thật. Mỗi lần resize giữ nguyên một lần `initialize()` và một challenge; chuyển route không tiếp tục render vào container cũ.

Đã chụp lại **35 URL × 4 chiều rộng = 140 lượt**: không lỗi JavaScript, ảnh hỏng, tràn ngang toàn trang hoặc phần tử ngoài viewport ngoài các vùng cuộn chủ đích được loại trừ. Đã mở và xem ảnh login desktop/mobile, editor biến thể mobile và workspace tablet. Cũng đã chụp các hộp thoại ở bốn chiều rộng.

Tệp đáng xem:

- `report.json`: 140 lượt kiểm tra sau sửa.
- `extra-report.json`: số đo hộp thoại và Google resize.
- `visual-checks.json`: menu tablet, giá/tồn kho tối đa, thao tác bảng bằng bàn phím và kết quả thử SDK Google thật.
- `guest-login-1440.png`, `guest-login-390.png`: khung auth sau sửa.
- `workspace-tablet-768.png`: menu tablet trên hàng riêng.
- `variant-editor-mobile.png`: đủ chữ số giá và tồn kho.
- `inspector-login/report.json`: phép đo độc lập và các cảnh báo còn lại.

## Kiểm thử

- `npm run check`: đạt.
- `npm run build`: đạt.
- 37 unit test liên quan frontend API, giỏ hàng, Google session, latency probe và public navigation: đạt. Các test mở server loopback được chạy ngoài sandbox; trong sandbox chúng bị EACCES.
- Bộ Playwright dùng SQLite fixture riêng: **42/42 đạt** trên bản build cuối cùng, gồm 8 ca UI regression mới cùng các luồng checkout, cart conflict, header, loading, motion, catalog và storefront. Lần chạy cuối mất khoảng 30.6 giây và dùng fixture mới.
- Thêm `tests/browser/ui-fixes.spec.js`: kiểm tra alignment/resize/cleanup Google, lỗi Google và retry, art/contrast, breakpoint tablet, số liệu biến thể mobile, icon/breadcrumb/404, token lỗi và token thành công qua API giả lập, voucher theo role.
- Đã kiểm tra breakpoint 640/768/900/1024/1100px cho workspace và các chiều rộng 320/390/768/1440px cho Google; có ca chuyển trực tiếp desktop → tablet.
- Thao tác chỉnh sửa ở cột ngoài khung bảng mobile có thể nhận focus và mở bằng Enter; Escape đóng dialog.

Lưu ý chạy lại: dùng fixture mới cho toàn bộ suite. Tái sử dụng server đã trải qua nhiều đợt audit có thể chạm rate limit đăng nhập và gây lỗi fixture; không dùng lỗi đó để sửa hành vi ứng dụng hoặc vô hiệu hóa rate limit.

## Giới hạn nghiệm thu

- Google: đã kiểm tra vòng đời/kích thước bằng SDK giả lập và thử tải SDK chính thức. Trong môi trường audit, SDK chính thức không tải được trong thời gian chờ; ứng dụng hiện thông báo lỗi/Thử lại và giữ email login sử dụng được. **Chưa nghiệm thu iframe Google thật hay OAuth với client/origin hợp lệ.**
- Chưa kiểm tra Safari/iPhone thật, bàn phím iOS, browser zoom 200% thật hoặc mọi trạng thái dữ liệu đơn/hoàn trả/chat/payment. Bộ hồi quy hiện có kiểm tra phần checkout/cart và hành vi liên quan; không đại diện mọi tích hợp dịch vụ thật.
- Không gửi email, upload ảnh, chuyển tiền hoặc triển khai production.
- Inspector còn báo phong cách palette, font khác direction sheet lịch sử và chữ gần mép ở cuối hàng nav cuộn ngang. Static style lint còn báo các ký hiệu sao đánh giá hiện có cùng các style legacy. Những cảnh báo này không được coi là đạt, nhưng không phải hồi quy mới và không nằm trong 12 lỗi cần sửa; không đổi thương hiệu hoặc xóa ký hiệu đánh giá để làm công cụ hết báo.

## Phạm vi mã thay đổi

- `frontend/app.js`: Google mount/cleanup, empty state theo ngữ cảnh, auth copy/token states, breadcrumb, voucher và 404.
- `frontend/curated.css`: khung auth, art, màu chữ, mobile controls và variant editor.
- `frontend/style.css`: scope icon empty.
- `frontend/workspace.css`: breakpoint tablet.
- `tests/browser/ui-fixes.spec.js`: kiểm thử hồi quy mới.

Không sửa backend, cấu hình OAuth hay schema trong đợt UI này.

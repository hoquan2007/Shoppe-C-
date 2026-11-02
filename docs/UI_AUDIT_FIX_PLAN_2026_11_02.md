# Rà soát giao diện và kế hoạch sửa — 02/11/2026

## Kết luận

Đã xác nhận **12 nhóm lỗi giao diện/nội dung giao diện** trong phạm vi kiểm tra bên dưới. Ưu tiên trước: căn chỉnh Google, xử lý resize, ảnh che chữ trong khối xác thực, tương phản chữ, menu quản trị trên tablet và ô giá biến thể trên điện thoại.

Đây là ảnh chụp kết quả audit trước khi sửa. Kế hoạch đã được triển khai vào mã frontend; xem [báo cáo thực hiện](UI_FIX_RESULTS_2026_11_02.md) để biết kết quả kiểm thử và các giới hạn còn lại. Chưa deploy. Không đổi bảng màu, font hay phong cách thương hiệu chỉ vì công cụ kiểm tra có ý kiến về thẩm mỹ.

Không thể khẳng định đã tìm hết mọi lỗi trong mọi trạng thái dữ liệu. Các trang và trạng thái chưa được tái hiện được liệt kê riêng, không coi là đã đạt.

## Phạm vi và bằng chứng

- Build từ checkout hiện tại: `npm run build` thành công.
- Chromium/Playwright, chiều rộng **320, 390, 768, 1440px**, chiều cao 900px, reduced motion để đo bố cục ổn định.
- **35 URL × 4 chiều rộng = 140 lượt kiểm tra** trên backend C++ với SQLite thử nghiệm riêng. Đăng nhập bằng tài khoản seed cho buyer/seller/admin. Giỏ và checkout được kiểm tra với sản phẩm thật trong fixture, không chỉ trạng thái trống.
- Hộp thoại thêm địa chỉ và thêm sản phẩm ở cả bốn chiều rộng; kiểm tra bổ sung editor biến thể, menu tablet, reset/verify thiếu token và 404.
- Inspector độc lập chụp trang login ở 1440/768/390px và đo tương phản.
- Đối chiếu ảnh người dùng cung cấp với mã dựng nút Google. Phép đo resize dùng SDK giả lập để ghi nhận tham số `renderButton`; **không phải nghiệm thu iframe Google thật hoặc OAuth thật**.
- 140 lượt baseline không ghi nhận lỗi JavaScript, ảnh hỏng hay tràn ngang toàn trang. Điều này không loại trừ các lỗi bị cắt bên trong input, bảng, menu hoặc khung `overflow: clip`.

Bằng chứng nằm trong `artifacts/ui-audit-2026-11-02/` (thư mục artifact bị Git bỏ qua):

| Tệp | Nội dung |
| --- | --- |
| `report.json` | Ma trận 140 lượt: URL, vai trò, viewport, heading, overflow, ảnh, console |
| `extra-report.json` | Đo hộp thoại và kích thước Google khi resize |
| `target-report.json` | Đo menu tablet, ô biến thể, breadcrumb, reset/verify/404 |
| `inspector-login/report.json` | Phép đo độc lập cho login, gồm tương phản chữ |
| Các tệp PNG/JPG | Ảnh trước khi sửa |

Danh sách trang baseline:

- Khách: `/`, `/search`, `/search?q=zzzzzz`, `/product/product-1`, `/shop/shop-mono`, `/login`, `/register`, `/forgot`, `/reset`, `/verify`, `/not-found`.
- Buyer: `/account`, `/cart`, `/checkout`, `/orders`, `/wishlist`, `/vouchers`, `/chat`, `/notifications`.
- Seller: `/seller`, `/seller/products`, `/seller/orders`, `/seller/vouchers`, `/seller/settings`.
- Admin: `/admin`, `/admin/shops`, `/admin/products`, `/admin/orders`, `/admin/users`, `/admin/payments`, `/admin/reviews`, `/admin/vouchers`, `/admin/outbox`, `/admin/audit`, `/admin/settings`.

P1 = sửa trước vì ảnh hưởng đọc nội dung/thao tác chính; P2 = lỗi trải nghiệm và tính nhất quán; P3 = lỗi chi tiết.

## Danh sách lỗi đã xác nhận

### UI-01 · P1 · Nút Google ngắn hơn input và nút đăng nhập

- **Vị trí:** `frontend/app.js:325`, `frontend/redesign.css:1809`, `frontend/curated.css:244`.
- **Hiện tượng:** ảnh người dùng có nút Google cùng lề trái nhưng kết thúc sớm hơn các ô nhập phía trên. Ở viewport 1440px, phép đo ghi nhận form rộng **433px**, trong khi mã chỉ yêu cầu nút Google rộng **360px**.
- **Nguyên nhân:** `Math.min(360, ...)` giới hạn nút; phần còn lại của form giãn theo cột.
- **Sửa:** tạo một khung nội dung xác thực dùng chung, `width: 100%`, `max-width: 400px`; căn tiêu đề, mô tả, form, divider, vùng Google và footnote theo cùng khung. Lấy chiều rộng thực tế của khung đó để render nút. Giữ outer card hiện có và SDK chính thức.
- **Lưu ý kỹ thuật:** SDK Google hỗ trợ tối đa **400px**; chỉ đổi 360 thành 433 hoặc CSS `width:100%` cho container không giải quyết được iframe. Nguồn: [Google JavaScript API — width](https://developers.google.com/identity/gsi/web/reference/js-reference#width).
- **Đạt khi:** các cạnh của khung nút Google và controls thẳng hàng ở cả bốn viewport; Google loading/error/retry nằm trong cùng khung; email login vẫn dùng được khi Google lỗi. Đối chiếu iframe thật sau khi có cấu hình OAuth hợp lệ.

### UI-02 · P1 · Nút Google không cập nhật theo chiều rộng mới

- **Vị trí:** `mountGoogleSignIn()` trong `frontend/app.js:273`.
- **Hiện tượng:** tải ở 1440px rồi thu xuống 390px: container còn **300px**, tham số nút vẫn **360px**, số lần render vẫn là 1. Ở 320px container còn **230px**. Khung `overflow: clip` có thể che phần thừa, khiến kiểm tra tràn ngang toàn trang vẫn đạt.
- **Mức bằng chứng:** đã xác nhận vòng đời và tham số bằng SDK giả lập; chưa quan sát lại iframe Google thật khi resize.
- **Nguyên nhân:** kích thước chỉ được đo một lần, không theo dõi thay đổi container.
- **Sửa:** dùng `ResizeObserver`, chỉ render lại khi chiều rộng nguyên thay đổi, gộp cập nhật bằng animation frame. Dọn observer/frame khi chuyển route; dùng lại Google session đã khởi tạo, không xin nonce hoặc `initialize()` lại chỉ vì resize.
- **Đạt khi:** resize 1440 → 390 → 768 → 320 và ngược lại không tràn/cắt nút; không tạo observer dư, vòng lặp resize hay đăng ký callback trùng.

### UI-03 · P1 · Ảnh minh họa che chữ trong khối xác thực desktop

- **Vị trí:** `frontend/style.css:919`, `frontend/style.css:927`, `frontend/style.css:933`, `frontend/curated.css:245`.
- **Bằng chứng:** `guest-login-1440.png`. Ảnh tai nghe chồng lên phần mô tả; tiêu đề bị đẩy thành ba dòng với một từ “mới.” đứng riêng.
- **Nguyên nhân:** ảnh `position:absolute` ở đáy, mô tả không có vùng tránh ảnh; heading còn `max-width:270px` nhưng font đã tăng lên 42px.
- **Sửa:** dành hàng/vùng riêng cho nội dung và ảnh bằng grid/flex; bỏ sự phụ thuộc vào chiều cao card để tránh đè chữ. Điều chỉnh measure của heading theo cột, giữ nội dung và tài sản thương hiệu.
- **Đạt khi:** ảnh không chạm chữ trên login/register/forgot/reset/verify ở desktop/tablet, kể cả khi hiện thêm cảnh báo hoặc lỗi; kiểm tra thêm zoom 200%.

### UI-04 · P1 · Chữ phụ và liên kết đăng ký thiếu tương phản

- **Vị trí:** `frontend/style.css:955`, `frontend/style.css:961`, `frontend/tokens.css:2`, `frontend/curated.css:250`.
- **Bằng chứng:** inspector đo “Chưa có tài khoản?” khoảng **2.9:1**, “Đăng ký ngay” khoảng **3.3:1**, “Chào bạn đến Shoppe” khoảng **4.3:1**. Các đoạn chữ nhỏ này cần mục tiêu tối thiểu 4.5:1.
- **Nguyên nhân:** màu legacy `#929889`, màu `--orange` sáng và nền peach chưa đủ tương phản ở vai trò chữ nhỏ; các lớp CSS mới chưa thay hết màu cũ.
- **Sửa:** dùng token màu chữ/link có tương phản đủ với từng nền. Giữ màu logo và màu thương hiệu khi không đóng vai trò chữ nhỏ; không thay palette toàn trang.
- **Đạt khi:** đo lại các đoạn trên và trạng thái hover/focus/error; chữ thường ≥4.5:1; không dùng màu làm tín hiệu duy nhất cho trạng thái.

### UI-05 · P1 · Menu quản trị tablet vừa nằm ở cột trái vừa chạy ngang

- **Vị trí:** `frontend/workspace.css:293`, `frontend/workspace.css:338`, `frontend/workspace.css:345`.
- **Bằng chứng:** `workspace-tablet-768.png`, `target-report.json`. Ở 768px: grid **220px + 468px**, trong khi aside đã thành `display:flex`; nội dung menu rộng **991px** bị nhét vào khung rộng **218px**.
- **Nguyên nhân:** breakpoint ≤1100px chuyển menu thành hàng ngang; quy tắc desktop phía dưới lại khôi phục layout hai cột. Chỉ breakpoint ≤639px mới chuyển về một cột.
- **Sửa:** thống nhất breakpoint: hoặc menu ngang trên toàn chiều rộng phía trên workspace, hoặc sidebar dọc đúng nghĩa. Đề xuất hàng ngang/selector ở tablet, sidebar ở desktop; đặt quy tắc theo thứ tự không bị desktop override.
- **Đạt khi:** kiểm tra 640/768/900/1024/1100px, menu và bảng nhận đúng chiều rộng; mọi mục điều hướng dùng được bằng bàn phím và chạm.

### UI-06 · P1 · Ô giá biến thể cắt mất chữ số trên điện thoại

- **Vị trí:** `frontend/style.css:1497`, `frontend/style.css:2017`, `frontend/app.js:1366`.
- **Bằng chứng:** `variant-editor-mobile.png`, `target-report.json`. Ô `variant_price` chứa mặc định `100000`, rộng trong chỉ **81px**, nội dung cần **87px** ngay với giá sáu chữ số; padding là 12px. Giá tối đa được phép còn dài hơn.
- **Nguyên nhân:** editor dùng các cột quá hẹp trên mobile, trong khi padding/font của input đã tăng.
- **Sửa:** trên mobile cho tên biến thể chiếm một hàng, giá và tồn kho dùng hai cột đủ rộng hoặc xếp dọc; nút xóa có vùng riêng. Không giảm font để ép số vào ô.
- **Đạt khi:** `100000000` và tồn kho `1000000` đọc được đầy đủ ở 320/390px, cả khi có spinner của input number; không tràn hộp thoại.

### UI-07 · P2 · Icon trong nút của trạng thái trống bị phóng to

- **Vị trí:** `frontend/style.css:863`, hàm `empty()` trong `frontend/app.js:149`.
- **Bằng chứng:** `guest-search-q-zzzzzz-1440.png`, `seller-seller-vouchers-390.png`. Icon mũi tên được khai báo 15px nhưng render **42×42px**, có margin-bottom 15px; nút cao và icon lệch so với chữ.
- **Nguyên nhân:** `.empty svg` áp dụng cho cả biểu tượng lớn phía trên và icon bên trong nút.
- **Sửa:** scope vào icon minh họa trực tiếp (`.empty > svg` hoặc class riêng); icon nút dùng kích thước control chung, không kế thừa margin của illustration.
- **Đạt khi:** mọi empty state dùng nút cùng chiều cao/căn giữa với nút thường; icon minh họa chính vẫn giữ kích thước lớn.

### UI-08 · P3 · Breadcrumb mobile còn dấu “/” thừa

- **Vị trí:** `frontend/app.js:597`, `frontend/redesign.css:1602`.
- **Bằng chứng:** `guest-product-product-1-390.png`; text hiển thị là `Trang chủ / Điện tử /`.
- **Nguyên nhân:** breakpoint mobile ẩn tên sản phẩm nhưng vẫn giữ separator đứng trước nó.
- **Sửa:** dựng separator bằng CSS giữa các mục còn hiển thị, hoặc ẩn cả separator tương ứng; dùng `nav`/danh sách và đánh dấu mục hiện tại phù hợp.
- **Đạt khi:** không dấu phân cách cuối ở mobile; desktop vẫn có tên sản phẩm và xử lý tên dài.

### UI-09 · P2 · Trang đặt lại mật khẩu dùng mô tả của đăng nhập

- **Vị trí:** `frontend/app.js:639`.
- **Bằng chứng:** `/reset` có heading “Mật khẩu mới” nhưng mô tả “Những điều thú vị đang chờ bạn.”.
- **Nguyên nhân:** điều kiện chọn subtitle không có nhánh `reset`.
- **Sửa:** tách nội dung cho từng loại auth page; reset hướng dẫn đặt mật khẩu mới và yêu cầu độ dài. Đặt copy trong cấu hình rõ ràng thay cho chuỗi ternary dài.
- **Đạt khi:** login/register/forgot/reset/verify có heading, mô tả và CTA đúng mục đích.

### UI-10 · P2 · Reset/verify thiếu token vẫn hiển thị thao tác có thể gửi

- **Vị trí:** `frontend/app.js:639`, `frontend/app.js:2310`.
- **Bằng chứng:** `/verify` không có token vẫn có nút “Xác minh email” enabled và không có input; `/reset` thiếu token vẫn cho nhập mật khẩu và submit. Token rỗng chỉ được đưa vào request lúc gửi.
- **Nguyên nhân:** chưa có trạng thái giao diện cho liên kết không hợp lệ/thiếu token.
- **Sửa:** phát hiện token thiếu trước khi vẽ form, hiện giải thích và đường dẫn phù hợp tới đăng nhập/khôi phục. Với token hết hạn hoặc không hợp lệ do backend trả về, chuyển sang trạng thái tương ứng; không khẳng định token hợp lệ chỉ dựa vào việc có query param.
- **Đạt khi:** thiếu/sai/hết hạn/đã dùng token đều có thông điệp rõ, không có form thao tác vô ích; token hợp lệ vẫn dùng được.

### UI-11 · P2 · Trang quản lý voucher dùng nội dung và empty CTA của người mua

- **Vị trí:** `frontend/app.js:934`, hàm `empty()`.
- **Bằng chứng:** `/seller/vouchers`, `/admin/vouchers` vẫn có title “Ưu đãi dành cho bạn”; seller chưa có voucher lại được dẫn “Khám phá sản phẩm” thay vì tạo voucher. Ảnh: `seller-seller-vouchers-390.png`.
- **Nguyên nhân:** tái sử dụng title và empty-state mặc định cho cả ba scope.
- **Sửa:** buyer giữ nội dung khám phá ưu đãi; seller dùng “Voucher của shop”, admin dùng “Voucher toàn sàn”; empty CTA mở form tạo voucher với đúng scope.
- **Đạt khi:** title, mô tả, CTA, active menu đúng vai trò; nút tạo ở empty state và đầu trang mở cùng một form.

### UI-12 · P2 · Trang không tồn tại thiếu heading chính

- **Vị trí:** fallback trong `renderRoute()` tại `frontend/app.js:1540`, hàm `empty()`.
- **Bằng chứng:** `/not-found` có **0 h1** trong content; thông điệp chính được render bằng `h3` của component empty chung.
- **Nguyên nhân:** dùng empty state cấp section làm toàn bộ trang.
- **Sửa:** dựng trang not-found có h1, tiêu đề tab và CTA trở về phù hợp; cho component empty hỗ trợ cấp heading theo ngữ cảnh hoặc tách component cấp trang.
- **Đạt khi:** trang lỗi có một h1; cấu trúc heading của các empty state lồng trong trang không bị đổi sai.

## Hai hạng mục cần kiểm tra thêm, chưa tính là lỗi đã xác nhận

1. **Input 14px trên iPhone:** phần lớn `.field` dùng 14px, kể cả auth và hộp thoại, trong khi search mobile đã dùng 16px. Cần kiểm tra Safari/iPhone thật về zoom khi focus và bàn phím che nội dung. Nếu tái hiện, tăng font input mobile lên 16px và kiểm tra lại chiều cao. Chromium desktop giả lập chiều rộng không đủ để kết luận.
2. **Khả năng thấy thao tác trong bảng mobile:** các cột “Thao tác” nằm ngoài khung và bảng có cuộn ngang hợp lệ. Cần kiểm tra sử dụng bàn phím/chạm, thêm gợi ý cuộn hoặc giữ cột thao tác nếu người dùng khó tìm. Không coi mọi vùng cuộn ngang có chủ đích là lỗi tràn trang.

## Kế hoạch triển khai

| Đợt | Phạm vi | Kết quả cần bàn giao | Ước lượng |
| --- | --- | --- | --- |
| 1 | UI-01 → UI-04 | Auth dùng chung khung ≤400px; Google resize đúng; ảnh không che chữ; tương phản đủ | 0.5–1 ngày |
| 2 | UI-05, UI-06 | Breakpoint workspace nhất quán; editor biến thể đọc đủ số trên mobile | 0.5 ngày |
| 3 | UI-07 → UI-12 | Empty state, breadcrumb, copy, token states, voucher theo scope, trang 404 | 0.5–1 ngày |
| 4 | Kiểm tra hồi quy và các trạng thái còn thiếu | Ảnh trước/sau, phép đo, kiểm tra bàn phím và browser/device bổ sung | 0.5–1 ngày |

Tổng dự kiến **2–3.5 ngày làm việc**, tùy thời gian kiểm tra Google thật, iPhone và chuẩn bị dữ liệu trạng thái. Đây là ước lượng, chưa bao gồm thiết kế lại toàn trang.

Thứ tự thay đổi giúp review dễ và tránh chồng CSS:

1. Gom khung auth và vòng đời Google thành một thay đổi có phạm vi rõ; không thay đổi xử lý session/nonce ngoài phần cần cho resize.
2. Sửa thứ tự cascade của workspace và layout editor; giữ nguyên đường dẫn, API, biểu mẫu và quyền truy cập.
3. Sửa nội dung/trạng thái theo ngữ cảnh; dùng component icon/empty có scope rõ.
4. Dọn các override trùng chính trong vùng vừa sửa. Không tổ chức lại toàn bộ stylesheet trong cùng đợt nếu chưa cần.

## Kiểm tra sau sửa

- Chạy `npm run check`, `npm run build`, các unit test liên quan Google session và bộ browser regression phù hợp. Báo cáo hiện tại chỉ xác nhận build và các probe audit, **không tuyên bố toàn bộ test suite đã chạy**.
- Bổ sung kiểm thử browser tập trung vào hành vi từng bị lỗi: alignment Google, resize và cleanup; menu tablet; nội dung ô giá; icon empty; token states; voucher theo scope; h1 trang 404.
- Với Google: fake SDK để đo tham số/vòng đời trong CI; đối chiếu iframe SDK thật bằng cấu hình hợp lệ. Không dùng fake SDK làm bằng chứng OAuth hoạt động.
- Chụp so sánh cùng dữ liệu, cùng viewport 320/390/768/1440px. Thêm mốc breakpoint 639/640/760/761/899/900/1100px cho những vùng đang có quy tắc chồng nhau.
- Kiểm tra Tab/Shift+Tab/Enter/Escape, focus visibility, chuyển route, đóng/mở dialog, menu và form lỗi; zoom 200%, reduced motion và viewport thấp khi có bàn phím.
- Kiểm tra nút cố định trên trang sản phẩm và thanh điều hướng dưới bằng scroll thực tế. Một ảnh full-page có thanh fixed nằm đè giữa nội dung không tự chứng minh rằng nút bên dưới bị chặn vĩnh viễn.
- Điều kiện đóng lỗi: đạt tiêu chí của từng UI-ID, không hồi quy luồng trước đó, có ảnh/phép đo sau sửa tương ứng.

## Giới hạn còn lại của đợt audit

- Chưa nghiệm thu giao diện production đang deploy so với checkout local.
- Chưa thực hiện OAuth Google thật, gửi email thật, upload thật, thanh toán payOS hoặc giao dịch tiền thật.
- Chưa bao phủ chi tiết từng trạng thái đơn/hoàn trả, kết quả thanh toán, các cuộc hội thoại đã có nội dung, lịch sử thông báo dày, lỗi mạng ở mọi form và tất cả dialog quản trị. Các trang danh sách đã kiểm tra, nhưng trạng thái lồng sâu cần fixture bổ sung trong đợt hồi quy.
- Chưa kiểm tra Safari/Firefox, thiết bị cảm ứng thật hoặc iPhone có bàn phím mở.
- Inspector có các cảnh báo thuần phong cách như palette/font khác direction sheet cũ. Chúng không được tính là lỗi sản phẩm trong danh sách này.

## Chạy lại bằng chứng trên máy này

Các script audit dùng để thu bằng chứng được lưu ở `.cache/ui-audit-20261102.mjs`, `.cache/ui-audit-extra-20261102.mjs`, `.cache/ui-audit-targets-20261102.mjs` và không nằm trong source ứng dụng.

Build rồi chạy `node scripts/browser-fixture.mjs` ở một terminal, sau đó chạy các script trên với Playwright đã có browser. Fixture tạo SQLite mới dưới `.cache/browser-test-*`. Đường dẫn browser của máy audit là `C:/Users/HNQuan/AppData/Local/ms-playwright`. Không chạy hai fixture cùng cổng 18147 và không trỏ các script này vào production.

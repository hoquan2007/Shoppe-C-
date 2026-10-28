# Plan header, tìm kiếm và xác minh email — 28/10/2026

## Kiểm tra hiện trạng

- Domain chính `https://shoppec.vercel.app` trả HTTP 200, alias trỏ đến Production READY `dpl_GNkF6iHexNKaQHDGQBSEJCouNcw5`, source `98d7e52ea17e8d17ef355e0d10598566332b6015`, bundle `index-Dxmd6C9x.js`.
- Hai commit mới hơn chỉ thay đổi tài liệu; Preview của chúng được hủy chủ động. Check Vercel màu đỏ ở các commit đó không phải Production bị hỏng. Không cần redeploy cùng mã ứng dụng chỉ để thay dấu check.
- Production public metadata vẫn báo `email_configured=false`. Vercel đã có `RESEND_API_KEY` dạng Secret, chưa có `EMAIL_FROM` cho Production. Chưa có deployment mới sau khi thêm key.
- Lần gửi thử trực tiếp provider ở lượt trước báo `delivered`; không phải một lần gửi link xác minh từ website. Email tài khoản trong ảnh khác địa chỉ chủ Resend đã được thử. Không tự đổi email tài khoản, không chuyển tiếp token xác minh sang người khác, không coi email đã xác minh chỉ vì bấm gửi.
- Đo DOM thật tại viewport 1280px: topbar 32px + masthead 142px (hàng chính 92px, nav 49px và border), tổng vùng trên nội dung khoảng 174px. Search cao 52px, rộng 623px.
- Tái hiện bằng Tab/Shift+Tab: input có outline đen 2px và wrapper có outline 2px khác, gây hai viền như ảnh. Header còn lặp liên kết ưu đãi và chiếm nhiều chiều cao. Screenshot kiểm tra ở `artifacts/redesign-after/header-audit-focus-20261028.png`.

## Hướng thiết kế đề xuất

Giữ nhận diện cam ấm, Manrope, nền trung tính hiện tại. Header là công cụ mua sắm gọn và rõ: logo → tìm sản phẩm → tài khoản/giỏ hàng. Không vẽ lại toàn bộ trang chủ trong thay đổi này.

| Vùng | Desktop | Điện thoại |
| --- | --- | --- |
| Hàng chính | Mục tiêu 76–80px; logo gọn, search chiếm phần co giãn lớn nhất; cụm hành động có khoảng cách đều | Hàng logo/tài khoản/giỏ, sau đó một hàng search rộng toàn phần; điều khiển tối thiểu 44px |
| Điều hướng | Mục tiêu 44px; Danh mục, Khám phá, Hàng mới, Ưu đãi; trạng thái trang hiện tại rõ | Danh mục và liên kết khám phá gọn; cuộn có chủ đích nếu cần, không ép chữ hoặc tràn toàn trang |
| Link phụ | Người bán/thông báo/đơn mua/tin nhắn gom vào các điểm truy cập tài khoản phù hợp; admin vẫn có đường vào Quản trị | Dùng bottom navigation và menu tài khoản hiện có; không xóa đường đi của chức năng |
| Search | Cao 48px, một đường viền trung tính, icon tìm kiếm cân đối, placeholder “Tìm sản phẩm, thương hiệu…” | Input cỡ chữ tối thiểu 16px, nút tìm kiếm dễ chạm; không che kết quả khi mở bàn phím |

Bỏ slogan khỏi header và bỏ liên kết ưu đãi trùng; thông tin locale không cần chiếm một tầng riêng. Mục tiêu desktop tổng khoảng 120–124px, giảm khoảng 50px so với hiện tại; đây là mục tiêu thiết kế, chưa phải kết quả đã triển khai.

## Thứ tự thực hiện

1. **Chốt cấu trúc trong `frontend/app.js`:** giữ form `data-form="search"`, trường `q`, accessible name, URL query, auth/cart state và điều hướng hiện có. Chuyển link phụ vào menu có thật, không bỏ chức năng. Tên tài khoản dài và giỏ số lớn phải có chỗ hiển thị.
2. **CSS header có phạm vi rõ:** sửa ở `frontend/curated.css`, tái sử dụng token. Cấu hình grid/flex với `minmax(0,1fr)` và chiều rộng co giãn; không chồng thêm nhiều lớp override header mới. Chỉ điều chỉnh token nếu có giá trị dùng lại.
3. **Sửa focus tại đúng component:** wrapper cung cấp một vòng focus tương phản đủ rõ; input không vẽ thêm outline đen bên trong. Nút submit vẫn có focus bàn phím riêng. Không tắt outline toàn website. Hover/focus không đổi kích thước, không chuyển động layout.
4. **Hành vi search:** Enter hoặc nút tìm kiếm gửi cùng một query; giữ nội dung khi chuyển kết quả, xử lý query rỗng và tiếng Việt đúng. Nếu thêm nút xóa, chỉ hiện khi có chữ và không submit form. Không thêm request theo mỗi phím gõ. Chưa thêm dropdown gợi ý tùy biến trong phạm vi đầu; popup lịch sử của trình duyệt không nên được coi là UI của website hoặc hứa xóa bằng CSS.
5. **Kiểm tra rồi phát hành:** fixture desktop/tablet/phone, keyboard, sau đó CI → Preview → Production từ đúng commit. Ghi rõ commit/deployment đang phục vụ và Preview bị hủy để tránh nhầm check GitHub. Tránh tạo thêm deploy tài liệu không cần thiết.

## Điều kiện nghiệm thu

- 375/390/768/1280/1440/1920px: không tràn ngang toàn trang, search và hành động chính không chồng nhau; menu mở/đóng bằng bàn phím và touch.
- Focus bàn phím chỉ có một vòng rõ cho input; có trạng thái riêng cho nút submit, Escape đóng menu nếu có; focus không bị header che.
- Search bằng Enter và click cho kết quả/URL tương đương, không nhân đôi request; không thêm API chỉ vì dựng header. Test tài khoản khách, đã đăng nhập, admin, tên dài, giỏ rỗng/có hàng.
- Giữ reduced-motion/Save-Data; header không tải thêm thư viện animation; scroll dùng cơ chế trình duyệt. Đo DOM và ảnh trước/sau; không khẳng định hết lag backend chỉ vì header gọn hơn.

## Nhánh email xác minh còn thiếu

Chưa thể dùng sender mặc định Resend để gửi xác minh cho mọi Gmail. `onboarding@resend.dev` chỉ gửi thử đến email của tài khoản Resend; tài khoản trong ảnh có địa chỉ khác, nên chỉ redeploy hoặc thêm sender thử nghiệm sẽ không giải quyết được trường hợp đó.

Trước khi bật email khách hàng: có domain/subdomain quản lý được DNS → xác minh trong Resend → cấu hình `EMAIL_FROM` → kiểm tra thư cũ trong outbox và link hết hạn → redeploy → gửi link xác minh mới đến đúng email tài khoản, xác nhận trạng thái sau khi token được xử lý hợp lệ. Không xả toàn bộ outbox bằng sender thử nghiệm.

Song song, cần sửa UX trạng thái gửi: khi mail chưa cấu hình, thông báo rõ chưa thể gửi thay vì chỉ toast “Đã ghi nhận yêu cầu gửi email”; khi chỉ mới enqueue, không báo đã giao thư; không lộ thông tin tồn tại tài khoản ở API công khai. Kiểm tra giới hạn gửi lại và token còn hiệu lực.

Không mua domain hoặc bật dịch vụ trả phí trong plan này. Website vẫn có thể giữ `shoppec.vercel.app`; domain gửi email có thể độc lập.

Nguồn: [Resend default sender restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [báo cáo setup Resend](RESEND_SETUP_2026_10_28.md).

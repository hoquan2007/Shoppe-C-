# Báo cáo giao diện local — vòng 1

Ngày: 23/10/2026. Trạng thái: **chờ chủ dự án xem và góp ý giao diện**.

## Xem bản đang chạy

- Trang chủ: <http://localhost:18231/>
- Danh sách: <http://localhost:18231/search>
- Chi tiết: <http://localhost:18231/product/demo-dummyjson-78>
- Trang cuối catalog: <http://localhost:18231/search?page=50>

Server C++ chạy trên máy, dùng SQLite riêng `.cache/redesign-preview/preview.db`. Đã nhập và xác nhận **600 sản phẩm demo** qua API preview/commit của C++. Cấu hình database cloud, Supabase, payOS và email của tiến trình thử được để trống. Không sửa Production hoặc tạo giao dịch tiền thật.

Nếu bản xem thử đã dừng, chạy tại thư mục dự án:

```powershell
npm run build
node .cache/start-redesign-preview.mjs
```

Chỉ khởi động khi cổng 18231 chưa có server. File khởi động/database nằm trong `.cache/`, được Git bỏ qua. Tài khoản admin thử được khai báo trong file khởi động; đây là tài khoản local, không phải admin Production.

## Phạm vi đã làm

Vòng 1 của kế hoạch: thiết kế lại **trang chủ, danh sách/tìm kiếm và chi tiết sản phẩm**, cùng hệ giao diện dùng chung.

| Khu vực | Kết quả |
| --- | --- |
| Header | Search lớn, logo cam, liên kết giỏ/tài khoản/yêu thích; menu theo tác vụ |
| Trang chủ | Ảnh từ catalog demo thay hình minh họa cũ; danh mục có ảnh; lưới 4/3/2 cột; khối dịch vụ được đưa xuống sau lưới hàng |
| Danh sách | Sidebar desktop; bộ lọc thu gọn/mở trên điện thoại; giá/sort rõ; phân trang gọn với bộ chọn tới đủ 50 trang |
| Chi tiết | Cân lại ảnh/thông tin; giá, biến thể, kho, số lượng rõ; nút mua cố định dưới màn hình điện thoại; nhãn demo đọc được |
| Thành phần chung | Token màu/chữ, nút, form, disabled, badge, dialog, loading/empty/error, footer và điều hướng mobile |
| Trang khác | Nhận lớp giao diện chung; đã mở login, tài khoản/dialog địa chỉ, giỏ, checkout và tổng quan admin. Chưa coi các trang này là đã thiết kế riêng và nghiệm thu toàn bộ |

Giữ các hook `data-action`, `data-form`, selector quan trọng và tham chiếu API. Không thêm endpoint; không đổi C++, schema, logic kho/giá/đơn/payOS, key hoặc cấu hình Vercel.

## Hướng thiết kế

Đã dùng Taste Skill (`design-taste-frontend`) và Hallmark đã cài trên máy.

- Trang mua sắm theo `hero-object`, seed `20261023`: ảnh sản phẩm, giá và tìm kiếm là trọng tâm.
- Màn làm việc tham khảo app draw `framed-sheet`, giữ palette/type thương hiệu. Vòng này mới áp nền, bảng, form và trạng thái chung; chưa tuyên bố áp trọn app sheet cho seller/admin.
- Dùng Segoe UI/system stack hỗ trợ tiếng Việt; không thêm framework hoặc tải font bên ngoài.
- Cam nhận diện `#ed603b`; nút chính `#c2410c`; chữ phụ `#60636b`. Màu/font mới lấy từ `frontend/tokens.css`.
- CSS mới nằm sau stylesheet cũ để giữ các màn chưa thiết kế riêng. Chuyển động chỉ dùng cho phản hồi nhẹ, có reduced-motion; không thêm chỉ số bán/review giả.

Tương phản tính từ token sRGB: trắng/nút cam **5,18:1**, chữ phụ/trắng **6,01:1**, chữ phụ/nền **5,60:1**, chữ chính/trắng **16,10:1**. Đây là đo các cặp token chính, không phải chứng nhận WCAG toàn website.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run check` và `npm run build` | Qua |
| `npm test`, C++ và database test riêng | **16/16 qua** |
| `npm run secrets:check` | Qua; không phát hiện key trong file Git-visible; file ignored không nằm trong lần quét |
| So sánh hook/form/API trước và sau | Không mất hook/form/tham chiếu API; thêm `toggle-filters` |
| Hallmark static, scope app, CSS mới | **0 FAIL, 0 REFLEX, 0 WARN** |
| Taste static, chế độ app, CSS mới | **0 FAIL, 5 WARN** về shadow: bốn chỗ là `none` hủy shadow cũ, một chỗ là dialog thực |
| Browser responsive | **24 tổ hợp**: 3 trang chính × 320/360/390/768/1024/1280/1440/1920px; không ghi nhận tràn ngang cấp trang |
| Console trong phiên kiểm tra | Không có log error/warn ở lần đọc sau kiểm tra sản phẩm |

Kiểm tra trình duyệt dùng CUA. Chưa chạy bộ headless `sloplint --render`/`inspect.mjs`; không có điểm chấm tự động về độ đẹp. Kết quả lint chỉ áp cho `frontend/redesign.css`; CSS/markup cũ chưa được audit toàn bộ theo hai skill.

Đã thử qua UI local:

1. Mở bộ lọc mobile và kiểm tra `aria-expanded`.
2. Tìm `Nike`, nhận 8 kết quả; sort giá tăng hiện đúng thứ tự.
3. Chọn trang 50, nhận `589–600 / 600 sản phẩm`, 12 thẻ.
4. Chưa đăng nhập bấm thêm giỏ được chuyển tới login kèm đường quay lại.
5. Đăng nhập tài khoản thử; tăng số lượng 1 → 2, chọn biến thể và thêm giỏ. Giỏ nhận đúng 2 sản phẩm và tổng tương ứng.
6. Checkout thiếu địa chỉ hiển thị hướng dẫn; thêm địa chỉ giả qua dialog local rồi mở lại checkout.
7. Quote do C++ trả: hàng 100.000.000₫ + vận chuyển 20.000₫ = 100.020.000₫. **Không bấm đặt hàng hoặc thanh toán thật trong phiên UI này.**
8. payOS khóa đúng khi local không có key; COD hiển thị bình thường. Đơn/COD/webhook/hoàn tiền được kiểm tra riêng bằng API test với fixture.
9. Mở tổng quan admin; số liệu là dữ liệu local thật, bằng 0 khi chưa có đơn.
10. Lọc giá 1.000.000–2.000.000₫, nhận 81 kết quả với giá đúng khoảng; thử từ khóa không tồn tại và kiểm tra trạng thái rỗng. Chữ liên kết bộ lọc thực tế 14px, vùng chạm bộ lọc/yêu thích mobile 44px.
11. Đổi gợi ý trang chủ sang giá tăng và quay lại; kiểm tra bàn phím Tab thấy vòng focus 2px quanh nút đang chọn.

Giới hạn: viewport kiểm tra độ rộng, chưa thay cho thiết bị iPhone/Android thật và bàn phím ảo. Chưa kiểm thử mọi trạng thái seller/admin/chat/đơn qua UI trong vòng 1.

## Ảnh đối chiếu

Ảnh trong `artifacts/`, không đưa vào bundle:

- `redesign-before-home-local-20261023.png`: mốc trang chủ cũ với fixture trước đó.
- `redesign-home-{desktop,tablet,mobile}-20261023.png`.
- `redesign-catalog-{desktop,tablet,mobile}-20261023.png`.
- `redesign-product-{desktop,tablet,mobile}-20261023.png`.
- `redesign-cart-mobile-20261023.png`, `redesign-checkout-mobile-20261023.png`, `redesign-admin-desktop-20261023.png`: kiểm tra lớp dùng chung, không xác nhận đã thiết kế xong riêng các màn này.

## Hiệu năng và bước tiếp theo

Build cuối: CSS khoảng **55,51 kB / gzip 11,65 kB**, JavaScript **81,67 kB / gzip 25,31 kB**. CSS tăng do giữ stylesheet cũ và thêm lớp thiết kế; JavaScript tăng nhẹ, không thêm dependency frontend. Ảnh danh sách có lazy loading/kích thước cố định; ảnh nổi bật được ưu tiên tải.

Chưa đo Lighthouse/Web Vitals hoặc tốc độ Production; chưa kết luận tình trạng lag trên Vercel đã được giải quyết. API danh sách vẫn trả catalog theo cơ chế cũ; phân trang 12 thẻ hiện nằm ở frontend.

Chủ dự án xem local và góp ý **màu cam, kiểu chữ, mật độ sản phẩm, trải nghiệm mobile**. Không cần key mới để duyệt thiết kế.

Sau khi thống nhất hướng, tiếp tục vòng 2/3: thiết kế riêng giỏ → checkout → kết quả/đơn; auth/tài khoản/shop/chat; sau đó seller/admin, bảng và các trạng thái dữ liệu. Nghiệp vụ tiếp tục nằm ở C++.

Chỉ commit/push khi chủ dự án đồng ý. **Lần này không commit, push, tạo PR, deploy hoặc sửa Production.**

# Kế hoạch thiết kế lại frontend Shoppe

Ngày: 23/10/2026, giờ Việt Nam. Cập nhật: **đã triển khai vòng 1 tại local, chờ góp ý giao diện**. Kết quả và giới hạn kiểm tra nằm trong [báo cáo local](./FRONTEND_REDESIGN_LOCAL_REVIEW.md). Những phần mô tả mốc trước dưới đây được giữ để đối chiếu với kế hoạch ban đầu.

## Phạm vi và quy tắc duyệt

- Mọi chỉnh sửa frontend và bản xem thử thực hiện ở local. **Chờ chủ dự án duyệt giao diện và cho phép trước khi commit/push GitHub**. Trong giai đoạn này không tạo PR hoặc triển khai Vercel.
- GitHub/Vercel đang có build tự động; không dùng push để chia sẻ bản nháp. Gửi ảnh trước/sau và địa chỉ localhost để duyệt.
- Giữ HTML/CSS/JavaScript + Vite; nghiệp vụ, giá, kho, phân quyền, đơn và thanh toán tiếp tục do C++ xử lý.
- Giữ tên/logo Shoppe, nhận diện cam, tiếng Việt, VNĐ, dữ liệu và API hiện có. Catalog Production 600 sản phẩm không bị chỉnh sửa bởi công việc thiết kế.
- Giữ thông báo dữ liệu demo và thanh toán payOS bằng tiền thật; không biến số lượng/đánh giá mô phỏng thành chứng thực thật.

## Hai skill đã cài

| Skill | Nguồn và phiên bản cố định | Thư mục cài tại máy | Vai trò |
| --- | --- | --- | --- |
| `design-taste-frontend` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), commit `6010f91a9935f1c167dfc500fb1a475681892e6b` | `C:/Users/HNQuan/.codex/skills/design-taste-frontend` | Định hướng hình ảnh, chữ, bố cục; phân biệt trang giới thiệu với màn hình tác vụ |
| `hallmark` | [Nutlope/hallmark](https://github.com/Nutlope/hallmark), commit `7ec868225c6caa040558c321ee0fefa0e73f83a8` | `C:/Users/HNQuan/.codex/skills/hallmark` | Kiểm tra tính nhất quán, tương phản, trạng thái tương tác và bảo toàn route/form/handler |

Cài bằng helper của skill-installer vào thư mục skill cá nhân; không đưa mã skill hay bộ theme vào bundle của website. Không cần API key để dùng hai skill. Codex có thể nhận skill mới từ lượt tiếp theo.

Khi hai bộ hướng dẫn khác nhau: yêu cầu của chủ dự án và tính đúng của luồng bán hàng đứng trước; giữ một hệ màu/chữ chung. Dùng hướng dẫn **app screen** cho danh sách sản phẩm, giỏ/checkout và seller/admin. Không áp nguyên mẫu marketing dài, hiệu ứng cuộn nặng hoặc chuyển framework vào các màn hình tác vụ.

## Cơ sở khảo sát

- `frontend/tokens.css`: cam `#ed603b`, chữ `#3d4935`, chữ phụ `#949d89`, nền `#fafaf6`.
- `frontend/style.css`: body 14px; nhiều nhãn 9–11px; màu, spacing và một số style còn nằm rải rác trong CSS/HTML template.
- `frontend/app.js`: shell chung ở `shell()`, luồng mua sắm ở `home()`, `searchPage()`, `productPage()`, `cartPage()`, `checkoutPage()`; quản lý ở `workspacePage()` và các hàm theo scope.
- Luồng hiện có gồm khách mua, người bán và admin; cùng các trạng thái loading/empty/error, đăng nhập, thông báo, chat, voucher và kết quả thanh toán. Thiết kế phải bao phủ các trạng thái này.
- Kiểm tra local dùng database SQLite thử nghiệm 12 sản phẩm seed, key dịch vụ ngoài đã tắt. Đây là fixture khảo sát, không phải số lượng catalog Production.
- Ở viewport 1280px: body 14px, header khoảng 132px; sản phẩm đầu tiên trên homepage bắt đầu ở Y≈912px; đếm được 116 phần tử chữ hiển thị nhỏ hơn 12px. Đây là đo một viewport/trang, không phải audit toàn bộ website.
- Tính từ cặp màu khai báo: chữ phụ trên nền khoảng **2,70:1**; trắng trên cam hiện tại khoảng **3,31:1**. Cần kiểm tra lại từng vị trí bằng màu thực khi render; không coi đây là kết quả kiểm định accessibility toàn site.
- Ảnh mốc local: `artifacts/redesign-before-home-local-20261023.png`. Chưa có ảnh “sau” vì chưa thay giao diện.

## Hướng thiết kế đề xuất

**Một sàn mua sắm màu cam, rõ giá, dễ tìm, sản phẩm là trọng tâm.**

Người dùng chính là người mua Việt Nam dùng điện thoại; tác vụ đầu tiên là tìm và xem sản phẩm, tiếp theo là chọn biến thể, thêm giỏ và đặt hàng. Người bán/admin cần màn hình gọn, đọc được số liệu và thao tác rõ ràng.

Chất liệu sẵn có: ảnh/thumb sản phẩm demo, tên/danh mục/giá từ API C++, logo hiện tại và các trạng thái đơn thực của hệ thống. Không bổ sung số bán, thương hiệu đối tác, đánh giá hoặc countdown giả.

Taste draw với seed `20261023`, sector `ecommerce`, giữ palette, có product-photo/product-ui đã đưa ra hai hướng phù hợp bộ lọc: `pinned-poster` và `hero-object`. Đề xuất tham khảo **hero-object** cho khối sản phẩm nổi bật trên homepage: ảnh hàng rõ, lớn, gắn ngay với danh mục/đường xem hàng. Không chọn pinned-poster vì giữ nội dung qua nhiều màn cuộn làm chậm tác vụ mua sắm. Đây là hướng sơ bộ; chưa khóa hệ thống hoặc nhận xét bản mới đã đẹp/đã qua lint.

Hallmark dùng nhánh redesign giữ nhận diện hiện có: xây hệ token, bảo toàn wiring rồi so sánh trước/sau. Những yêu cầu chỉ dành cho landing page không áp cho bảng, bộ lọc và checkout.

### Màu, chữ và nhịp bố cục

| Thành phần | Đề xuất ban đầu |
| --- | --- |
| Cam nhận diện | Giữ `#ed603b` cho logo và điểm nhấn |
| Cam nút chính | `#c2410c` khi dùng chữ trắng; tương phản tính toán khoảng 5,18:1 |
| Chữ chính / phụ | `#18181b` / `#52525b`; chữ phụ trên trắng khoảng 7,73:1 |
| Nền / bề mặt | `#f5f5f5` / `#ffffff`, viền trung tính nhẹ |
| Font | Một sans hỗ trợ tiếng Việt; trước hết dùng system stack hiện tại, chọn font tự host chỉ khi bản thử cho thấy cải thiện rõ |
| Chữ nội dung | 15–16px; nhãn 13–14px; số tiền dùng tabular numbers |
| Tiêu đề | Rõ nội dung, tối đa hai dòng; màn quản lý dùng cỡ nhỏ hơn homepage |
| Khoảng cách | Thang 4/8px; lề mobile 16px; container desktop thống nhất |
| Điều khiển | Vùng chạm mobile tối thiểu 44px; focus hiện rõ; đủ hover/pressed/disabled/loading/error/success |
| Chuyển động | Phản hồi nhẹ bằng opacity/transform; có reduced-motion; sản phẩm và giá không chờ animation mới xuất hiện |

Đây là đề xuất để thử tại local, chưa sửa các token đang chạy. Tương phản phải đo cả hover, disabled, trạng thái lỗi và focus.

## Bố cục theo nhóm trang

| Nhóm | Thay đổi dự kiến | Phần phải giữ |
| --- | --- | --- |
| Header và footer | Search nổi bật, navigation ngắn; mobile gom thao tác và giảm chiều cao; footer gọn theo tác vụ | Link hiện có, giỏ, tài khoản, seller, thông báo/chat |
| Homepage | Rút phần mở đầu, dùng ảnh sản phẩm làm điểm nhấn; danh mục và lưới hàng lên sớm; giảm các nhãn trang trí | Bộ sưu tập, danh mục, bộ lọc gợi ý và đường tới shop/sản phẩm |
| Danh sách/tìm kiếm | Tên, giá và ảnh dễ đọc; bộ lọc mobile mở thành sheet; desktop có sidebar; pagination gọn, vẫn tới mọi trang | Query tìm kiếm/danh mục/giá/sắp xếp, ID, 600 sản phẩm và route phân trang |
| Chi tiết sản phẩm/shop | Cân lại tỷ lệ ảnh/thông tin; biến thể, tồn kho, số lượng và hành động mua rõ; mobile có vùng hành động dễ chạm | Giá/kho lấy từ server, favorite, shop, đánh giá, chat, thêm giỏ/mua ngay |
| Giỏ và checkout | Nhóm theo shop dễ hiểu; tổng tiền nổi bật, hành động chính rõ; trạng thái tính lại/loading/error nhất quán | Tách đơn theo shop, voucher, địa chỉ, quote server, COD/payOS, khóa chống gửi trùng |
| Kết quả thanh toán/đơn mua | Trạng thái và bước tiếp theo rõ; timeline đơn dễ đọc; phân biệt đang chờ/đã trả/hủy/thất bại | Polling/webhook, order ID, trả hàng, hoàn tiền, xác nhận nhận hàng hiện có |
| Auth/tài khoản/chat/voucher | Form gọn, nhãn và lỗi sát trường; danh sách/tabs thống nhất | Tên field, validation, session/CSRF, các API và handler |
| Seller/admin | Shell riêng gọn; bảng có mật độ phù hợp, số canh phải; mobile chuyển hàng bảng sang dạng dễ đọc hoặc cuộn trong khung | Quyền theo scope, CRUD, duyệt shop, trạng thái đơn, nhập demo, upload, audit, cài đặt |

## Kế hoạch theo vòng

### Vòng 1 — hệ giao diện và ba trang để duyệt hướng

1. Ghi mốc route/form/field/selector/handler hiện tại; chụp trước ở desktop/tablet/mobile.
2. Thống nhất token, chữ, button, input, badge, dialog, thông báo lỗi/loading/empty và thẻ sản phẩm.
3. Thiết kế local **homepage, danh sách sản phẩm và chi tiết sản phẩm**, dùng dữ liệu thử nghiệm riêng.
4. Chụp trước/sau ở 1440, 768 và 390px, kèm bản xem localhost. Gửi chủ dự án duyệt màu, chữ, mật độ sản phẩm và trải nghiệm điện thoại.

Đầu ra vòng này là giao diện thật chạy local và ảnh so sánh; chưa push hoặc deploy. Chỉnh tiếp tại máy theo phản hồi.

### Vòng 2 — hoàn thiện hành trình người mua

Áp hệ đã thống nhất vào shop, giỏ, checkout, kết quả payOS/COD, đơn mua/chi tiết đơn, yêu thích, tài khoản, auth, chat, voucher và thông báo. Kiểm tra form/CTA trên database test; dùng adapter/key test hoặc chế độ chưa cấu hình, không thanh toán thật để thử CSS.

### Vòng 3 — người bán và quản trị

Làm shell quản lý, dashboard, sản phẩm/biến thể, đơn, shop, người dùng, thanh toán/hoàn tiền, review, voucher, outbox, audit và cài đặt. Đọc đầy đủ hướng dẫn app-screen của Taste khi bắt đầu nhóm này. Số liệu lấy từ API, không dựng biểu đồ hoặc chỉ số giả để lấp bố cục.

### Vòng 4 — nghiệm thu local

- Kiểm tra rộng 320/360/390/768/1024/1280/1440/1920px; không tràn ngang hoặc nút bị che.
- Kiểm tra bàn phím/focus, nội dung dài tiếng Việt, tiền VNĐ, hết hàng, chưa đăng nhập, lỗi mạng và dữ liệu rỗng.
- Dùng bộ kiểm tra tĩnh của hai skill; kiểm tra trình duyệt qua CUA theo công cụ được phép. Không tuyên bố `sloplint --render`/`inspect.mjs` đạt nếu chưa chạy được bộ đó; ghi riêng kiểm tra tự động và kiểm tra thực tế.
- So sánh route/form/field/handler trước/sau; giữ `id`, `name`, `data-form`, `data-action`, `data-id`, selector và đường API. Pagination thu gọn phải bảo toàn khả năng đi tới mọi trang, dù số liên kết đang hiển thị thay đổi.
- `npm run check`, `npm run build`, `npm run secrets:check`; chạy lại API test trên database riêng nếu sửa template/handler có thể ảnh hưởng thao tác. Không chỉnh test để hợp thức hóa lỗi thiết kế.
- So sánh bundle, số request và tốc độ với mốc trước. Không thêm framework, UI kit hoặc animation library để làm lại những thành phần HTML/CSS sẵn có.
- Gửi URL local, ảnh trước/sau, danh sách file thay đổi và các điểm còn cần duyệt. **Chỉ sau khi chủ dự án xác nhận giao diện và cho phép push mới thực hiện commit/push.**

## File dự kiến tác động

| File | Phạm vi |
| --- | --- |
| `frontend/tokens.css` | Hệ màu/chữ/khoảng cách/radius/focus chung |
| `frontend/style.css` | Bố cục và responsive; thay từng nhóm thay vì chồng CSS override không kiểm soát |
| `frontend/app.js` | Markup/template và tương tác hiển thị cần thiết; giữ wiring, không chuyển nghiệp vụ từ C++ sang JS |
| `frontend/index.html` | Metadata, font local nếu cần và phần khởi động dễ đọc |
| `frontend/public/assets/` | Chỉ bổ sung asset có nguồn/quyền rõ nếu cần; kiểm tra lại thư mục thật trước khi thêm |
| `design.md` (mới, khi đã thống nhất hướng) | Ghi hệ thống thiết kế dùng chung cho toàn bộ trang |
| `artifacts/` và `.cache/` | Ảnh, dữ liệu test, snapshot/lint/QA local, không đưa vào bundle |

Không dự kiến xóa file, route hoặc component tree. Không cần sửa schema, C++ business logic, key, Vercel hoặc dữ liệu Production để thay giao diện.

## Những thứ chủ dự án cần chuẩn bị

- Không cần key mới hoặc tài khoản dịch vụ mới cho giai đoạn thiết kế.
- Có thể bổ sung logo/font/ảnh banner có quyền sử dụng nếu muốn nhận diện riêng; trước mắt dùng chất liệu hiện có.
- Khi xem vòng 1, tập trung góp ý ba điểm: mức độ giống sàn mua sắm mong muốn, độ đậm/rõ của màu cam và mật độ sản phẩm trên mobile. Các vòng sau giữ hệ đã chọn.

## Trạng thái khi lập kế hoạch

- Skill đã cài và đọc; source/route/token đã khảo sát, bản gốc local C++/SQLite đã mở được để ghi mốc.
- Chỉ thêm tài liệu kế hoạch vào checkout; bốn file frontend hiện tại chưa chỉnh sửa.
- Chưa chạy vòng thiết kế/kiểm tra bản mới, chưa có kết quả lint giao diện mới hoặc điểm chấm thiết kế mới.
- **Không commit, push, tạo PR hoặc deploy trong lượt này.**

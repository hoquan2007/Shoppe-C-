# Kế hoạch phần mềm Shoppe-C-

Ngày lập: 17/10/2026. Cập nhật: đã có implementation local với C++20/HTML/CSS/JS, build và bộ kiểm thử API đã chạy trên SQLite/PostgreSQL. Vercel, Supabase Storage, payOS thật và email thật còn chờ cấu hình/xác minh theo [DEPLOYMENT.md](DEPLOYMENT.md). Các mục dưới đây giữ lại bản kế hoạch ban đầu; lựa chọn triển khai thực tế và khác biệt xem [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Yêu cầu đã xác nhận

- Bài tập lớn OOP, có demo thanh toán thật; phát triển phần mềm trước.
- Sàn nhiều người bán: người dùng đăng ký mở shop, có khu quản lý riêng.
- Frontend HTML/CSS/JavaScript; nghiệp vụ chính chạy bằng C++ phía server.
- Toàn bộ frontend và backend triển khai trên Vercel Hobby/Free.
- Được dùng database và kho ảnh có gói miễn phí bên ngoài.
- Tiếng Việt, tiền VNĐ, giao diện màu cam, hỗ trợ điện thoại và máy tính.
- Thanh toán online về một tài khoản ngân hàng của chủ dự án; hỗ trợ COD.
- Admin cập nhật vận chuyển để demo; không cần kết nối hãng vận chuyển thật.
- Admin thực hiện hoàn tiền thủ công rồi ghi nhận kết quả trong hệ thống.
- Có biến thể sản phẩm, tồn kho, voucher, đánh giá, yêu thích, chat, thông báo email và dashboard.
- Hiện chủ dự án chỉ có tài khoản Cas ID, chưa thiết lập kênh payOS.

Nguồn bài tập: [bảng đề tài và yêu cầu chung](https://docs.google.com/spreadsheets/d/1OL_2gIoXzPsXK1M--sAkGPLUxhxAyQglm4ZNNoJvoks/edit?gid=1369201084#gid=1369201084).
Đề tài tương ứng: ĐT08. Bảng ghi hạn 01/11/2026; người dùng chưa xác nhận lại hạn riêng.
Các yêu cầu học phần về UML, GitHub, Jira, LaTeX và slide được ghi nhận; kế hoạch này tập trung phần mềm, tài liệu chạy và thiết kế kỹ thuật phục vụ phần mềm.

## 2. Lựa chọn triển khai đề xuất

Các lựa chọn dưới đây là đề xuất kỹ thuật/chính sách mặc định, không phải chi tiết người dùng đã xác nhận riêng.

| Phần | Lựa chọn | Trách nhiệm |
| --- | --- | --- |
| Giao diện | HTML/CSS/JavaScript, Vite để phát triển và build | Hiển thị, tương tác, gọi API; không quyết định giá/quyền/trạng thái giao dịch |
| Backend | C++20, Drogon, CMake | Xác thực, phân quyền, sản phẩm, giá, voucher, kho, đơn hàng, thanh toán, chat, thống kê |
| Triển khai | Vercel Container Runtime | Chạy HTTP server C++; phân phối bản frontend đã build cùng ứng dụng ở giai đoạn đầu để giữ cùng origin |
| Dữ liệu | Supabase PostgreSQL Free | Dữ liệu bền vững, giao dịch SQL, ràng buộc, khóa hàng khi cần |
| Ảnh | Supabase Storage Free | Ảnh sản phẩm/shop; quyền upload được backend kiểm tra |
| Online | payOS HTTP API | Tạo yêu cầu thanh toán, xác minh thông báo và đối soát |
| Email | Nhà cung cấp SMTP cấu hình qua biến môi trường | Xác minh email, khôi phục mật khẩu, xác nhận đơn và thay đổi trạng thái |
| Chat | Lưu PostgreSQL, lấy tin mới định kỳ khi mở cuộc hội thoại | Chat người mua và shop, trạng thái đã đọc; không giữ dữ liệu chỉ trong RAM |

Theo tài liệu Vercel tại thời điểm khảo sát, Container Runtime đang Beta trên mọi gói. Chưa có bản triển khai trên tài khoản của chủ dự án để xác nhận hoạt động thực tế. Phải vượt qua mốc kiểm chứng triển khai trước khi xây đầy đủ.

Không dùng file trong container làm database hoặc kho ảnh. Tiến trình có thể dừng/khởi động lại và có nhiều instance. Phiên đăng nhập, giới hạn truy cập, khóa tồn kho và thông tin thanh toán cần dùng dữ liệu chia sẻ bền vững.

## 3. Vai trò và màn hình

### Khách và người mua

- Trang chủ: tìm kiếm, danh mục, sản phẩm nổi bật và khuyến mãi lấy từ dữ liệu thật.
- Danh sách/tìm kiếm: lọc danh mục, shop, khoảng giá, sắp xếp và phân trang.
- Chi tiết sản phẩm: ảnh, mô tả, biến thể size/màu, giá, tồn kho, đánh giá, shop và chat.
- Trang shop công khai: thông tin, danh mục và sản phẩm của shop.
- Đăng ký, đăng nhập email/mật khẩu, xác minh email, quên/đặt lại mật khẩu.
- Hồ sơ, sổ địa chỉ, địa chỉ mặc định và danh sách yêu thích.
- Giỏ hàng nhóm theo shop; chọn mặt hàng cần mua, số lượng và voucher.
- Checkout: địa chỉ, phí ship từng shop, tổng tiền, COD hoặc payOS.
- Trang thanh toán và kết quả: chờ xác nhận, thành công, hủy, hết hạn và cần xử lý.
- Danh sách/chi tiết đơn, lịch sử trạng thái, xác nhận nhận hàng, yêu cầu hủy/trả hàng, mua lại.
- Đánh giá sau khi nhận hàng, chat và thông báo trong website/email.

### Người bán

- Đăng ký mở shop; theo dõi kết quả duyệt.
- Dashboard shop: đơn, doanh thu, sản phẩm bán chạy và tồn kho thấp.
- Hồ sơ shop, địa chỉ lấy hàng và ảnh đại diện.
- Thêm/sửa/ẩn sản phẩm, biến thể, ảnh, danh mục và tồn kho.
- Quản lý voucher của shop theo thời gian, điều kiện và số lượt.
- Danh sách/chi tiết đơn thuộc shop, xác nhận/chuẩn bị hàng, đề nghị hủy và xử lý yêu cầu trả hàng trong phạm vi quyền.
- Chat với người mua, xem đánh giá, xuất/nhập sản phẩm và xuất đơn hàng.

### Admin

- Dashboard toàn sàn: doanh thu, đơn, thanh toán, tỷ lệ giao thành công/hoàn hàng.
- Duyệt/khóa shop, quản lý người dùng và phân quyền.
- Quản lý danh mục, sản phẩm vi phạm, banner và voucher toàn sàn.
- Quản lý đơn, cập nhật trạng thái giao hàng giả lập và xem lịch sử thao tác.
- Đối soát thanh toán, xử lý tiền về muộn/không khớp và ghi nhận hoàn tiền thủ công.
- Quản lý trả hàng, kiểm duyệt đánh giá, xuất báo cáo CSV.
- Cấu hình phí vận chuyển và các chính sách demo; xem lỗi email và gửi lại.

## 4. Chính sách nghiệp vụ mặc định

- Một tài khoản có thể vừa mua hàng vừa sở hữu một shop. Admin cấp bằng công cụ quản trị/seed, không qua đăng ký công khai.
- Shop cần admin duyệt trước khi bán. Người bán chỉ truy cập dữ liệu của shop mình.
- Mặc định chưa thu hoa hồng; doanh thu từng shop là số liệu ghi nhận. Không tự chuyển tiền hoặc chi trả cho người bán.
- Phí ship tính theo vùng và khối lượng bằng bảng phí cấu hình. Không tuyên bố đây là báo giá thật của GHN/GHTK/ViettelPost.
- Mỗi đơn shop dùng tối đa một voucher shop; mỗi lượt checkout dùng tối đa một voucher toàn sàn. Backend phân bổ giảm giá toàn sàn vào các dòng hàng theo quy tắc làm tròn cố định để hỗ trợ hoàn tiền từng phần.
- Có thể hủy trước khi bàn giao vận chuyển; đơn đã trả tiền chuyển sang quy trình hoàn tiền khi hủy được duyệt. Đề xuất cửa sổ yêu cầu trả hàng là 7 ngày sau giao thành công, cấu hình được.
- Đánh giá chỉ dành cho mặt hàng đã nhận; mỗi dòng mua hàng có một đánh giá có thể sửa. Chat ban đầu hỗ trợ nội dung văn bản.
- Dữ liệu mẫu là hàng hóa/địa chỉ minh họa, không chứa thông tin cá nhân thật. Tên dự án tạm giữ Shoppe-C-, giao diện lấy cảm hứng màu sắc/quy trình Shopee và dùng nhận diện riêng.

## 5. Luồng đơn hàng, tiền và tồn kho

### Một giỏ nhiều shop

Một lượt checkout tạo một nhóm mua hàng, các đơn con theo shop và một nghĩa vụ thanh toán chung. Người mua có thể thanh toán tổng tiền online một lần; từng shop chỉ thấy đơn và doanh thu thuộc mình. COD theo dõi thu tiền riêng từng đơn con.

Giá, voucher, phí ship và tổng tiền được C++ tính lại từ database. Lưu snapshot tên sản phẩm, biến thể, đơn giá, giảm giá và địa chỉ trên đơn. Tiền dùng số nguyên đồng; backend không nhận tổng tiền từ frontend làm nguồn quyết định.

### Các trạng thái độc lập

- Giao hàng: mới/chờ xác nhận -> xác nhận -> chuẩn bị hàng -> đang giao -> giao thành công -> hoàn tất; các nhánh hủy và giao thất bại được kiểm soát riêng.
- Thanh toán online: chưa thanh toán -> chờ xử lý -> đã thanh toán; có hết hạn và cần đối soát.
- COD: chưa thu -> đã thu, do admin cập nhật theo kịch bản demo; giao thành công không tự chứng minh đã thu tiền.
- Trả hàng: yêu cầu -> duyệt/từ chối -> nhận lại hàng -> đóng yêu cầu.
- Hoàn tiền: cần hoàn -> đang xử lý -> đã hoàn, ghi rõ số tiền, ngày, tham chiếu và admin thực hiện; hỗ trợ một phần/toàn bộ trong giới hạn còn được hoàn.

Tổng hợp trạng thái nhóm mua hàng từ các đơn con; một shop giao xong không làm toàn bộ nhóm tự hoàn tất. Trạng thái quá hạn, giao thất bại, trả hàng và hoàn tiền phải hiển thị rõ cho cả ba vai trò.

### Tính nhất quán

- Giữ tồn kho khi tạo checkout online, thời hạn đề xuất 15 phút; COD trừ tồn khả dụng ngay khi đặt đơn thành công.
- Dùng transaction và khóa/ràng buộc database để hai người không cùng mua số lượng cuối; voucher cũng kiểm soát lượt dùng đồng thời.
- Giải phóng giữ hàng hết hạn bằng thao tác nguyên tử trong database. Kiểm tra khi tạo đơn/truy cập đơn và có công cụ dọn định kỳ; tính đúng không phụ thuộc cron chạy mỗi phút.
- Ghi nhận thanh toán có xác minh phía server: kiểm tra chữ ký, mã đơn, số tiền, nguồn sự kiện và chống xử lý trùng. URL quay về chỉ phục vụ giao diện, không tự đổi đơn thành đã trả tiền.
- Nếu API tạo thanh toán timeout, tra cứu/đối soát cùng mã trước khi tạo lượt mới để tránh yêu cầu thu trùng.
- Nếu tiền về sau khi đơn hết hạn/hủy và tồn kho đã giải phóng, đánh dấu cần đối soát/hoàn tiền; không tự khôi phục đơn hoặc bán vượt kho.
- Thao tác đặt hàng, webhook, giải phóng hàng và ghi hoàn tiền phải có khả năng chống lặp. Không giữ transaction SQL mở trong lúc chờ API bên ngoài.
- Lưu lịch sử trạng thái và thao tác nhạy cảm. Xóa/ẩn sản phẩm không phá lịch sử mua hàng.

## 6. Thiết kế C++ và dữ liệu

Phân lớp dự kiến: HTTP controllers/filters -> application services -> domain -> repositories và adapters tích hợp. Tách interface `.h` và implementation `.cpp`; lớp nghiệp vụ không phụ thuộc HTTP hoặc giao diện.

- Strategy: `IPaymentMethod` với COD/payOS; `IShippingFeePolicy` và các chính sách tính phí demo.
- State: trạng thái đơn và các chuyển tiếp hợp lệ; phân quyền được kiểm tra cùng chuyển tiếp ở service.
- Repository interfaces: người dùng, shop, sản phẩm, đơn, thanh toán và kho; cài đặt PostgreSQL, hỗ trợ fake repository cho kiểm thử.
- Exception nghiệp vụ: hết hàng, voucher không hợp lệ, chuyển trạng thái sai, không có quyền và lỗi cổng thanh toán.
- RAII cho tài nguyên/transaction; virtual destructor ở interface, smart pointers theo quyền sở hữu.
- Dùng ngữ nghĩa giá trị và Rule of Zero theo mặc định. Với yêu cầu học phần Rule of Five, chọn đối tượng snapshot sở hữu dữ liệu phù hợp để minh họa đủ copy/move/gán và kiểm thử độc lập; không thêm raw pointer chỉ để minh họa.
- Lớp giá trị tiền có phép gán/cộng/so sánh kiểm soát tràn; hàm thuần ảo cho thanh toán và phí ship.
- CSV nhập/xuất có kiểm tra header, UTF-8, kiểu dữ liệu, lỗi từng dòng và chống công thức độc hại khi mở bằng bảng tính. Có chế độ xem trước trước khi nhập thay đổi hàng loạt.

Nhóm bảng dự kiến: users, sessions, email_tokens, addresses, shops, seller_applications, categories, products, product_variants, product_images, inventory_reservations, stock_movements, carts, cart_items, vouchers, voucher_redemptions, checkout_groups, orders, order_items, order_status_history, payments, payment_events, returns, return_items, refunds, refund_allocations, reviews, wishlist_items, conversations, messages, notifications, email_outbox, audit_logs, settings.

Tất cả truy cập dùng truy vấn có tham số, ràng buộc khóa ngoại và chỉ mục theo truy vấn thực tế. Mật khẩu băm Argon2id; phiên đăng nhập lưu bền vững, cookie HttpOnly/Secure/SameSite và bảo vệ CSRF. Token xác minh/khôi phục một lần có hạn dùng, lưu dạng băm; rate limit chia sẻ qua database. Không dùng session chỉ trong RAM của server.

Khóa database, Storage, SMTP và payOS chỉ nằm ở backend/biến môi trường. File ví dụ chỉ chứa placeholder. Không ghi khóa, mật khẩu hoặc nội dung thanh toán nhạy cảm vào log.

## 7. Các giai đoạn và điều kiện hoàn thành

| Mốc | Công việc | Điều kiện hoàn thành |
| --- | --- | --- |
| 0. Kiểm chứng triển khai | C++20 HTTP tối thiểu, build container, frontend mẫu, kết nối database, routing Vercel | Trên tài khoản Hobby thực tế: trang frontend và API C++ hoạt động, ghi/đọc database tồn tại sau khởi động lại. Nếu không đạt, báo rõ trở ngại và thống nhất phương án vẫn giữ ràng buộc hosting/C++; chưa xây đầy đủ trên giả định chưa kiểm chứng |
| 1. Nền tảng | Sơ đồ lớp/luồng kỹ thuật, SQL migrations, seed, auth email/mật khẩu, phiên, phân quyền, layout responsive | Người mua/người bán/admin đăng nhập và bị chặn đúng phạm vi; database khởi tạo lại được; token/email chạy khi cấu hình provider |
| 2. Shop và sản phẩm | Đăng ký/duyệt shop, CRUD sản phẩm/biến thể/ảnh/kho, danh mục, tìm kiếm, yêu thích, CSV | Admin duyệt shop; seller đăng hàng; buyer tìm/mở sản phẩm; seller không sửa hàng shop khác; CSV xem trước và nhập hợp lệ |
| 3. Mua hàng COD | Giỏ nhiều shop, voucher/phí ship, checkout, lịch sử đơn, kiểm soát tồn kho và chuyển trạng thái | Đặt một giỏ hai shop thành hai đơn; tổng tiền chính xác; không bán vượt kho; admin demo vận chuyển và thu COD độc lập |
| 4. Thanh toán online | Adapter payOS, chữ ký/webhook, trang kết quả, hết hạn, tra cứu, đối soát | Kiểm thử sự kiện giả lập được phân biệt rõ; khi có kênh thật, người dùng hoàn tất giao dịch thật và server đối soát thành công; webhook trùng/sai không gây sai dữ liệu |
| 5. Hậu mãi và tương tác | Hủy/trả hàng/hoàn tiền thủ công, đánh giá, chat, thông báo/email, dashboard | Hoàn tiền không vượt tiền đã thu; trả hàng liên kết mặt hàng đúng; chat đúng quyền; số liệu từng shop/toàn sàn khớp dữ liệu đơn và hoàn tiền |
| 6. Hoàn thiện và bàn giao | Kiểm thử tích hợp/E2E, responsive, bảo mật nghiệp vụ, build/CI, README, dữ liệu/kịch bản demo, cấu hình deploy | Các luồng chính chạy trên Vercel, có hướng dẫn tái tạo và giới hạn xác minh được ghi rõ; không gắn nút rỗng hoặc giả thành công cho tính năng bắt buộc |

Các mốc là thứ tự phụ thuộc, không phải cắt giảm phạm vi đã xác nhận. Chưa cam kết thời lượng trước khi qua mốc triển khai và có tài khoản tích hợp.

## 8. Kiểm thử trọng tâm

- C++ unit tests cho tính tiền/làm tròn, voucher, phí ship, chuyển trạng thái, copy/move và quy tắc hoàn tiền.
- Database integration tests cho transaction, tranh chấp số lượng cuối, voucher giới hạn lượt, chống lặp và rollback.
- API tests cho phân quyền từng shop, session/CSRF, payload không hợp lệ, sửa giá từ trình duyệt và upload ảnh.
- Payment tests cho chữ ký sai, mã/số tiền sai, thông báo trùng/đến sai thứ tự, timeout, tiền về muộn và hoàn một phần.
- E2E cho mua COD, mua online, giỏ hai shop, hủy một đơn con, trả hàng/hoàn tiền, seller thêm hàng, admin duyệt shop và cập nhật vận chuyển.
- Kiểm tra giao diện điện thoại/máy tính: loading, rỗng, lỗi, hết hàng, hết hạn và thao tác lặp.
- Build Linux/container dùng cùng cấu hình triển khai; kiểm tra sanitizer phù hợp với C++ trước bàn giao.

## 9. Điều kiện dịch vụ bên ngoài

- Tài khoản Vercel có thể triển khai dự án; cần xác minh quyền sử dụng Container Runtime thực tế. Máy hiện tìm thấy Node, CMake và compiler C++; chưa tìm thấy Docker CLI trong PATH khi khảo sát.
- Tạo Supabase project và bucket ảnh; cấu hình database/Storage server-side. Không tạo dịch vụ trả phí tự động.
- Với payOS: đăng ký/đăng nhập, xác minh cá nhân hoặc doanh nghiệp, liên kết ngân hàng, tạo kênh thanh toán, lấy Client ID/API Key/Checksum Key và cấu hình webhook. Người dùng hoàn tất các bước tài khoản/định danh; khóa điền vào môi trường, không cần dán vào chat.
- Cần nhà cung cấp email và địa chỉ gửi hợp lệ để kiểm chứng email thật. Lỗi gửi mail không được làm mất đơn đã tạo; dùng outbox bền vững, retry có giới hạn, trạng thái thất bại và nút gửi lại. Cơ chế xử lý nền sẽ kiểm chứng ở mốc 0/1 theo khả năng gói Free; không dựa vào thread trong container sống mãi hoặc cron tần suất cao chưa được hỗ trợ.
- Thử giao dịch thật sau khi có đủ cấu hình; không báo hoàn thành thanh toán thật chỉ vì giao diện trả về thành công hoặc test giả lập đã qua.

## 10. Tài liệu kỹ thuật đã đối chiếu

- [Vercel Container Runtime](https://vercel.com/docs/functions/runtimes/container)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Vercel Cron usage/pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Drogon C++ framework](https://github.com/drogonframework/drogon)
- [Supabase plans/billing](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [Cas ID và hệ sinh thái](https://cas.so/cas-id/)
- [payOS bắt đầu](https://payos.vn/docs/)
- [payOS API và điều kiện tích hợp](https://payos.vn/docs/api/)

Tài liệu nhà cung cấp được kiểm tra ngày 17/10/2026; Beta, hạn mức và điều kiện tài khoản cần kiểm tra lại khi triển khai.

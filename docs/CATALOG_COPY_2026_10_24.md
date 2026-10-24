# Biên tập catalog tiếng Việt — 24/10/2026

Đã cập nhật **600/600 sản phẩm Production** tại https://shoppec.vercel.app bằng công cụ C++20. Tên và mô tả mới dựa trên **177 mẫu gốc DummyJSON**, dùng chung nội dung cho các bản ghi mở rộng có chung mẫu/ảnh. Không biến dữ liệu này thành 600 mặt hàng nguồn độc lập.

## Nội dung

- Tên tiếng Việt theo loại sản phẩm, thương hiệu/model và màu hoặc kiểu dáng có căn cứ; bỏ hậu tố “Mẫu demo”. Ví dụ: “Green Chili Pepper · Mẫu demo 1” → “Ớt xanh dùng nấu ăn”, “Apple MacBook Pro 14 Inch Space Grey” → “Laptop Apple MacBook Pro 14 inch màu xám”.
- Mỗi mẫu có nội dung giới thiệu và hướng dẫn lựa chọn, sử dụng hoặc bảo quản riêng. Giữ dấu tiếng Việt và cấu trúc đoạn văn trong trang chi tiết.
- Không tự thêm dung tích, RAM, bộ nhớ, xuất xứ, chứng nhận chính hãng, bảo hành, công dụng y tế hoặc đánh giá. Những trường chưa được nguồn xác nhận cần shop bổ sung nếu chuyển sang bán hàng thật.
- Cờ `is_demo`, nguồn và lời ghi nhận ảnh DummyJSON được giữ. Dữ liệu vẫn là mô phỏng của bài tập, không cung cấp hàng thật; cảnh báo giao dịch payOS dùng tiền thật tiếp tục có trong mô tả.
- Giữ nguyên toàn bộ ảnh, ID, danh mục, giá, biến thể, tồn kho, trọng lượng, trạng thái và lịch sử. Nội dung đơn hàng cũ không bị viết lại.

## Dữ liệu và C++

- `database/catalog-copy.vi.tsv`: 177 dòng nội dung biên tập, một dòng/mẫu gốc.
- `database/catalog-copy.vi.json`: tài liệu runtime cùng ảnh/tên nguồn làm điều kiện đối chiếu; đóng gói trong image backend qua thư mục database hiện có.
- `scripts/prepare-catalog-copy.mjs`: chuyển bản biên tập thành JSON, kiểm tra phủ đủ mẫu nguồn. Chỉ chạy với snapshot **trước khi biên tập**, không lấy tên đã dịch làm tên nguồn mới. JavaScript không thực hiện nghiệp vụ ghi catalog.
- `backend/src/catalog_copy.cpp`: C++ kiểm tra kế hoạch, nguồn, ảnh, mã và nội dung trước/sau; phát hiện chỉnh sửa đồng thời; cập nhật theo batch với SQL bind parameters trong một transaction. Chỉ cột payload được ghi, hai trường JSON được thay đổi là `name` và `description`.
- `catalog_copy --preview snapshot.json plan.json`: tạo kế hoạch, không ghi DB.
- `catalog_copy --apply plan.json backup.json`: đọc kết nối từ môi trường tiến trình, kiểm tra schema hiện có, sao lưu trước khi ghi, áp dụng và kiểm tra các trường còn lại trước commit. Không chạy migration/seed và không đọc tự động file `.env`. Không in chi tiết kết nối khi có lỗi. Backup phải là đường dẫn mới trong thư mục ignored.
- Import demo bằng C++ dùng nội dung đã duyệt chỉ khi cả ID nguồn, tên gốc và ảnh khớp. Nguồn thay đổi hoặc mẫu chưa biên tập sẽ dùng hành vi cũ; không tự gán mô tả cho một ảnh khác. Import lặp vẫn bỏ qua hàng đã có, giữ sửa đổi của admin và tồn kho.

## Kiểm chứng

- CTest **6/6 nhóm** qua, gồm các ca mới: đủ 600 kế hoạch, mất nội dung nguồn thì từ chối, xung đột ở bản ghi sau không làm thay đổi bản ghi trước, chỉ sửa tên/mô tả, chạy lặp không đổi dữ liệu và bảo toàn biến thể/giá/kho.
- API hồi quy **18/18 SQLite**, **18/18 PostgreSQL** trên database test riêng. Lần chạy với DB PostgreSQL test cũ có dữ liệu dư không được dùng làm kết quả; tạo DB local mới rồi chạy lại toàn bộ thành công.
- Công cụ C++ đã cập nhật 600 dòng trong bản sao SQLite và kiểm tra hash/nội dung biến thể không đổi. PostgreSQL local: cập nhật 30 fixture, chạy lại bỏ qua 30/30, biến thể không đổi.
- Production: C++ báo **updated=600, skipped=0**, tổng thời gian tiến trình khoảng **5,2 giây** (gồm kết nối/kiểm tra/sao lưu). Không tạo đơn hoặc gọi API thanh toán.
- Đọc lại đủ 600 sản phẩm qua 13 trang API: **600/600 tên/mô tả khớp kế hoạch**, mọi trường công khai khác và biến thể bằng snapshot cũ; không còn hậu tố “Mẫu demo”. SQL độc lập xác nhận 600 mô tả mới và 600 cờ demo được giữ.
- API tìm “hành tây đỏ” trả đúng ba bản ghi dùng chung mẫu; phân trang mặc định vẫn 12 sản phẩm. JSON trang đầu khoảng **18.202 byte sau giải nén**, không quay lại tải toàn catalog.
- Browser Production xác nhận tên laptop, mô tả, nhãn minh họa và ảnh hiển thị đúng; không thấy lỗi/warning console trong trang đã kiểm tra. Trình duyệt không truy cập được local trong phiên này; xác minh giao diện dùng Production công khai, còn local kiểm tra qua C++/API.

## Sao lưu và hoàn tác

Các file dưới `artifacts/catalog-copy/` được Git ignore: snapshot công khai trước/sau, kế hoạch, bản sao chính xác các payload Production và kế hoạch ngược `rollback-plan.json`. Không chứa credential; không commit snapshot DB. Kiểm tra secret cho mã/dữ liệu biên tập trước khi push.

Nếu cần hoàn tác nội dung: dùng công cụ C++ áp dụng `rollback-plan.json` với một tên backup mới. Công cụ chỉ khôi phục tên/mô tả và từ chối nếu chúng đã được sửa tiếp; không phục hồi toàn DB hay làm thay đổi các giao dịch phát sinh sau đó. Không chạy hoàn tác như một phần kiểm thử Production.

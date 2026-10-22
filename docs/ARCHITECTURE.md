# Kiến trúc phần mềm

## Luồng xử lý

Frontend chỉ hiển thị và gửi lựa chọn của người dùng. `Application` xác thực session/CSRF, kiểm tra quyền sở hữu, tính tiền và điều phối nghiệp vụ C++. `Repository` ánh xạ record sang SQL có tham số; `Database::Transaction` quản lý commit/rollback qua RAII.

Các bảng có khóa chính/khóa ngoại/unique và cột chỉ mục cho dữ liệu quan trọng. Payload JSON chứa thuộc tính mở rộng và snapshot lịch sử. PostgreSQL dùng schema riêng `shoppe`; SQLite là file phát triển. Cấu hình production không cho phép fallback sang SQLite.

Ngày 22/10 bổ sung `payments.h/.cpp` cho sổ giao dịch dùng chung giữa webhook và truy vấn provider. Mã tham chiếu ngân hàng xác định một khoản thu; số tiền khác trên cùng tham chiếu bị từ chối. Sync xác thực orderCode, amount và tổng transactions/amountPaid trước khi cập nhật. Khoản thu thêm sau paid được theo dõi riêng để hoàn phần thừa; không hủy các đơn đã thanh toán hợp lệ.

Database có bảng schema_migrations với version/checksum, baseline schema.sql và thư mục migrations. Migration chạy trong transaction dưới khóa database, từ chối chỉnh sửa lịch sử hoặc chạy mã nguồn cũ hơn database. Checksum chuẩn hóa CRLF để nhất quán giữa Windows và Linux.

## Lớp và các nguyên lý OOP

```mermaid
classDiagram
    class Application {
        -Database db_
        +handle(request, response)
        +seed()
        -route(repository, request, response, body, user, session)
        -expire(repository)
        -ensurePayment(checkoutId)
        -processMail()
    }
    class Database {
        +begin() Transaction
        +postgres() bool
    }
    class Transaction {
        +query(sql, params) Rows
        +execute(sql, params)
        +commit()
        +rollback()
    }
    class Repository {
        +list(table, where, params) Json
        +get(table, id) Json
        +one(table, where, params) Json
        +save(table, doc) Json
        +erase(table, id)
    }
    class Money {
        -int64 value_
        +value() int64
        +operator_plus(Money) Money
        +operator_multiply(quantity) Money
    }
    class Line {
        +string variantId
        +int quantity
        +Money price
    }
    class OrderSnapshot {
        -unique_ptr~vector~ lines_
        +total() Money
    }
    class IPaymentMethod {
        <<interface>>
        +initialStatus() string
        +requiresGateway() bool
    }
    class CodPayment
    class OnlinePayment
    class IShippingFeePolicy {
        <<interface>>
        +calculate(weightGrams, sameRegion) Money
    }
    class RegionalShipping
    class IOrderState {
        <<interface>>
        +allows(next) bool
    }
    class State
    Application --> Database
    Application --> Repository
    Database *-- Transaction
    Repository --> Transaction
    Application --> IPaymentMethod
    IPaymentMethod <|-- CodPayment
    IPaymentMethod <|-- OnlinePayment
    Application --> IShippingFeePolicy
    IShippingFeePolicy <|-- RegionalShipping
    IOrderState <|-- State
    OrderSnapshot *-- Line
    Line *-- Money
```

- Encapsulation: giá trị tiền kiểm tra miền giá trị/tràn số; resource database và snapshot có ownership rõ ràng.
- Strategy: COD/payOS và phí vận chuyển gọi qua interface có hàm thuần ảo/virtual destructor.
- State: factory `orderState()` tạo đối tượng kiểm soát chuyển tiếp; `requireTransition()` chặn nhảy cóc trạng thái. Quyền của buyer/seller/admin được kiểm tra riêng trong application.
- Rule of Five: `OrderSnapshot` có deep copy, move constructor, copy/move assignment, destructor; snapshot được dùng để tính subtotal và kiểm thử copy/move.
- RAII: transaction chưa commit tự rollback khi có exception; statement SQLite tự finalize. Smart pointers giữ tài nguyên theo quyền sở hữu.
- Money có nạp chồng cộng, nhân và so sánh. Phân bổ voucher dùng số nguyên, tổng phần giảm luôn bằng giảm toàn đơn.

## Sequence: checkout nhiều shop

```mermaid
sequenceDiagram
    actor Buyer as Người mua
    participant UI as HTML/JS
    participant App as C++ Application
    participant DB as Database Transaction
    participant Pay as payOS
    Buyer->>UI: Chọn hàng, địa chỉ, voucher, phương thức
    UI->>App: POST /api/checkout/quote
    App->>DB: Khóa transaction, đọc giá/kho/voucher
    App->>App: Nhóm hàng theo shop, tính tổng bằng C++
    App->>DB: Rollback bản tính thử
    App-->>UI: Báo giá
    Buyer->>UI: Đặt hàng
    UI->>App: POST /api/checkout + idempotency key
    App->>DB: Kiểm tra key, khóa kho/lượt voucher
    App->>App: Tính lại tiền, tạo snapshot từng shop
    App->>DB: Lưu nhóm mua, đơn con, trừ tồn khả dụng, outbox
    App->>DB: Commit
    alt Thanh toán online
        App->>Pay: Tra cứu/tạo link bằng orderCode cố định
        Pay-->>App: Link thanh toán
        App->>DB: Lưu link trong transaction mới
    end
    App-->>UI: Kết quả tạo đơn
```

Không giữ transaction SQL mở khi gọi payOS, Storage hoặc dịch vụ email. PostgreSQL dùng transaction-level advisory lock chung cho bản demo; SQLite dùng mutex/BEGIN IMMEDIATE. Khóa này giới hạn throughput nhưng bảo đảm logic C++ dùng chuỗi đọc/sửa/ghi không bán vượt kho trên các instance.

## Sequence: xác nhận thanh toán

```mermaid
sequenceDiagram
    actor Buyer as Người mua
    participant Bank as Ngân hàng/payOS
    participant UI as Trang kết quả
    participant App as C++ webhook
    participant DB as Database
    Buyer->>Bank: Quét QR và chuyển tiền
    Bank-->>UI: Quay về returnUrl
    UI->>App: GET trạng thái từ server
    Note over UI,App: returnUrl không tự đánh dấu đã thanh toán
    Bank->>App: Webhook dữ liệu + chữ ký
    App->>App: Xác minh HMAC và định dạng
    App->>DB: Kiểm tra mã đơn, số tiền, event đã xử lý
    alt Đúng tiền và đơn còn hiệu lực
        App->>DB: Ghi paid + thông báo/outbox, commit
    else Tiền muộn hoặc không khớp
        App->>DB: Hủy giữ hàng nếu còn giữ, ghi cần đối soát
    end
    App-->>Bank: Đã nhận sự kiện
    UI->>App: Lấy kết quả đã lưu
    App-->>UI: Trạng thái xác minh
```

## Các trạng thái độc lập

- `orders.status`: new -> confirmed -> preparing -> shipping -> delivered -> completed; có cancelled và delivery_failed.
- `checkouts.status`: pending/paid/expired/cancelled/review/refunded hoặc cod.
- COD thu tiền lưu ở `orders.cod_status`, không suy luận từ trạng thái giao hàng.
- Trả hàng: requested -> approved/rejected -> received. Hoàn tiền lưu thành record riêng, tham chiếu và số tiền không vượt mức còn được hoàn.
- Giỏ nhiều shop dùng một checkout, nhiều order. Snapshot các dòng hàng giữ nguyên dù người bán sửa giá hoặc ẩn sản phẩm sau đó.

## Khác biệt với đề xuất ban đầu

- cpp-httplib thay Drogon để giảm phụ thuộc và build được trực tiếp trên toolchain hiện có; nghiệp vụ vẫn chạy C++20.
- PBKDF2-HMAC-SHA256 600.000 vòng qua OpenSSL thay Argon2id; có salt ngẫu nhiên và so sánh thời gian hằng.
- Resend HTTP API thay SMTP để gửi mail qua HTTPS; hàng đợi bền vững và retry không phụ thuộc tiến trình sống liên tục.
- Có thêm SQLite adapter cho phát triển/kiểm thử, production bắt buộc PostgreSQL.

Các interface domain không phụ thuộc giao diện. `Application` hiện là một điểm điều phối đơn giản cho quy mô bài tập; có thể tách thành service theo module khi cần mở rộng. Repository hiện trả JSON record có validation ở service, không tự nhận SQL/filter từ client.

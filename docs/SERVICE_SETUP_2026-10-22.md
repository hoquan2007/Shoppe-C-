# Cấu hình dịch vụ thật và danh mục tự động — 22/10/2026

## Kết quả đã thực hiện

| Hạng mục | Kết quả xác minh |
| --- | --- |
| Lưu khóa tại máy | `.env` được Git bỏ qua; không ghi giá trị khóa trong báo cáo hoặc source |
| Chuỗi PostgreSQL | Bỏ khoảng trắng thừa, URL-encode mật khẩu có ký tự đặc biệt, bật `sslmode=require` và giới hạn thời gian kết nối |
| Kết nối Supabase | Kết nối PostgreSQL qua TLS thành công |
| Schema | Đã áp dụng migration 1–2 vào schema riêng `shoppe` |
| Quyền dữ liệu | `anon` và `authenticated` không có USAGE trên schema ứng dụng; frontend không truy vấn database trực tiếp |
| Dữ liệu ban đầu | 1 admin theo email chủ dự án chọn, 1 shop demo, 30 sản phẩm và biến thể tương ứng |
| Đăng nhập admin | Đã đăng nhập thành công qua API C++ bằng mật khẩu riêng lưu tại máy |
| Supabase Storage | Bucket `product-images` đã có và công khai để đọc ảnh; secret key backend được chấp nhận |
| Thử ảnh | Tải PNG, đọc lại đúng bytes và xóa ảnh thử thành công; đã kiểm tra cả qua Storage API và qua backend C++ có auth/CSRF |
| payOS | Client ID/API Key đã dùng gọi truy vấn chỉ đọc; provider trả HTTP 200, mã 101 với thông báo mã thanh toán không tồn tại cho mã đơn kiểm tra |
| Checksum Key | Đã cấu hình và kiểm tra định dạng; chưa xác minh bằng phản hồi tạo link/webhook từ provider |
| Giao dịch ngân hàng | Chưa tạo link hoặc thực hiện chuyển tiền trong đợt cấu hình này |

Truy vấn mã đơn không tồn tại là kiểm tra kết nối/đường xác thực API, chưa chứng minh toàn bộ luồng thanh toán hoạt động. Không coi việc website báo `payment_configured=true` là đã nhận tiền thật.

## Các file riêng tại máy

| File | Mục đích | Có đưa vào Git không? |
| --- | --- | --- |
| `.env` | Khóa/backend và kết nối ở máy phát triển | Không |
| `.env.admin.local` | Email/mật khẩu admin đã tạo | Không |
| `.env.vercel` | Bộ biến server để bạn nhập vào Vercel | Không |
| `.env.example` | Tên biến và placeholder công khai | Có |

Mật khẩu admin được tạo ngẫu nhiên, khác mật khẩu database; xem trực tiếp `.env.admin.local` trên máy của bạn để đăng nhập. Biến bootstrap đã được xóa khỏi `.env` sau khi tạo tài khoản. File xuất cho Vercel không chứa mật khẩu admin hoặc biến bootstrap.

Các khóa đã được gửi trong chat nên chủ tài khoản nên cấp lại API/Checksum/Storage key và đổi mật khẩu database sau khi hoàn tất thiết lập. Khi đổi, cập nhật `.env`, chạy lại `npm run env:vercel` và thay biến trên Vercel; không cần thay source. Không đưa `.env.vercel` vào commit hoặc gửi cho người khác.

## Dữ liệu sản phẩm tự động

Theo lựa chọn của chủ dự án khi chưa có Shopee Open Platform/Affiliate API, nguồn hiện tại là [DummyJSON Products API](https://dummyjson.com/docs/products).

- Snapshot 30 sản phẩm được lưu cùng source trong `database/demo-catalog.json`, gồm tên, mô tả, phân loại, giá gốc minh họa và ảnh CDN. Dữ liệu trải đều nhiều nhóm sản phẩm để trang chủ có nội dung đa dạng.
- C++ tạo danh mục tiếng Việt, giá VNĐ theo quy tắc cố định minh họa và tồn mô phỏng 20 sản phẩm/biến thể. Đây không phải tỷ giá, giá thị trường hoặc tồn kho thật.
- Đặt `DEMO_CATALOG_AUTO_IMPORT=true`: sau khi đã có admin, hệ thống nạp một lần vào shop của admin. Không tạo tài khoản dùng chung hoặc bật seed tài khoản demo trong production.
- Admin có thể bấm **Nạp sản phẩm demo tự động** tại `/admin/products`. Endpoint yêu cầu quyền admin; buyer và seller bị chặn.
- Mã nguồn sản phẩm ổn định; nạp lại bỏ qua sản phẩm đã có, giữ tên/giá/tồn/hàng đã ẩn do admin sửa. Không bù tồn tự động sau khi đã bán.
- Sản phẩm và shop có mô tả rõ đây là dữ liệu mô phỏng. Nếu chọn payOS khi demo, tiền chuyển khoản vẫn là tiền thật.
- `npm run catalog:refresh` lấy snapshot mới từ nguồn công khai; commit/redeploy snapshot khi muốn cập nhật. Trang chủ đọc database của hệ thống, không phụ thuộc gọi API demo trực tiếp từ trình duyệt mỗi lần mở trang.

Sản phẩm mẫu có tên/mô tả gốc bằng tiếng Anh; phần giao diện và nhãn danh mục bằng tiếng Việt. Ảnh phụ thuộc CDN DummyJSON; có thể thay bằng ảnh tự tải vào Supabase khi cần dữ liệu do bạn quản lý hoàn toàn.

## Kết quả tìm hiểu API Shopee

Các nhóm cần dùng khi có quyền Shopee Open Platform là danh mục (`v2.product.get_category`), danh sách hàng của shop (`v2.product.get_item_list`), chi tiết (`v2.product.get_item_base_info`) và biến thể (`v2.product.get_model_list`). Cần đối chiếu quyền và tài liệu hiện hành trong tài khoản ứng dụng trước khi triển khai.

Luồng chính thức có ứng dụng đối tác và shop ủy quyền. Không dùng khóa payOS/Supabase để gọi Shopee. Hiện không có Partner ID/Key, token và quyền shop nên chưa cấu hình đồng bộ Shopee; cũng chưa cấu hình Affiliate API. Một số trang tài liệu Open Platform trả 403 cho công cụ tra cứu, vì vậy không tuyên bố đã kiểm chứng endpoint thực tế trên tài khoản.

Tham khảo [Shopee Open Platform](https://open.shopee.com/), [hướng dẫn gọi API](https://open.shopee.com/developer-guide/16) và [tài liệu ủy quyền do Shopee công bố](https://cdngarenanow-a.akamaihd.net/shopee/seller/seller_cms/c575929f948611337e1249564c2b8ff6/%5BTW%5D%5BOpen%20API%5DAPI%20v1_v2%E6%8E%88%E6%AC%8A%E6%96%B9%E6%B3%95%20%282020_09%29_newnew.pdf). Tài liệu PDF là tài liệu lịch sử về ủy quyền, không dùng để suy luận toàn bộ tham số API hiện nay.

## Việc bạn cần làm khi deploy Vercel

1. Dùng nhánh `codex/deployment-payment-readiness`, thư mục gốc và `Dockerfile.vercel`. Không chọn chỉ xuất `dist`, vì backend C++ phải được chạy.
2. Thêm các biến trong file riêng `.env.vercel` vào Environment Variables của project Vercel. Khóa phải ở server, không đặt tiền tố `VITE_` hoặc đưa vào frontend.
3. `APP_URL` hiện là `https://shoppec.vercel.app`, đúng **origin HTTPS thật** của project, không có dấu `/` cuối. File riêng `.env.vercel` đã cập nhật giá trị này; kiểm tra production/online đã qua (email vẫn tùy chọn).
4. Giữ `APP_ENV=production`, `PORT=8080`, `SEED_DEMO=false`. Admin và dữ liệu đã nằm trong Supabase nên không cần đưa bootstrap password lên Vercel.
5. Deploy và kiểm tra `/api/health` có C++20/PostgreSQL, đăng nhập admin và xem 30 sản phẩm. Kiểm tra lại dữ liệu sau redeploy.
6. Vercel không kết nối được database direct IPv6. Đã thay cấu hình riêng tại máy và Secret Production bằng **Session pooler URI chính xác do chủ dự án cung cấp**, host `aws-0-ap-southeast-1.pooler.supabase.com`, port `5432`, user `postgres.igjwnwzhyxbpntthkapk`. Giữ `sslmode=require`; client-to-pooler TLS và truy vấn 30 sản phẩm đã được kiểm chứng. Không dùng host pooler đoán từ region hoặc đưa mật khẩu vào tài liệu.
7. Trong payOS, đăng ký webhook `https://DOMAIN/api/payments/webhook`; bản deploy cần được payOS truy cập mà không đăng nhập Vercel. Bước này xác minh webhook/Checksum Key với provider.
8. Tạo đơn thử trên website, tự kiểm tra tài khoản nhận/số tiền và tự thanh toán bằng ngân hàng. Đối chiếu website, payOS và ngân hàng; không dùng URL quay về làm bằng chứng đã trả tiền.
9. Email vẫn chưa có RESEND_API_KEY/EMAIL_FROM. Bổ sung sender/domain được xác minh nếu cần kiểm chứng xác minh email và quên mật khẩu qua email thật.

## Công cụ kiểm tra

```powershell
npm run services:check
npm run secrets:check
npm run preflight -- --online
npm run env:vercel
npm run preflight -- --env-file=.env.vercel --production --online
```

`services:check` mặc định chỉ đọc, không tạo thanh toán hoặc thay bucket. Hai cờ `--prepare-storage --test-upload` chỉ dùng khi chủ project cho phép bucket công khai và thử ảnh. File môi trường trên máy không tự được Vercel sử dụng.

## Kiểm thử và giới hạn

Danh sách sản phẩm đã được đổi sang đọc các bảng liên quan theo lô, thay vì truy vấn shop/biến thể/đánh giá riêng cho từng thẻ. Một lần đo cùng 30 sản phẩm trên Supabase từ máy phát triển giảm từ khoảng 7.369ms xuống 1.241ms. Đây là số đo quan sát của một lượt trước/sau, không phải cam kết độ trễ ở Vercel hoặc kết quả kiểm thử tải. Bộ API có đối chiếu dữ liệu shop/biến thể/đánh giá giữa danh sách và chi tiết.

- Build frontend và C++ PostgreSQL adapter: qua tại máy.
- CTest: 3/3 qua.
- API SQLite: 14/14 qua, thêm kiểm thử nạp catalog chỉ dành admin, chống trùng và giữ chỉnh sửa/tồn kho.
- Kiểm tra dịch vụ thật: database TLS, migration, admin login và ảnh qua C++ đã qua như bảng đầu.
- CI Linux/PostgreSQL/container: theo dõi [GitHub Actions của nhánh](https://github.com/hoquan2007/Shoppe-C-/actions?query=branch%3Acodex%2Fdeployment-payment-readiness). Kết quả của commit bàn giao cần được đối chiếu với run tương ứng.
- Chưa deploy Vercel, chưa cấu hình webhook theo domain thật, chưa tạo link thanh toán hoặc chuyển tiền, chưa gửi email thật. Không đưa database Supabase chứa cấu hình thật vào bộ API test; các test dùng dữ liệu/khóa riêng.

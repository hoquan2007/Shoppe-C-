# Kết quả sửa tiếp sau audit — 26/10/2026

Tiếp nối [kế hoạch audit](NEXT_OPTIMIZATION_PLAN_2026_10_26.md). Source ứng dụng cuối: `c7eca88733c62db4576ee6914619e14129cdc272`, trên nhánh `codex/deployment-payment-readiness`. Các sửa nghiệp vụ nằm trong `fc64c8f` và `28320e6`; commit cuối tách request log khỏi HTTP worker và sửa tên mốc đo thời gian.

**Đã sửa các lỗi nghiệp vụ được tái hiện và phát hành thành công. Chưa nghiệm thu hết lag:** warm request vẫn có mẫu trên một giây và lần cold đầu mất 4,4 giây. Đây là kết quả kiểm chứng, không phải cam kết mọi thao tác đã mượt.

## Các lỗi đã sửa

| Mục | Kết quả |
|---|---|
| C1 — quote cũ | Input voucher hủy request và tăng revision; đổi route hủy quote cũ. Response đã mất hiệu lực không mở Đặt hàng. Đổi địa chỉ/phương thức lấy quote mới. |
| C2 — báo giá khác đơn | Token server ký, hạn 5 phút, gắn với phiên, cart revision, địa chỉ, phương thức, dòng hàng/giá/voucher/discount/ship/tổng. Backend đối chiếu trước mọi ghi stock, redemption hoặc order. Khác snapshot trả 409 và UI yêu cầu xác nhận tổng mới. Retry cùng idempotency key đã thành công vẫn trả đơn cũ. |
| C3 — giỏ nhiều tab | Bắt buộc expected revision trong transaction. Client giữ ý định thao tác, reload/rebase khi conflict, tối đa ba lần; không ghi đè snapshot cũ. Có BroadcastChannel và refresh khi quay lại tab. Checkout tiêu thụ giỏ cũng tăng revision. |
| D1 — dữ liệu không giới hạn | Phân trang users/shops/wishlist/conversations/vouchers; lọc/search admin tại DB. Selector shop lấy 50 và tìm được ngoài trang đầu. Review public mặc định 20, rating/count dùng SQL aggregate. UI có chuyển trang. |
| Export | Stream CSV theo keyset 200 product/order mỗi batch, variant lấy theo batch; nhả DB connection trước khi ghi socket. Có giới hạn ID trên để export không tăng vô hạn khi thêm bản ghi mới. Đây là nhiều snapshot đọc theo batch, không phải transaction snapshot toàn file. |
| O1 — outbox | Retry tối đa 100 thư failed/lượt, không động vào thư đang gửi. Phục hồi lease hết hạn; trường hợp chết sau lần gửi cuối được đánh dấu delivery uncertain, không tự gửi lại. Admin có bước kiểm tra/xác nhận riêng cho trường hợp này; batch retry bỏ qua nó. HTTP provider ở ngoài transaction, giữ idempotency key. |
| L1 — kết nối/quan sát, chưa đạt ngân sách | Worker 4–32, queue tối đa 256; DB pool giữ tối đa 4. Keep-alive tối đa 64 request, idle 2 giây, TCP_NODELAY. Đo queue, request đã parse và headers ready; không đo được hoàn tất gửi socket. Request log đi qua queue tối đa 512 record và worker riêng; sink chậm không chặn HTTP worker. |
| R1 — tái lập release | Toàn bộ source đã commit/push; CI chạy trên đúng commit, gồm hai DB, container Linux và browser regression. Không còn phát hành từ workspace source chưa commit. |

Tách thêm query lọc quản trị khỏi ô tìm sản phẩm: tìm email trong admin không điền email đó lên thanh tìm kiếm catalog.

Không có migration DDL. Cart cũ mặc định revision 0; khóa ký quote dùng dữ liệu phiên đã có, dùng được qua nhiều instance. Tab mở bundle cũ có thể cần tải lại sau thay đổi hợp đồng API; backend từ chối an toàn thay vì tạo đơn theo snapshot chưa xác nhận.

Node agent mặc định trừ 1.000 ms khỏi keep-alive hint. Thử 1 giây không reuse socket; cấu hình 2 giây được kiểm tra reuse thực tế và 20 socket idle. Tham chiếu [Node HTTP Agent](https://nodejs.org/api/http.html#new-agentoptions). Không dùng lại thí nghiệm 100 ms bị loại trong đợt trước.

## Kiểm chứng

- Local SQLite **44/44**, PostgreSQL **44/44**, CTest SQLite **8/8** trên source cuối. Test mới khóa log sink, gửi 1.000 record để kiểm chứng không chặn producer, queue hữu hạn và có tín hiệu overflow.
- PostgreSQL riêng: pool/reuse/read-only/concurrency, read models, bool filters và mail lease/recovery qua. Fixture gồm 1.000 user, 1.000 shop, 1.000 review với 500 hidden; phân trang/selector/aggregate đúng.
- CSV fixture thêm 1.200 product có description nhiều dòng; số dòng xuất khớp toàn bộ variant qua nhiều batch.
- Regression kiểm tra đổi cart/voucher/giá/địa chỉ sau quote, token hết hạn/khác phiên, không mất stock hoặc tạo đơn khi bị từ chối, idempotency sau thành công, CAS và queued intent trong khi rebase.
- [CI của commit cuối](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40323498631): cả `verify (sqlite)` và `verify (postgres)` **success**, có build/smoke container triển khai thật và bước Chromium regression thành công.
- Chromium suite gồm **4 kịch bản**: voucher đang bay, cart đổi sau quote, stale tab rebase giữ món thêm ở tab khác, admin pagination/search và ô tìm sản phẩm độc lập. Lần CI trước (`28320e6`) ghi nhận 4/4 trong 3,6 giây; không dùng thời gian đó làm thời gian của lần CI cuối.
- Browser local qua proxy quote chậm 3 giây: xóa voucher trong lúc chờ vẫn khóa Đặt hàng, giữ tổng không giảm sai. Khi phiên khác đổi giỏ từ 1 lên 2, xác nhận cũ bị từ chối và UI yêu cầu xem lại **2 món / 1.815.000 ₫**.
- Admin browser với 1.000 user giả inactive: DOM 50 hàng; tìm user ngoài trang đầu trả một hàng đúng, không tràn ngang desktop.
- Build/syntax/secret scan/whitespace qua. Bundle cuối `index-DyRg5i46.js` khoảng 111,87 KB / 35,79 KB gzip; attribution debug vẫn riêng. Không tuyên bố giảm bundle.

## Đo tải local

1.000 request trên localhost SQLite, 100 mẫu/endpoint ở concurrency 1 và 10. Có 1.000 user giả, nhưng catalog fixture chỉ có 12 sản phẩm; kiểm tra dataset lớn nằm ở C++/API tests riêng. Không coi đây là Production, field p95 hoặc cold-start benchmark. Số đơn trước/sau không đổi.

| Endpoint | p95 c=1 | p95 c=10 |
|---|---:|---:|
| Health | 1,16 ms | 4,19 ms |
| Catalog | 3,21 ms | 14,83 ms |
| Cart | 1,43 ms | 5,05 ms |
| Editor | 3,00 ms | 34,11 ms |
| Quote chỉ đọc | 1,88 ms | 7,35 ms |

Fixture browser và proxy đã dừng trước khi đo Production. PostgreSQL fixture được khởi động lại riêng để kiểm chứng bản async logger, rồi dọn sau khi hoàn tất.

## Preview và Production

Preview cuối `dpl_5MZ58buZbezsDyZ6RAsusdAvWGJS` READY, đúng source `28320e6`, đúng asset `index-DyRg5i46.js`. API health xác nhận C++20 + SQLite. Preview dùng database giả trong `/tmp`, tắt Google/payment/mail/storage và không có credential Production. Không promote bản fixture thành Production.

Production cuối **READY**: `dpl_944oxJrovLcHZRA5Qe5QYvPXdsXT`, source `c7eca88733c62db4576ee6914619e14129cdc272`, region `sin1`. Alias [shoppec.vercel.app](https://shoppec.vercel.app) đã xác nhận trỏ đúng deployment. URL riêng: `https://shoppe-c2b44dc8q-hnquan.vercel.app`. Build từ Git, dùng cấu hình Production hiện có; không promote fixture Preview.

Bundle `/assets/index-DyRg5i46.js` khớp byte với local, SHA-256 `a8950b0fec3894f022ddc9bccd9a72f1f13cd0b24fffcda9c29343e0d7c1d891`. Toàn bộ probe HTTP trả 200; catalog 1.000 sản phẩm, 12 card/trang. Không có runtime error cluster trong cửa sổ 10 phút được kiểm tra lúc khoảng 19:48 UTC+7. Không suy rộng thành mọi luồng không có lỗi.

## Hiệu năng Production sau phát hành

Probe kết thúc **19:47:44 UTC+7**, cùng runner HTTP tuần tự, phiên quản trị tạm đã logout. Chỉ đọc dữ liệu, không sửa giỏ/địa chỉ hoặc tạo đơn. So sánh với lượt đo bản `28320e6` lúc 19:21; không phải A/B ngẫu nhiên hoặc field p95, không khẳng định thay đổi logger gây ra toàn bộ chênh lệch.

| Phép đo | Trước (`28320e6`) | Sau (`c7eca88`) |
|---|---:|---:|
| Health lần đầu, 1 mẫu | 4.238 ms | 4.403 ms |
| Health warm, median 30 mẫu | 119,5 ms | 134,5 ms |
| Catalog MISS / HIT | 293,9 / 56,6 ms | 214,4 / 61,9 ms |
| Session, median 10 mẫu | 966,5 ms | 977,5 ms |
| Cart, median 10 mẫu | 1.064,2 ms | 577,9 ms |
| Admin editor, median 10 mẫu | 1.130,5 ms | 220,1 ms |

Cart sau sửa dao động **118,8–1.062,8 ms**; editor **180,9–1.173 ms**, nên median tốt hơn chưa đủ để nghiệm thu ổn định. Detail/shop/search đơn lẻ lần lượt **924,4 / 1.059,5 / 1.122,7 ms**. Session vẫn gần một giây dù app khoảng 11–13 ms. Các mẫu private cùng instance, pool wait dưới 0,002 ms và socket queue dưới 0,5 ms; chưa có bằng chứng bão hòa DB/worker trong bài đo này.

Đã sửa cách gọi mốc đo: hook `cpp-httplib` logger chạy **trước ghi socket**, nên `write_ms` trong thí nghiệm trước không phải thời gian truyền response. Bản cuối ghi `http_headers_ready`/`header_serialization_ms`; không đưa ra kết luận sai về hoàn tất truyền. Queue async loại rủi ro stdout chậm chặn HTTP worker, nhưng kết quả trên chưa chứng minh loại bỏ độ trễ đường mạng/platform.

L1 còn mở. Bước tiếp theo là đối chứng cùng backend trên host luôn chạy với dữ liệu giả, so sánh trực tiếp và qua Vercel rewrite trước khi chuyển traffic. [Phương án cụ thể, chi phí và rollback](ALWAYS_ON_BACKEND_OPTION_2026_10_26.md) đã chuẩn bị; chưa tạo dịch vụ trả phí hoặc chuyển secret sang nhà cung cấp mới. Phê duyệt pilot không bao gồm tự động chuyển Production.

## Trình duyệt Production và phần còn thiếu

Trên bản cuối, tìm kiếm `tai` trả 35 kết quả, 12 card trang đầu; chọn giá tăng dần cho kết quả bắt đầu 500.000 ₫ rồi 625.000 ₫. Trang chi tiết hiện đúng sản phẩm/giá và không có ảnh hỏng; chiều rộng nội dung và viewport đều 1.265 px. Không ghi nhận warning/error trong log browser thu được của lượt kiểm tra cuối.

Document bật debug lúc 19:49 UTC+7: search route 317 ms, API products 309,6 ms; LCP 1.536 ms, CLS 0,00235. Tuy nhiên click vào detail có route **3.872,4 ms**, API **3.798,4 ms** trong khi app 25,34 ms. INP document có mẫu **256 ms**, processing 3,1 ms và presentation delay 252,6 ms. Các mẫu này tiếp tục chứng minh chưa đạt độ mượt ổn định; không dùng lượt search nhanh để bỏ qua lượt detail chậm. Đây là IAB desktop tự động, không phải field p75 hay bằng chứng trên điện thoại thật.

V1 còn mở: chưa có kiểm thử thiết bị Android vật lý hoặc field p75. O1 đã sửa/kiểm thử lease và retry, nhưng SLA gửi mail khi instance ngủ và kiểm thử tích hợp provider thật vẫn chưa được xác nhận. Không coi unit/mock là chứng minh provider thật. Cần kiểm tra tiếp theo phạm vi sandbox/thiết bị có sẵn, không tự phát sinh mail, thanh toán hoặc liên kết Google thật.

Đã dừng PostgreSQL fixture tại `.cache/fix3-postgres-0d21a16c` sau kiểm thử; xác minh không còn listener thử ở 15442, 18147, 18149 hoặc 18146. Phiên HTTP Production tạm đã logout. Bằng chứng bản cuối: `artifacts/fix3-final-release.json`, `fix3-production-async-probe.json`, `fix3-production-final-browser.json` và `fix3-production-final.png`.

## Giới hạn nghiệm thu

Không xác nhận Google thật, gửi email thật hoặc tạo đơn/thanh toán Production để test. Các callback/thanh toán và mail fault recovery được kiểm tra bằng fixture/mock có kiểm soát.

CI Chromium và viewport giả lập không thay thế thiết bị vật lý hay field p75. Cold start do platform không tự biến mất khi unit tests xanh. Chỉ kết luận cải thiện dựa trên số đo sau phát hành; không dùng một mẫu INP tốt để bỏ qua mẫu xấu.

Hồ sơ chi tiết nằm trong `artifacts/fix3-*`: log test cuối, benchmark 1.000 request, screenshot/JSON browser voucher/cart/admin, probe và thông tin bản phát hành. Artifact không chứa `.env`, cookie hoặc response private của Production.

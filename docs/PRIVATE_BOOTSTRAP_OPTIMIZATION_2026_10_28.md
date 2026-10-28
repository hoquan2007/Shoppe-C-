# Giảm lượt chờ backend khi mở cart/checkout — 28/10/2026

Tiếp nối [điều tra first byte](FIRST_BYTE_EXECUTION_RESULT_2026_10_28.md). Giữ Vercel + Supabase hiện có, không dịch vụ/gói mới, không migration, không tăng TTL public/private hoặc pool.

## Thay đổi và ngân sách request

Source ứng dụng: **`ebbc8137955823d8b80f784a1f446d37e433d340`**.

| Luồng vào từ document mới | Trước | Sau |
|---|---|---|
| Buyer mở cart | Session + cart: 2 API nối tiếp | `/auth/me?include=cart-view`: 1 API |
| Buyer mở checkout có giỏ/địa chỉ | Session + context + quote: 3 API nối tiếp | `/auth/me?include=checkout` + quote: 2 API |
| Signed-in mở trang public | Session summary + dữ liệu public: 2 API | Giữ 2 API, không tải cart lines |
| Trong SPA chuyển tới checkout | Context + quote sau session đã có | Giữ context + quote; không tái sử dụng bootstrap document cũ |
| Guest mở cart/checkout | Session rồi chuyển login | Session không cookie vẫn không DB, không có payload bootstrap |

Backend gộp session và dữ liệu trang vào cùng transaction/snapshot, xác thực user như trước. Dùng chung `privateCartView` cho cart GET, checkout context và bootstrap để giữ một cách tính lines/ownership/revision. Chỉ checkout bootstrap có addresses/meta; cart-view không mang các phần đó. Summary nhẹ cũ vẫn tương thích.

Read có cart/checkout vẫn chạy kiểm expiry/restock theo đường cũ; session summary thông thường không chạy probe không liên quan. Response private/no-store, không generation/TTL CDN. Không lưu cart mới khi user chưa có cart, không tạo quote/order trong GET bootstrap. Quote vẫn là POST riêng, xác nhận giá/stock/cart revision và phát token trước bước đặt hàng.

## Guard snapshot phía client

- Dữ liệu bootstrap tách khỏi object session trước `acceptSession`; không Object.assign cart object vào state.cart array.
- Chỉ lưu nếu user/session revision còn khớp, vẫn đúng URL khởi đầu, chưa có cart write và không có invalidation trong lúc chờ.
- Snapshot dùng một lần, keyed theo URL, user ID, context và local/remote cart revision. Handoff tối đa 1 giây **sau khi nhận response**, không phải bảo đảm tuổi dữ liệu server ≤1 giây hoặc cache private lâu dài.
- `readSettledCart` vẫn đợi mọi write; revision thay đổi thì đọc lại. Có cart BroadcastChannel trong lúc bootstrap trả về, kể cả lúc session chưa khôi phục xong, sẽ bỏ snapshot. Khi không đủ điều kiện dùng bootstrap, fallback GET context/cart như trước.
- Logout/đổi session/401/cart mutation xóa snapshot. Public navigation không gửi bootstrap payload lớn. Backend cũ chưa trả trường bootstrap vẫn có thể dùng fallback; frontend cũ dùng summary/context vẫn tương thích backend mới.

## Kiểm chứng

- Local **53/53 JavaScript/API**, **CTest 9/9**. Unit snapshot kiểm one-use, clone, sai user/route/revision, hết hạn và invalidation.
- API regression kiểm bootstrap khớp cart/context, addresses/meta đúng scope, private/no-store, không TTL CDN, guest không DB/không bootstrap, cách ly user và số đơn không đổi.
- [CI 40616302513](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40616302513): SQLite/PostgreSQL đều success; 53 tests, CTest 9/9; Docker Release CTest 9/9; **9 Chromium tests passed (6,5 giây)**.
- Browser mới kiểm cart trực tiếp chỉ một private read; checkout trực tiếp một bootstrap + quote, không thêm context/cart/addresses/meta GET. Case tab khác sửa giỏ trong lúc bootstrap đang bị giữ lại bắt buộc fallback context và hiển thị quantity mới trước quote. Các test CAS/rebase multi-tab, quote đổi voucher, stale quote, pending route và public Back fresh giữ nguyên.
- Kiểm IAB trên SQLite fixture buyer giả: thêm một món, mở cart trực tiếp có một API, route ~14,8 ms trong một mẫu; checkout có bootstrap + quote, route ~24,6 ms, hiện **925.000 ₫**. Không bấm Đặt hàng. Không suy các số local này thành tốc độ Production.
- Runner `scripts/readiness-probe.mjs` đã chạy thử với fixture (3 mẫu/luồng); giữ metadata/timing, không body/cookie/CSRF/password. Phép đo Production bên dưới sẽ dùng cùng source và thứ tự xen kẽ, không lấy số local làm A/B Production.
- Ghép request ID với log fixture trong 3 lượt mỗi luồng: session + cart giảm **15→10 SQL calls**; session + context giảm **17→12 SQL calls**. Đây là bộ đếm phía app trên SQLite có một cart line, không phải EXPLAIN/CPU PostgreSQL hoặc field p95.
- Bundle build: `/assets/index-BnNaV7V6.js`, ~115,40 KB raw / 37,15 KB gzip. SHA-256 `6028ef9200dcb0e94bae0f0aa5b728b6d780f30c45094266bd08c949b29e9df7`. Đây là tối ưu số lượt đọc, không phải giảm bundle.

## Phát hành và đo Production

Preview `dpl_HoJJMFJhP7wbT5JWUq373WCTcn9i` READY, source `ebbc813`, dùng dữ liệu giả. Production được build riêng từ source đã qua CI, không promote fixture Preview.

**Production `dpl_8iY6w3N7RpU3buKEPtk9FFRfsXQG` READY**, URL `https://shoppe-g4j7iqfmz-hnquan.vercel.app`, sin1; alias `https://shoppec.vercel.app` xác nhận trỏ đúng deployment. Bundle/hash ở trên khớp byte với dist local. Guest `/auth/me?include=checkout` HTTP 200, anonymous, không bootstrap, db=0, private/no-store. Rollback về `dpl_AbbP99t5VNJ1kNkPzi1Bi3q2QhbZ`; không có migration cần đảo.

### Đối chứng trên cùng deployment

Kết thúc **08:56 ngày 28/10/2026 (UTC+7)**. Runner H1 keep-alive tuần tự, shuffle bốn luồng với seed 281007, 30 mẫu/luồng trên **cùng một source/deployment và cùng instance warm** `51037654ab3c1cbd`. Instance age của các request đo ít nhất ~8,58 giây. So sánh luồng đọc legacy vẫn được backend hỗ trợ với bootstrap, không phải so hai ngày hoặc hai deployment khác nhau.

| Session + dữ liệu trang sẵn sàng | Legacy median | Bootstrap median | Legacy p95 lab | Bootstrap p95 lab |
|---|---:|---:|---:|---:|
| Cart | 2.091,0 ms | 1.039,4 ms | 2.164,1 ms | 1.127,6 ms |
| Checkout context | 2.078,3 ms | 1.052,2 ms | 2.166,7 ms | 1.118,6 ms |

Giảm khoảng **một giây** ở median của hai nhóm đọc trong bài đối chứng này, phù hợp với việc bỏ một lần chờ origin. Không suy thành phần trăm tăng tốc cho toàn website, Chrome/Android thực tế hoặc toàn bộ checkout. Cả 120 flow thành công; **182 request** gồm 180 GET đo và login/logout tạm đều HTTP 200, tất cả private/no-store. Đã logout phiên audit. Chỉ lưu timing/metadata/counts, không private body, cookie, CSRF hoặc credential.

Giới hạn: tài khoản admin, **giỏ rỗng**; checkout ở bảng chỉ tính session + context, **không gồm quote, DOM paint hay checkout-ready của buyer có hàng**. Các luồng buyer có cart/address, quote và race được kiểm ở fixture/CI. Không gọi quote hoặc tạo/sửa cart/address/order/payment trên Production. 30 mẫu cho p95 lab sơ bộ, không phải field p95. Một số bootstrap vẫn mất >1 giây (27/30 mỗi nhóm), nên chưa đạt private ≤500 ms.

Artifact: `opt7-production-readiness.json`, `opt7-production-checks.json`, `opt7-release-smoke.json`. Runner được lưu trong repo để có thể tái lập.

### Kiểm UI Production và mẫu chậm còn lại

IAB guest trên bundle mới: search `tai` có 12 card/35 kết quả, không ảnh hỏng hoặc overflow ngang (desktop 1.265 px), kết thúc không còn inert/busy. Trong document này vẫn có **products MISS ~4.037 ms**, chờ header ~3.933 ms, app ~172 ms; guest session **~4.939 ms**, db=0/app ~0,138 ms. Không loại các mẫu xấu hoặc lấy cải thiện bootstrap private để nói public load đã nhanh hơn.

Không có warning/error trong console đã thu; runtime error/fatal cửa sổ 15 phút sau release không có log phù hợp. Đây là cửa sổ hữu hạn, không bảo đảm ngoài phạm vi đó. Ảnh/log: `opt7-production.png`, `opt7-production-browser.json`; proof buyer giả: `opt7-fixture-checkout.png`, `opt7-fixture-browser.json`. Đã đóng tab và dừng fixture.

## Giới hạn nghiệm thu

Đợt này giảm một lượt chờ origin cho tải cart/checkout từ document mới. Không tuyên bố đã sửa khoảng chờ dispatch trước invoke của Vercel; cold và tail từng API vẫn cần theo dõi riêng. Không dùng snapshot cart/checkout này làm nguồn xác nhận giao dịch.

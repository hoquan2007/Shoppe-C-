# Kiểm tra hiệu năng thực tế sau triển khai — 26/10/2026

**Cập nhật sau sửa tiếp:** xem [kết quả bản sửa cuối](PERFORMANCE_FIX_FOLLOWUP_2026_10_26.md). Các số liệu bên dưới giữ nguyên làm baseline; domain hiện chạy bản mới hơn được nêu trong báo cáo follow-up.

## Phạm vi và bản phát hành

Project `shoppe-c`, team `hnquan`, domain `https://shoppec.vercel.app`, container C++ và frontend Vite, region `sin1`. Kiểm tra đường đi browser → API → dữ liệu trả về → giao diện.

Deployment **READY**, target **Production**: `dpl_FEPrW4BJcQbkFu6Cm1pPNzjcsREo`, URL `https://shoppe-qqw8mrwv3-hnquan.vercel.app`, alias `https://shoppec.vercel.app`. Build khoảng **5 phút 50 giây**, hoàn thành lúc **12:52:03 ngày 26/10/2026 (UTC+7)**. C++ Release trên Linux chạy **7/7 CTest qua** trong image trước khi phát hành; frontend Vite build qua.

Nguồn là snapshot workspace có thay đổi chưa commit trên nền `99bc042b28c316d46ad8fed154eb5c87e0af7f8a`, không phải chỉ nội dung commit đó. Manifest 87 file, 867.402 byte, SHA-256 `bea8029f0a39004d561a11552c1ef16bfe8830f9382e26d7fe4f1fb5a4e5113e`. Không gửi `.env`, credential, database local hoặc artifact thử nghiệm lên deployment. CLI trên máy chưa đăng nhập; triển khai bằng kết nối Vercel đã xác thực, không lấy token ra khỏi connector.

Asset Production `/assets/index-DDnLBpQu.js` có SHA-256 `fb16c327077a62bfd496f3bcbeca72435e558be46322f9f80fa9266796b674a0`, **trùng byte với bundle local đã kiểm thử**. Điều này xác nhận domain đang chạy frontend mới.

Không đổi schema, catalog/ảnh, region hoặc gói dịch vụ. Kiểm tra checkout chỉ dùng quote; không tạo đơn hoặc gọi thanh toán thật. Giỏ của tài khoản dùng thử được sao lưu trước thay đổi và phải khôi phục sau kiểm tra.

## Phương pháp

- HTTP từ một Windows runner: keep-alive HTTPS, response identity để đo byte rõ ràng, mẫu nhỏ tuần tự và 8 lượt đọc public đồng thời. TTFB gồm cả đường mạng/TLS nếu có; Server-Timing dùng đối chiếu handler. Timing trả lại trên cache HIT phản ánh lần tạo response, không phải một lần truy vấn DB mới.
- Browser thực trên domain công khai: thao tác bằng UI, quan sát DOM, screenshot và console Web Vitals qua `?debug-perf=1`. Desktop và viewport điện thoại là kiểm tra responsive; không tương đương điện thoại vật lý hoặc mạng 4G/CPU bị throttle.
- Các số mẫu nhỏ không phải p75 người dùng thật, p95 tải lớn hoặc bằng chứng hết lag cho mọi thiết bị. Không dùng thời gian chạy tool automation làm thời gian phản hồi UI.
- Lỗi HTTP cố ý (401/404/422) được tách khỏi lỗi ngoài dự kiến.

## Kết quả

**Kết luận: luồng đã thử hoạt động đúng và các điểm nghẽn DB đã giảm, nhưng web chưa đạt độ mượt ổn định.** Public cache nhanh; request chưa cache và request private vẫn thường chờ gần một giây. Tương tác cần tiếp tục profile thay vì khẳng định đã hết lag.

### HTTP trên Production

Thời gian dưới đây là tổng HTTP từ runner, không phải thời gian render cả trang. Mỗi endpoint thường 3–4 mẫu; không suy diễn thành p95 Production.

| Luồng | Số đo thực tế | Đối chiếu handler |
|---|---:|---:|
| HTML `/`, lượt đầu sau release | 942 ms | Static CDN MISS; gồm kết nối đầu |
| Home API, lượt đầu sau release | 817 ms | 198 ms, DB 195 ms |
| Catalog 12 hàng, lặp lại có cache | 70–80 ms | Không gọi DB mới trên HIT |
| Phân trang public, cache MISS / HIT | 830 ms / 59–70 ms | MISS handler 26 ms |
| Sort giá, cache MISS / HIT | 910 ms / 64–70 ms | Payload đã được cache cho các lượt sau |
| Tìm `tai`, cache MISS / HIT | 807 ms / 64–84 ms | Không có lỗi HTTP |
| Detail public, cache MISS / HIT | 771 ms / 67–93 ms | Description/variants đầy đủ ở detail |
| Admin products, 50/1.000 hàng | 1.072–1.104 ms; 75.970 byte | 30–33 ms |
| Dashboard, 5 đơn hiện có | 975–1.079 ms | 36–71 ms |
| Cart GET, 1 dòng | 1.007–1.074 ms | 18–19 ms |
| Cart GET, 10 dòng | 678–1.099 ms | 19–26 ms |
| Cart GET, 50 dòng | 185–1.066 ms | 23–25 ms; **9 DB calls** |
| Cart PUT, fixture 1/10/50 dòng | 219–1.044 ms | 26–35 ms |
| Checkout quote, 3 mẫu | 1.036–1.089 ms | 28–30 ms |
| Đăng nhập mật khẩu, 1 mẫu | 600 ms | 287 ms, có PBKDF2 |

Lượt đọc private không được cache công khai. Không nên chữa độ trễ này bằng cache chung dữ liệu tài khoản/giỏ/đơn hàng.

Đã ghi **60 request public/negative/asset và 43 request trong lượt đo có đăng nhập**, ngoài thao tác browser và lượt khôi phục dữ liệu. 8 lượt GET cùng URL public đã warm đều HTTP 200 và HIT, tổng mỗi request **65–292 ms** (giới hạn 4 socket ở runner); đây là smoke test đồng thời nhỏ. Phân trang không trùng ID; sort giá đúng; tổng vẫn **1.000 sản phẩm**. Các ca page=0, cart anonymous, asset/detail không tồn tại trả đúng 422/401/404, có no-store với lỗi API.

### Browser và thao tác

| Kiểm tra | Kết quả |
|---|---|
| Home desktop, một lượt reload | LCP **1.360 ms**, CLS **0** |
| Home desktop/tablet khi browser hiển thị | LCP **1.576 ms**, CLS ban đầu **0** |
| Home viewport mobile 390×844 | LCP **1.428 ms**, CLS ban đầu **0**; content width 375 = scroll width 375 |
| INP ở phiên đối chứng đang hiển thị | Desktop/tablet **336 ms**; viewport mobile **688 ms** — chưa đạt mục tiêu ≤200 ms |
| Tìm kiếm → sort → trang 2 → detail | Hiển thị đúng 12 card, giá tăng dần, trang 2 đúng, mô tả và biến thể đầy đủ |
| Cart bấm tăng 3 lần | 1→4, tạm tính 1.000.000→4.000.000 ₫; focus vẫn ở nút tăng, không dựng lại toàn route |
| Cart → checkout | Đọc đúng số lượng 4; phí ship 25.000 ₫; tổng 4.025.000 ₫; chỉ quote, không bấm đặt hàng |
| Bộ lọc mobile 100.000–1.000.000 ₫ | Trả 525 sản phẩm, 12 card/trang, các giá trong khoảng; không tràn ngang |
| Admin products → editor | DOM 50 hàng/50 ảnh lazy; editor có mô tả, giá, kho và biến thể đầy đủ |
| Admin orders → Đã hủy | 5 đơn ban đầu, lọc ra đúng 3 đơn đã hủy; không sửa trạng thái đơn |

INP trên là **mẫu lab nhỏ bằng automation**, chưa có attribution/trace để tách input delay, JavaScript và presentation delay. Không coi đó là p75 thực địa hoặc kết luận JavaScript bị block đúng từng ấy thời gian. Phiên browser chạy nền trước đó xuất hiện INP 12–82 giây và có đổi viewport giữa phiên; loại phiên này khỏi bảng đối chứng vì điều kiện render của automation không ổn định. Raw log vẫn được giữ, không bỏ mất bằng chứng. Cần đo Chrome foreground và thiết bị vật lý trước khi chốt nguyên nhân INP.

### Lỗi/vấn đề đã xác nhận

1. **P1 — Độ trễ ngoài handler vẫn cao.** Ví dụ admin products handler ~31 ms nhưng tổng HTTP ~1,10 giây; quote handler ~29 ms nhưng tổng ~1,09 giây. Log browser còn có startup ở các request metadata/shop/status: ứng dụng tự khởi động ~34–42 ms, nhưng request có startup có thể chờ khoảng 3,5–3,8 giây trước khi log xuất hiện. Chưa đủ bằng chứng quy toàn bộ phần chờ cho một nguyên nhân; cần tách ingress/queue/container wake-up/network.
2. **P1 — Chưa chứng minh tương tác đạt ngưỡng mượt.** INP đối chứng vượt 200 ms; cần attribution và trace, đặc biệt search/sort/filter và các lần thay route. Đây là vấn đề hiệu năng cần xác minh thêm, không phải bằng chứng lỗi tính toán hay mất dữ liệu.
3. **P2 — Header không đồng bộ từ khóa với URL.** Repro: tìm `tai`, đi sang home/cart hoặc mở `/search` không có q bằng link; ô tìm kiếm vẫn hiện `tai` trong khi route/query đã đổi. Nguyên nhân: `refreshHeader()` chỉ thay `.head-actions` và `.navrow`, giữ nguyên input search.
4. **P2 — Google Sign-In khởi tạo lặp.** Repro: mở login, đăng nhập bằng mật khẩu rồi đi account; console báo `google.accounts.id.initialize() is called multiple times`. `mountGoogleSignIn()` initialize lại mỗi lượt mount/challenge. Chưa xác nhận Google login thất bại; chỉ ghi nhận warning và nguy cơ callback/config bị instance sau thay thế.
5. **P2 — Metadata làm chậm chuỗi tải một số route.** `renderRoute()` chờ session/metadata trước khi dựng các route private và auth. Nếu metadata MISS cần khởi động container, login form hoặc admin có thể phải chờ trước khi gửi các request chính. `shopPage()` cũng chờ shop xong mới tải catalog. Đây là waterfall nhìn thấy trong code và phù hợp với startup log; cần route-timing/trace để định lượng phần tiết kiệm của thay đổi.

Không có runtime error cluster trong cửa sổ 30 phút kiểm tra lại lúc **13:07 UTC+7**; lượt quét log error/fatal đến 13:02 cũng trống. Browser luồng chính không có exception; có warning GSI nêu trên. Không thử thanh toán tiền thật, tạo đơn, gửi chat tới người khác, upload, email/reset thật hoặc sửa dữ liệu catalog. Không có cuộc hội thoại trong tài khoản thử nên chưa chứng minh luồng gửi/nhận chat hai người trên Production; kiểm thử chat local đã có ở báo cáo triển khai trước.

### Khôi phục dữ liệu thử

API đã xác nhận giỏ trở lại đúng **0 dòng như ban đầu**, địa chỉ giả vừa tạo đã xóa, session API bị revoke; browser đã đăng xuất. Không đổi sản phẩm/ảnh/kho hoặc đơn hàng. File bằng chứng: `artifacts/production-test-cleanup-2026-10-26.json`.

### Sau khoảng idle

Đã dừng browser và không gửi API trong **6 phút**, từ 13:01:13 đến 13:07:13 UTC+7. Probe dùng HTTPS agent mới; request đầu có cả DNS/TLS. Không kiểm soát traffic từ người dùng khác, nhưng **startup log khớp đúng request đầu** xác nhận đã có instance khởi động trong phép đo này.

| Thứ tự sau idle | HTTP tổng | Handler | Ghi chú |
|---|---:|---:|---|
| 1. `/api/health` không cache | **3.759 ms** | **10,48 ms** | Startup C++ **48,99 ms**, HTTP 200 |
| 2. `/api/home` | **1.101 ms** | **62,11 ms** | CDN MISS; backend đã được request health đánh thức |
| 3. `/api/home` lặp lại | **69,9 ms** | Không gọi lại | CDN HIT |
| 4. `/api/health` | **922 ms** | **8,62 ms** | Instance đã warm; không có startup mới trong log |
| 5. `/api/health` | **116,6 ms** | **8,71 ms** | Instance đã warm |

Request ứng dụng `a20aab9cd45edd09`, Vercel request `dgpd4-1792994833722-d968fd4f6be3`, deployment đúng bản mới; runtime log có cả startup, listening và GET health. Phần lớn thời gian chờ cold request nằm ngoài hai số startup/handler của ứng dụng. Điều này xác nhận **cold start vẫn có thể khiến người dùng chờ vài giây**, đồng thời mẫu health 922 ms sau đó cho thấy warm request cũng còn jitter ngoài handler. Chưa đủ bằng chứng tách chính xác phần networking/ingress/queue/provisioning; không kết luận tất cả độ trễ đều do cold start.

Raw evidence: `artifacts/production-idle-probe-2026-10-26.json` và `production-idle-runtime-evidence-2026-10-26.json`.

## Kế hoạch xử lý tiếp

| Thứ tự | Công việc | Cách làm cụ thể | Tiêu chí nghiệm thu |
|---|---|---|---|
| 1 — P1 | Tách nguyên nhân chờ origin và giảm cold start 3,76s | Gắn instance/startup ID và timing các giai đoạn; đối chiếu request ID edge/app, warm vs sau idle và 4/8 request private đồng thời trong staging. Kiểm tra queue/connection lifecycle và đường hkg1→sin1. Thử từng thay đổi một; không tăng pool/worker/đổi host theo phỏng đoán. C++ startup hiện 49 ms nên chỉ tối ưu vài ms startup code sẽ không giải quyết phần chờ vài giây. | Warm private API p95 của bài test kiểm soát ≤500 ms, không còn các đợt chờ gần 1 giây không giải thích được; có baseline và raw samples ≥30/lần. Cold-start được đo riêng, có mục tiêu và chi phí rõ ràng trước đổi hạ tầng. |
| 2 — P1 | Profile và sửa INP theo trace | Bổ sung attribution chỉ ở debug: target không chứa dữ liệu nhập, input/processing/presentation delay, long tasks và route phase. Đo Chrome foreground + Android thật/CPU/network throttle; tối ưu đúng đoạn gây chặn, chia việc sau paint nếu trace chứng minh cần. | Search/sort/filter, cart nhanh và đổi trang có mẫu INP ≤200 ms trong bộ lab lặp lại; sau đó kiểm tra p75 field riêng mobile/desktop. Không dùng số 0 hoặc số do tab nền làm bằng chứng đạt. |
| 3 — P2 | Bỏ waterfall không cần thiết | Dựng login form ngay, tải Google/config sau; dùng metadata còn sẵn và refresh nền có trạng thái lỗi rõ. Route private chỉ chờ session/quyền cần thiết; parallel shop và catalog. Không áp dụng dữ liệu/quyền từ phiên cũ. | Trace không còn chờ metadata trước khi form có thể nhập hoặc trước các request dữ liệu độc lập; test abort, logout/login đổi user và metadata lỗi vẫn đúng. |
| 4 — P2 | Đồng bộ search header | Sửa `frontend/app.js`, `refreshHeader()`/route commit: khi commit route/popstate, cập nhật input q theo URL; giữ nguyên DOM/focus khi người dùng đang gõ và chưa submit. Test link danh mục, back/forward và trở về home. | Input/URL/kết quả khớp; không mất ký tự hoặc focus khi auth/badge refresh. |
| 5 — P2 | Quản lý vòng đời GSI | Đọc lại lifecycle SDK; giữ một controller callback, chống mount trùng và cancel callback cũ. Bảo đảm nonce/challenge còn mới, single-use và route/version guard; không đơn giản xóa nonce để hết warning. | Login→account→logout→login, retry và đổi route không có warning/callback trùng; Google login thật kiểm tra bằng tài khoản thử được chỉ định. |
| 6 — P2 | Làm gọn payload quản trị nếu vẫn có ích | Hiện 50 hàng ~76 KB còn có mô tả để editor dùng ngay. Chỉ sau khi xử lý origin, cân nhắc list summary + detail-on-edit thay vì trả mô tả cho mọi dòng. | Payload list giảm rõ, editor đầy đủ, không phát sinh N+1; tổng thời gian mở editor không tệ hơn baseline. |
| 7 — P2 | Giữ kết quả qua các release | Tạo commit/PR chứa snapshot đã phát hành, chạy Linux CI/PG tests và gắn release với commit. Thêm performance budget/smoke test sau deploy và số đo aggregate không chứa PII nếu triển khai RUM. | Deploy lại từ Git tạo cùng behavior/bundle; không vô tình đè bản sửa bằng commit cũ. Có dashboard p75 theo nhóm route/thiết bị để đánh giá người dùng thật. |

Ưu tiên 1–2 trước; không đổi framework, mua dịch vụ hoặc migration schema chỉ dựa trên số handler local. Nếu cold start vẫn vượt mục tiêu sau thử nghiệm, so sánh phương án runtime/hosting giữ instance với chi phí cụ thể trước khi lựa chọn.

## Bằng chứng và tham chiếu

- `artifacts/production-performance-2026-10-26.json`: toàn bộ mẫu public, cache headers, request ID và Server-Timing.
- `artifacts/production-auth-performance-2026-10-26.json`: thời gian private, chỉ metadata đo; không lưu response account/order, cookie hoặc password.
- `artifacts/production-browser-background-2026-10-26.json`, `production-browser-foreground-2026-10-26.json`, `production-browser-visible-all-2026-10-26.json`: console đo lường và warning.
- `artifacts/production-home-mobile-2026-10-26.png`, `production-catalog-mobile-2026-10-26.png`, `production-checkout-mobile-2026-10-26.png`: screenshot trực tiếp domain Production.
- [Google Web Vitals](https://web.dev/articles/vitals): ngưỡng LCP ≤2,5s, INP ≤200ms, CLS ≤0,1 và đánh giá p75 tách mobile/desktop. Các mục tiêu lab/API trong kế hoạch là tiêu chí dự án đề xuất, không phải mặc định của Vercel.
- [Vercel Container Runtime](https://vercel.com/docs/functions/runtimes/container): container tự scale theo nhu cầu; cần tách cold start khỏi tốc độ handler và xác minh scale-in bằng log.

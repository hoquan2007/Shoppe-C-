# Public load và dispatch — 28/10/2026

Tiếp nối [private bootstrap](PRIVATE_BOOTSTRAP_OPTIMIZATION_2026_10_28.md) và [ingress trace](FIRST_BYTE_EXECUTION_RESULT_2026_10_28.md). Giữ Vercel + Supabase, không dịch vụ/gói mới, không migration hoặc tăng TTL.

## Phạm vi bản sửa

Source ứng dụng: `73fc66273bb61d46a0dc7b72dd5f46031ca3c270`.

1. Rule đầu tiên chỉ chọn `/api/auth/me` khi thiếu cookie `shoppe_session`, chuyển tới handler Node native không dependency trong cùng project. GET/HEAD trả đúng guest contract, tránh gọi container C++. Response luôn `private, no-store`; không đặt cookie hoặc trả dữ liệu riêng. Request có cookie session tiếp tục tới backend xác thực như trước, không đi thêm middleware. Handler guest có guard fail-closed 503 nếu platform gửi nhầm cookie holder; path khác 404, method khác 405. Đây không phải lớp xác thực mới hoặc cache session.
2. Intent trên liên kết public: hover 160 ms, focus bàn phím hoặc pointerdown bắt đầu đọc home/search/shop/product. Không quét toàn trang, không prefetch cart/checkout/account/admin/auth, không gửi cookie/CSRF. Tắt khi Save-Data, mạng 2g, document ẩn, link ngoài origin/download/target khác hoặc thao tác modifier.
3. Ngân sách speculative: tối đa một request đang chạy và bốn lần mỗi document, priority low, một attempt, deadline hiện có 12 giây. Có thể phát sinh tối đa bốn GET public nếu người dùng chuẩn bị bấm nhưng không điều hướng. Không có cron ping hoặc keep-warm vô hạn.
4. Navigation dùng cùng pending prefetch hoặc fresh memory cache; không gửi GET trùng. Abort route chỉ dừng waiter, không hủy request bounded dùng chung. Catalog mutation vẫn tăng epoch và ngăn request cũ nạp lại cache. Private/no-store không được tái sử dụng. Cache giữ giới hạn 64 entries và freshness hiện có; không gia hạn dữ liệu cũ để che chờ origin. Prefetch lỗi không dùng mất retry budget của lần navigation sau.

## Kiểm chứng local

- 59/59 JavaScript/API, CTest 9/9, build/check/secrets scan pass.
- Sandbox chặn loopback làm lượt API/socket test đầu fail; chạy lại với quyền network phù hợp đều pass. Không sửa app để bỏ qua lỗi test.
- Unit: guest body/HEAD/no-store, mọi cookie phải đi backend, method/path ngoài scope; canonical mapping public; shared request qua route controller/abort; budget, single-attempt failure và invalidation.
- Browser regressions bổ sung: hover trong lúc response bị giữ rồi click chỉ một GET; Save-Data không GET speculative sau hover, click vẫn tải bình thường. Bộ CI còn kiểm checkout/cart race, isolation, pagination và cache public.
- IAB fixture giả: focus link detail tải một GET ~9 ms, click dùng memory còn ~9,7 giây fresh; route ~10,8 ms. Không dùng số local làm hiệu năng Production. Artifact `opt8-fixture-browser.json`.
- Handler guest dùng Node HTTP chuẩn, không thêm dependency. Phương án middleware thử ở Preview đã bỏ trước Production: request test chạy tại iad1 và sẽ thêm một bước middleware cho cookie holder. Bản cuối dùng conditional ingress tới service riêng, giữ đường private trực tiếp. Dependency Vercel thử nghiệm cũng đã gỡ.
- Frontend bundle `/assets/index-B-wx9kwk.js`: 117,43 KB raw / 37,80 KB gzip (tăng khoảng 0,65 KB gzip cho intent/sharing).

## Đối chứng trước phát hành

Artifact `opt8-before.json`: 30 mẫu/endpoint, H2 reuse, seed 28102026, 151 GET tuần tự, không cookie/login. Mẫu live đầu **4.661,4 ms**, instance age ~31,96 ms, app ~0,82 ms, cache MISS. Đây là mẫu instance mới, không phải p95 cold sau idle có kiểm soát.

| H2 reuse, nhóm warm lab | Median | p95 lab | Max |
|---|---:|---:|---:|
| Guest session | 133,4 ms | 594,8 ms | 1.107,8 ms |
| Products (gồm các cache state) | 68,2 ms | 243,4 ms | 533,2 ms |

Không so mẫu first-load 4–5 giây với median warm để suy phần trăm cải thiện. Số products chưa tách HIT/STALE/MISS không phải p95 origin. Runner/bối cảnh khác IAB; không phải field p75.

## Giới hạn bắt buộc

Native guest tránh container cho đúng endpoint; không thay cơ chế dispatch của container khi đọc catalog/private. Prefetch dịch thời điểm bắt đầu chờ sang lúc chuẩn bị điều hướng, chỉ có lợi khi đủ lead time và dữ liệu còn fresh. Truy cập public lần đầu chưa có intent hoặc cache MISS vẫn có thể cold. Không khẳng định đã loại bỏ mọi mẫu 4–5 giây.

Không bật dịch vụ trả phí, không gửi hồ sơ ra ngoài. Mẫu dispatch trước Invoke Function đã có trong báo cáo trước vẫn cần phân giải lifecycle phía Vercel hoặc thử runtime thay thế có parity test riêng. Không sửa TLS/pool/index/stock hoặc tăng TTL vì không có bằng chứng chúng giải thích khoảng chờ đó.

## CI của source cuối

[Run 40640779925](https://github.com/hoquan2007/Shoppe-C-/actions/runs/40640779925) trên source `73fc662`: SQLite và PostgreSQL đều success. 59 tests, CTest 9/9; Docker Release CTest 9/9; 11 Chromium tests pass. Bản middleware thử ở commit trước chỉ ở Preview, không phát hành Production.

## Cấu hình nền tảng đã đối chiếu

CLI authenticated xác nhận project `hnquan/shoppe-c`; API project trả `resourceConfig.fluid=true`, `resourceConfig.functionDefaultRegions=[sin1]`, `serverlessFunctionRegion=sin1`, Node 24.x. Không còn bước bật Fluid bị bỏ sót; không thay build machine/gói. Query duration/TTFB qua CLI hiện trả `payment_required` vì cần Observability Plus; không bật addon.

Registry có 50 image và chặn Preview cuối ở bước push với `repository has reached the maximum allowed number of images`. Đã dọn đúng hai image Preview do agent tạo, source Git còn đủ để rebuild: `image_xnM4OiwcuK56pozhI8Lsufetvzw7` (74c4f1c, middleware đã loại), `image_yHFta85MInvMG8sswjRpFGVmNgWg` (a4ad74a, docs Preview). Kiểm tra mỗi SHA chỉ có deployment Preview, không phải rollback candidate. Sau dọn còn 48; image Production ebbc813 và rollback 88abbcb còn nguyên. Không tạo repository khác hoặc nâng quota/gói. Inventory local: `opt8-registry-before.json`, `opt8-registry-after-cleanup.json`.

## Preview cuối

`dpl_Eqa7SYKZHBo5Gp9bj2bE5mmBiE6f` READY sau khi dọn quota; source 73fc662, https://shoppe-j4fgszim1-hnquan.vercel.app. Guest checkout bootstrap HTTP 200 với `X-Session-Source: guest-native`, không bootstrap, private/no-store; function region cuối trong request ID là sin1. Vercel curl authenticated xác nhận cookie synthetic 64 ký tự và cookie rỗng đều tới C++ (`X-App-Instance` có mặt, không guest-native), HTTP 200 anonymous/no-store. Không gửi private body hoặc secret vào report.

## Production và phép đo sau release

**`dpl_8wtmxqjYVBDPtBYSfgSvC6fC86bj` READY**, source `73fc662`, sin1; https://shoppe-o4j7m9ic2-hnquan.vercel.app. Alias https://shoppec.vercel.app đã xác nhận trỏ đúng deployment. Build Production riêng dùng Production env, không promote Preview. Bundle SHA-256 `24034844e019a6a5c936844e99e27971f3de34621d27a36e3558a11d876f0de6` khớp dist local từng byte. Rollback: `dpl_8iY6w3N7RpU3buKEPtk9FFRfsXQG`, source ebbc813; không migration cần đảo.

### Mẫu đầu: không loại bỏ cold catalog

`opt8-release-smoke.json`, GET/HEAD đầu sau ready: guest native **925,8 ms**, không có app instance/C++ trace, private/no-store. Đây là first observed request; chưa có Node instance-age để gọi là controlled cold. Catalog `q=tai` MISS **4.712,9 ms**, instance mới `12da7e8f1f19817f`, age **30,71 ms**, DB **182,44 ms**, app **184,78 ms**, parse→headers **185,84 ms**. Platform request `hkg1::sin1::t6lkl-1793168411560-97ff7ff3c381`. So với mẫu live mới 4.661,4 ms trước release, không có bằng chứng cold container đã nhanh lên; hai route khác nhau cũng không phải A/B cold có kiểm soát.

GET cookie synthetic HTTP 200 tới C++/anonymous, HEAD guest native body rỗng, bundle/hash match. Asset MISS đầu mất **1.227,7 ms**; giữ cả mẫu static chậm, không quy mọi thời gian chờ thành SQL hoặc C++.

### Warm lab: trước/sau, 30 mẫu mỗi nhóm

`opt8-before-h1.json`, `opt8-before.json` và `opt8-after.json`. Sau release: hai mode H1 reuse/H2 reuse xen kẽ trong từng block với seed 28102026, 30 mẫu/endpoint/mode; 300 GET measured + 1 live setup, tất cả HTTP 200, không cookie/login. Trước release hai mode chạy ở hai pha riêng. Đây là các cửa sổ khác deployment/thời gian; không suy phần trăm tăng tốc nhân quả hoặc field percentile.

| Guest session | Trước median | Sau median | Trước p95 lab | Sau p95 lab | Trước >1 giây | Sau >1 giây |
|---|---:|---:|---:|---:|---:|---:|
| H1 reuse | 122,8 ms | 121,1 ms | 167,5 ms | 197,8 ms | 1/30 | 0/30 |
| H2 reuse | 133,4 ms | 122,7 ms | 594,8 ms | 207,3 ms | 1/30 | 0/30 |

Giữ cả p95 H1 xấu hơn; median guest hầu như không đổi trong nhóm H1. Bản sửa tránh container cho guest, không có cơ sở nói mọi request đều nhanh hơn. Max guest sau: H1 **210,5 ms**, H2 **354,2 ms**. Live C++ H1 vẫn p95 **1.015,3 ms**, 2/30 >1 giây, nên dispatch warm chưa bị loại bỏ.

Products sau có median H1/H2 ~70,4/69,8 ms và p95 ~127,9/114,3 ms; gồm HIT/STALE/MISS, không phải p95 origin hoặc bảo đảm lần truy cập đầu. Không dùng các mẫu cached này để che cold catalog 4,71 giây.

### Browser thật trong IAB, một mẫu warm

Sau smoke và trong cửa sổ GET lab: guest search `tai`, 12 card/35 kết quả; session **129 ms**, products MISS **346 ms**, route **348,1 ms**. LCP ghi nhận trước tương tác **1.176 ms**, CLS ~0,00235. Đây là document warm sau probe, không phải Chrome/Android vật lý, field p75 hoặc first cold visit.

Focus link detail chưa mở trước đó: đúng một GET public **269 ms**. Click sau khoảng **12,5 giây lead time**, khi còn ~2,18 giây fresh, dùng memory và route render **6,3 ms**, không GET trùng. Đây là một case có đủ thời gian nạp trước; không phải mọi click đều 6 ms. Case click trong khi request chưa xong và hủy waiter được kiểm riêng trong CI/unit.

Detail hiển thị đúng, 0 ảnh hỏng, width/scrollWidth đều 1.265 px, kết thúc không inert/busy, không warning/error trong console đã thu. `opt8-production-browser.json`, ảnh `opt8-production.png`. Không bấm thêm giỏ, mua ngay, đặt hàng, thanh toán hoặc Google. Đã đóng tab, không viewport override.

### Private và vận hành

`opt8-private-regression.json`: một sample mỗi legacy/bootstrap flow (4 flow, 6 GET + login/logout tạm), tất cả HTTP 200, private/no-store, logout thành công, admin giỏ rỗng. Đây chỉ là smoke contract/routing, không p95 hoặc buyer checkout benchmark. Không ghi cart/address/order/payment/email/OAuth trên Production. Private bootstrap vẫn có mẫu ~1.113 ms; không tuyên bố hết lag private.

Image Production mới `image_XforIGmFDog5SPqBITdzef8N0RVg`, digest `sha256:a9b9bc8a42e621bce5d8c5fd8313e7a84918f6bedef3b619d99e7b4107a66da1`. Image Preview tạm `image_4po6NGqvy7G6c1hEOXCHbBzjy5HS` khác ID/digest, đã untagged sau push Production và được dọn sau QA; chỉ Preview thử nghiệm có thể cần rebuild. Giữ nguyên Production mới, ebbc813 và rollback 88abbcb. Không xóa dữ liệu Supabase hoặc thêm gói/dịch vụ trả phí.

## Kết luận và phần còn mở

Đã giảm một đường đi qua container cho session guest và thêm intent prefetch có budget/guard. **Chưa sửa triệt để cold/dispatch catalog**: mẫu instance mới vẫn ~4,71 giây và live warm còn tail ~1 giây. Hạ tầng scale-to-zero hiện tại không có cam kết always-warm; không thêm cron ping, tăng TTL hay pool để che vấn đề.

Bước phân giải tiếp: [hồ sơ cụ thể cho Vercel](VERCEL_DISPATCH_SUPPORT_DRAFT_2026_10_28.md), gồm trace IDs và khoảng trễ trước Invoke Function. Sau khi người dùng duyệt, đã gửi qua plugin Vercel; công cụ xác nhận `Vercel accepted the feedback.` Không trả ticket ID/SLA; không đồng nghĩa đã mở support case hoặc đã sửa lỗi. Cần phân giải lifecycle/dispatch phía nền tảng hoặc thử native runtime cho phần business với parity/deployment pipeline riêng; không nên port SQL/expiry/stock vội để bỏ container. Không đánh dấu toàn bộ lag đã khắc phục.

Runtime error/fatal scan của deployment mới trong cửa sổ 15 phút sau release không có log phù hợp; không bảo đảm ngoài cửa sổ đã kiểm tra.

Nguồn cấu hình đã đối chiếu: [Services routing](https://vercel.com/docs/services/routing), [Node.js server entrypoint](https://vercel.com/docs/functions/runtimes/node-js), [conditional rewrites](https://vercel.com/docs/project-configuration/vercel-json). Không suy rằng thay route guest đã sửa mọi dispatch của container.

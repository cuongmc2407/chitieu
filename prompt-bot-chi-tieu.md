# Dự án "Chi Tiêu": bot Telegram ghi chi tiêu siêu nhanh + website + app iOS

## Vai trò và cách làm việc

Bạn là kỹ sư full-stack giàu kinh nghiệm với Node.js, TypeScript, React và iOS. Hãy xây dựng dự án dưới đây từ đầu, **theo từng giai đoạn** (xem mục "Các giai đoạn" ở cuối). Sau mỗi giai đoạn: chạy toàn bộ test, tóm tắt những gì đã làm, hướng dẫn tôi cách kiểm tra, rồi **dừng lại chờ tôi xác nhận** trước khi làm tiếp.

Nếu có yêu cầu nào mâu thuẫn, không khả thi hoặc có cách tốt hơn rõ rệt, hãy nói thẳng và đề xuất phương án thay vì âm thầm bỏ qua. Giao diện, tin nhắn bot và README viết bằng **tiếng Việt có dấu**; code, tên biến và comment viết bằng tiếng Anh.

## Mục tiêu

Tôi muốn ghi chi tiêu nhanh nhất có thể để duy trì thói quen. Tôi nhắn Telegram "phở 45k" hay "xăng 80k", bot tự tách số tiền, đoán danh mục, lưu lại và trả lời xác nhận trong vòng 1 giây. Cuối tuần bot tự gửi báo cáo. Ngoài bot, có website để xem, sửa và thống kê, cùng một app iOS (xuất file `.ipa`), tất cả dùng chung một nguồn dữ liệu.

## Môi trường triển khai

- Server Linux của tôi, chạy Node.js 22 LTS trở lên.
- Công khai qua **Cloudflare Tunnel**: `chitieu.cuongmc.id.vn` → `http://localhost:3000`. Không mở cổng nào ra Internet.
- Người dùng: chủ yếu là tôi, có thể thêm vài người trong gia đình. Hệ thống phải hỗ trợ nhiều người dùng, dữ liệu mỗi người tách biệt, danh sách Telegram ID được phép đặt trong biến môi trường.
- Múi giờ `Asia/Ho_Chi_Minh`, tiền tệ VND, tuần bắt đầu từ thứ Hai.
- Tôi **không có máy Mac**, nên file `.ipa` phải được build trên GitHub Actions (xem mục 6).

## Công nghệ

Monorepo dùng **pnpm workspaces**, TypeScript toàn bộ:

```
chitieu/
├── packages/core/     # parser tin nhắn, danh mục mặc định, định dạng tiền (dùng chung, không phụ thuộc Node hay DOM)
├── apps/server/       # Fastify API + bot Telegram + tác vụ định kỳ + SQLite
├── apps/web/          # React + Vite (PWA), đồng thời là giao diện của app iOS
│   └── ios/           # project iOS do Capacitor sinh ra
├── .github/workflows/ # build file .ipa
└── deploy/            # Dockerfile, docker-compose, PM2, mẫu cấu hình tunnel
```

- **Server:** Fastify, grammY (mặc định long polling, hỗ trợ webhook qua biến môi trường), better-sqlite3, zod, croner (lịch chạy theo múi giờ), pino, @fastify/helmet, @fastify/rate-limit, @fastify/cors.
- **Web:** React, Vite, Tailwind CSS, react-router, Chart.js (react-chartjs-2), vite-plugin-pwa. Server phục vụ bản build tĩnh của web ở cùng domain.
- **iOS:** Capacitor bọc chính app web, để web và iOS dùng chung một bộ giao diện.
- **Test:** Vitest.

## 1. Bộ phân tích tin nhắn (`packages/core`): trái tim của dự án

Viết hàm thuần `parseMessage(text, now, options) → ParseResult`, không có I/O, để server, web và app đều dùng chung. Web và app dùng nó để xem trước kết quả ngay khi gõ.

**Nhận dạng số tiền:**

- `k`, `ng`, `nghìn`, `ngàn`, `cành` → ×1.000
- `tr`, `triệu`, `củ` → ×1.000.000
- Dạng viết gộp: `1tr2` = 1.200.000, `3tr5` = 3.500.000, `2k5` = 2.500
- Số thập phân đi kèm đơn vị: `1.5tr`, `1,5tr` = 1.500.000
- Dấu `.` hoặc `,` theo nhóm 3 chữ số là phân cách hàng nghìn: `150.000`, `150,000`, `150000` đều là 150.000
- Cho phép khoảng trắng giữa số và đơn vị: `45 k`, `2 triệu`
- Số trần không đơn vị: nhỏ hơn 1000 thì hiểu là nghìn (`bánh mì 20` = 20.000), từ 1000 trở lên giữ nguyên. Ngưỡng này cấu hình được.
- Số tiền có thể đứng trước hoặc sau nội dung.
- Nếu có nhiều con số trong một khoản, số có đơn vị tiền được ưu tiên (`xăng 95 60k` → 60.000, ghi chú "xăng 95"). Nếu không số nào có đơn vị, lấy số cuối cùng.
- Số tiền luôn lưu dạng **số nguyên (đồng)**, tuyệt đối không dùng số thực.

**Nhiều khoản trong một tin:** tách theo dấu phẩy, chấm phẩy hoặc xuống dòng. Cẩn thận không tách nhầm dấu phẩy nằm giữa hai chữ số (như `1,5tr`).

**Thu nhập:** tin bắt đầu bằng `+`, hoặc chứa từ khóa như `lương`, `thưởng`, `hoàn tiền`, `được cho` → loại "thu".

**Ngày:** tiền tố `hôm qua` / `hqua`, `hôm kia`, `dd/mm` hoặc `dd/mm/yyyy`, `thứ 2` đến `CN` (lần gần nhất đã qua). Ngày `dd/mm` nếu rơi vào tương lai thì hiểu là năm trước. Không có tiền tố thì dùng thời điểm hiện tại.

**Chuẩn hóa:** chuyển chữ thường, gộp khoảng trắng, bỏ dấu tiếng Việt khi so khớp từ khóa, nhưng ghi chú lưu lại phải giữ nguyên chữ gốc có dấu.

**Đoán danh mục**, theo thứ tự ưu tiên:

1. Từ khóa người dùng từng tự sửa (bảng `keyword_overrides`), để bot "học" từ các lần sửa.
2. Từ điển từ khóa mặc định (có dấu, không dấu, viết tắt, tiếng lóng). **Khớp dài nhất thắng**: "tiền nước" thuộc Hóa đơn, còn "nước" đứng một mình thuộc Đồ uống.
3. Tùy chọn, tắt mặc định: nếu có API key của một LLM trong biến môi trường và bước 1, 2 không khớp, gọi LLM với timeout 2 giây. Lỗi hoặc quá hạn thì dùng "Khác".
4. "Khác".

**Danh mục mặc định** (người dùng sửa được sau này):

| Danh mục | Từ khóa mẫu |
|---|---|
| 🍜 Ăn uống | phở, bún, cơm, bánh mì, xôi, lẩu, nướng, ăn sáng, ăn trưa, ăn tối, đi chợ |
| ☕ Cà phê & đồ uống | cafe, cà phê, cf, trà đá, trà sữa, nước, sinh tố, bia |
| 🛵 Đi lại | xăng, grab, be, xanh sm, taxi, gửi xe, vé xe, rửa xe, sửa xe |
| 🏠 Nhà cửa | tiền nhà, tiền trọ, đồ gia dụng |
| 💡 Hóa đơn | tiền điện, tiền nước, internet, wifi, 4g, nạp điện thoại |
| 🛒 Mua sắm | siêu thị, shopee, lazada, tiki, quần áo, giày |
| 💊 Sức khỏe | thuốc, khám, nha khoa, gym |
| 🎮 Giải trí | phim, cgv, netflix, spotify, game, du lịch |
| 📚 Học tập | sách, khóa học, học phí |
| 🎁 Hiếu hỉ & quà | mừng cưới, đám cưới, quà, sinh nhật, biếu |
| ❓ Khác | (mặc định) |
| 💰 Lương · 🎉 Thưởng · 💵 Thu khác | (danh mục thu) |

**Test bắt buộc:** viết ít nhất 40 test case, gồm tối thiểu các trường hợp sau (cố định `now` trong test):

| Tin nhắn | Kết quả mong đợi |
|---|---|
| `phở 45k` | chi 45.000 · Ăn uống · ghi chú "phở" |
| `45k phở` | như trên (số đứng trước) |
| `PHỞ 45K`, `pho 45k` | như trên (không phân biệt hoa thường, không dấu vẫn khớp) |
| `xăng 80k` | 80.000 · Đi lại |
| `cf 25k` | 25.000 · Cà phê & đồ uống |
| `bánh mì 20` | 20.000 (số trần nhỏ hơn 1000) |
| `grab 32.000` | 32.000 · Đi lại |
| `tiền nhà 3tr5` | 3.500.000 · Nhà cửa |
| `tiền điện 1,2tr` | 1.200.000 · Hóa đơn |
| `tiền nước 150k` | Hóa đơn (không phải Đồ uống) |
| `nước 10k` | Cà phê & đồ uống |
| `gửi xe 2k5` | 2.500 · Đi lại |
| `mừng cưới 1 củ` | 1.000.000 · Hiếu hỉ & quà |
| `shopee 1.5tr` | 1.500.000 · Mua sắm |
| `xăng 95 60k` | 60.000, ghi chú "xăng 95" |
| `+lương 15tr` | thu 15.000.000 · Lương |
| `hôm qua lẩu 350k` | ngày là hôm qua |
| `12/9 xăng 70k` | ngày 12/9 |
| `phở 45k, trà đá 5k` | 2 khoản riêng biệt |
| `150000` | 150.000 · Khác · ghi chú trống |
| `phở` | lỗi: không tìm thấy số tiền |

## 2. Bot Telegram

**Luồng chính:** nhận tin → phân tích → lưu → trả lời, ví dụ:

```
✅ 🍜 Ăn uống · 45.000 ₫ · phở
Hôm nay: 180.000 ₫ · Tháng 9: 3,2tr / ngân sách 5tr
```

Kèm hai nút inline: **[🏷 Đổi danh mục]** và **[↩️ Hoàn tác]**. Khi đổi danh mục, hiện bàn phím chọn danh mục; chọn xong thì cập nhật giao dịch và lưu từ khóa vào `keyword_overrides` để lần sau tự đoán đúng. Tin có nhiều khoản thì trả lời một tin xác nhận liệt kê tất cả.

**Sửa tin đã gửi:** khi tôi chỉnh sửa một tin nhắn trên Telegram (`edited_message`), bot cập nhật giao dịch tương ứng (lưu `telegram_message_id` để đối chiếu). Nếu tin không có số tiền, bot hỏi lại ngắn gọn kèm ví dụ cú pháp.

**Lệnh:** `/start`, `/huongdan`, `/homnay`, `/tuan`, `/thang`, `/xoa` (xóa khoản gần nhất), `/danhmuc`, `/ngansach <danh mục> <số tiền>`, `/nhacnho` (bật/tắt nhắc), `/ketnoi` (lấy mã đăng nhập app), `/xuat` (gửi file CSV tháng này). Đăng ký danh sách lệnh với Telegram khi khởi động.

**Bảo vệ:** chỉ phục vụ Telegram ID có trong `ALLOWED_TELEGRAM_IDS`; người lạ nhận một câu từ chối lịch sự và bị ghi log. Chỉ hoạt động trong chat riêng, bỏ qua nhóm.

**Tác vụ tự động** (giờ cấu hình qua biến môi trường, chạy theo giờ Việt Nam):

- 20:00 Chủ nhật: báo cáo tuần.
- 08:00 ngày 1 hằng tháng: báo cáo tháng trước.
- Cảnh báo ngân sách khi một danh mục chạm 80% và 100% (mỗi mức chỉ báo một lần mỗi tháng).
- 21:30 hằng ngày: nếu hôm đó chưa ghi khoản nào, nhắc nhẹ một câu (tắt được bằng `/nhacnho`).

**Mẫu báo cáo tuần** (dùng `parse_mode: HTML`, phần bảng đặt trong thẻ `<pre>` để căn cột):

```
📊 Báo cáo tuần 08/09 – 14/09
Tổng chi: 1.245.000 ₫ (▲ 12% so với tuần trước)
Tổng thu: 0 ₫

🍜 Ăn uống     620.000 ₫  50%  ██████████
🛵 Đi lại      240.000 ₫  19%  ████
☕ Đồ uống     185.000 ₫  15%  ███
🛒 Mua sắm     200.000 ₫  16%  ███

Khoản lớn nhất: 🛒 tai nghe shopee 350.000 ₫ (T5)
Ngày chi nhiều nhất: Thứ Bảy (410.000 ₫)
Trung bình mỗi ngày: 177.857 ₫
Ngân sách tháng 9: 🍜 2,1tr/3tr (70%)
```

## 3. Cơ sở dữ liệu (SQLite)

Bật WAL mode, dùng các file migration SQL đánh số và tự chạy khi khởi động. Các bảng tối thiểu:

- `users`: id, telegram_id (unique), tên, cài đặt nhắc nhở, thời điểm tạo.
- `categories`: id, user_id, tên, emoji, loại (chi/thu), danh sách từ khóa (JSON), ngân sách tháng, thứ tự, đã ẩn.
- `transactions`: id (UUID), user_id, số tiền (INTEGER, đồng), loại, category_id, ghi chú, tin nhắn gốc, `occurred_at`, `created_at`, `updated_at`, `deleted_at` (xóa mềm), nguồn (`telegram` / `web` / `ios`), `client_id` (unique theo user, chống trùng khi đồng bộ offline), `telegram_message_id`, `actual_synced_at`.
- `keyword_overrides`: user_id, từ khóa đã chuẩn hóa, category_id.
- `sessions`: id, user_id, hash của token, thiết bị, lần dùng cuối, hết hạn.
- `pairing_codes`: mã, user_id, hết hạn, số lần nhập sai.
- `notifications_sent`: ghi lại cảnh báo ngân sách đã gửi để không gửi lặp.

Thời gian lưu dạng UTC; mọi phép gom theo ngày, tuần, tháng đều tính theo `Asia/Ho_Chi_Minh`. Mọi truy vấn đều phải lọc theo `user_id`.

## 4. API và đăng nhập

**Đăng nhập:**

- **Web:** Telegram Login Widget. Server kiểm tra chữ ký HMAC-SHA256 theo đúng tài liệu Telegram và kiểm tra `auth_date` còn mới. Tạo session, gửi token trong cookie `httpOnly`, `Secure`, `SameSite=Lax`.
- **App iOS (và dự phòng cho web):** mã ghép nối. Tôi gõ `/ketnoi` trong bot, nhận mã 6 chữ số hiệu lực 5 phút, dùng một lần; nhập vào app thì nhận session token dạng Bearer, app lưu token bằng Capacitor Preferences.
- Session token là chuỗi ngẫu nhiên 32 byte, DB chỉ lưu hash. Có trang xem và thu hồi các thiết bị đang đăng nhập.
- Rate limit chặt cho các endpoint đăng nhập (mã ghép nối bị vô hiệu sau 5 lần nhập sai).

**Endpoint** (validate toàn bộ đầu vào bằng zod):

- `POST /api/auth/telegram`, `POST /api/auth/pair`, `POST /api/auth/logout`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`
- `GET /api/transactions?from&to&category&q&type`
- `POST /api/transactions`: nhận `{ text }` (phân tích bằng core ở server) hoặc dữ liệu có cấu trúc; bắt buộc có `client_id`, gửi trùng thì trả lại bản đã có thay vì tạo mới.
- `PATCH /api/transactions/:id`, `DELETE /api/transactions/:id` (xóa mềm)
- `POST /api/parse`: xem trước kết quả phân tích (dùng từ khóa đã học của người dùng)
- `GET /api/stats?period=week|month|year&date=`: tổng theo danh mục, theo ngày, so sánh kỳ trước, top khoản lớn
- `GET/POST/PATCH/DELETE /api/categories`, `GET/DELETE /api/keyword-overrides`
- `GET /api/export.csv?from&to`
- `GET /api/health`

**CORS:** chỉ cho phép `capacitor://localhost` (app iOS) và `http://localhost:5173` khi phát triển. Web chạy cùng domain nên không cần CORS.

## 5. Website (cũng là giao diện của app)

Thiết kế mobile-first, gọn, bấm được bằng một tay. Sáng/tối theo hệ thống. Dùng font hỗ trợ tốt tiếng Việt (ví dụ Be Vietnam Pro, tự host). Số tiền hiển thị kiểu `45.000 ₫`.

**Các màn hình:**

- **Nhập nhanh** (màn hình chính): một ô nhập với cú pháp giống hệt bot, xem trước kết quả phân tích ngay khi gõ, nhấn Enter là lưu. Có hàng chip danh mục để đổi nhanh trước khi lưu. Bên dưới là danh sách các khoản hôm nay và tổng tiền.
- **Lịch sử:** nhóm theo ngày kèm tổng mỗi ngày, lọc theo danh mục và khoảng thời gian, tìm theo ghi chú, bấm vào khoản để sửa hoặc xóa.
- **Báo cáo:** chọn tuần, tháng hoặc năm; biểu đồ tròn theo danh mục, biểu đồ cột theo ngày, so sánh với kỳ trước, top khoản lớn nhất, tiến độ ngân sách.
- **Danh mục & ngân sách:** thêm, sửa, ẩn danh mục; chọn emoji; chỉnh từ khóa; đặt ngân sách tháng; xem và xóa các từ khóa bot đã học.
- **Cài đặt:** địa chỉ server (chỉ hiện trong app, mặc định `https://chitieu.cuongmc.id.vn`), xuất CSV, bật/tắt nhắc nhở, quản lý thiết bị, đăng xuất.

**PWA:** có manifest, bộ icon, service worker cache giao diện, để có thể "Thêm vào màn hình chính" trên iPhone.

**Offline** (cho cả app và PWA): khi mất mạng, khoản mới được đưa vào hàng đợi cục bộ (IndexedDB), hiển thị nhãn "chờ đồng bộ" và tự gửi lên khi có mạng lại. `client_id` là UUID sinh ở máy khách để không bao giờ tạo bản ghi trùng.

## 6. App iOS và file `.ipa`

- Dùng Capacitor, `appId` là `vn.id.cuongmc.chitieu`, tên hiển thị "Chi Tiêu".
- Chăm chút phần native: thanh trạng thái theo giao diện sáng/tối, rung nhẹ (haptics) khi lưu thành công, tôn trọng safe area, bàn phím không che ô nhập. Icon và splash screen sinh từ một file SVG gốc bằng `@capacitor/assets`.
- **Build trên GitHub Actions** (`.github/workflows/ios.yml`), chạy khi đẩy tag `v*` hoặc bấm chạy tay:
  1. Chạy trên runner macOS, cài pnpm và dependencies, build web.
  2. `npx cap sync ios`.
  3. Kiểm tra phiên bản Capacitor đang dùng CocoaPods (`App.xcworkspace`) hay Swift Package Manager (`App.xcodeproj`) và gọi `xcodebuild archive` cho đúng loại, với `CODE_SIGNING_ALLOWED=NO`.
  4. Đóng gói `App.app` vào thư mục `Payload/`, nén thành `ChiTieu-unsigned.ipa`.
  5. Upload làm artifact, và đính kèm vào GitHub Release khi build từ tag.
- **Ký tùy chọn:** nếu repo có secrets chứng chỉ `.p12`, provisioning profile và App Store Connect API key thì workflow tự ký và xuất thêm bản IPA đã ký (hoặc đẩy lên TestFlight). Không có secrets thì chỉ xuất bản chưa ký, không báo lỗi. Tuyệt đối không commit chứng chỉ vào repo.
- Số phiên bản app lấy từ tag git.

## 7. Đồng bộ Actual Budget (tùy chọn, tắt mặc định)

Nếu có `ACTUAL_SERVER_URL`, `ACTUAL_PASSWORD`, `ACTUAL_SYNC_ID` thì bật module đồng bộ một chiều từ SQLite sang Actual qua `@actual-app/api`: định kỳ vài phút một lần, ánh xạ danh mục theo tên (tự tạo nếu chưa có), dùng `imported_id` bằng id giao dịch để chống trùng, cập nhật `actual_synced_at`. Lưu ý Actual lưu số tiền dạng số nguyên nhân 100; hãy kiểm tra tài liệu và quy đổi đúng. SQLite luôn là nguồn dữ liệu gốc; Actual lỗi thì chỉ ghi log, không ảnh hưởng bot.

## 8. Triển khai và vận hành

- `.env.example` đầy đủ, có chú thích: `TELEGRAM_BOT_TOKEN`, `ALLOWED_TELEGRAM_IDS`, `PUBLIC_URL`, `PORT=3000`, `TZ=Asia/Ho_Chi_Minh`, `DB_PATH`, `BOT_MODE=polling|webhook`, `WEEKLY_REPORT_CRON`, `MONTHLY_REPORT_CRON`, `DAILY_REMINDER_CRON`, `BARE_NUMBER_THRESHOLD=1000`, các biến `ACTUAL_*` và biến LLM tùy chọn.
- Hai cách chạy, README hướng dẫn cả hai: **Docker Compose** (có volume cho dữ liệu và bản sao lưu) và **PM2** chạy Node trực tiếp.
- Mẫu cấu hình ingress cho Cloudflare Tunnel trỏ `chitieu.cuongmc.id.vn` về cổng 3000. Ghi chú trong README: **không** đặt Cloudflare Access trước `/api`, vì app iOS sẽ không gọi được.
- Hướng dẫn BotFather: tạo bot, `/setdomain` về `chitieu.cuongmc.id.vn` để Login Widget hoạt động.
- **Sao lưu:** 03:00 mỗi ngày dùng API backup của better-sqlite3 ghi ra thư mục `backups/`, giữ 30 bản gần nhất, có lệnh khôi phục. Tùy chọn gửi bản sao lưu nén vào Telegram cho chính tôi.
- Log bằng pino, tắt server an toàn khi nhận SIGTERM (đóng bot, DB, hoàn tất request đang chạy).

## 9. Bảo mật

- Mọi bí mật chỉ nằm trong biến môi trường; `.gitignore` loại `.env`, file DB và thư mục backup.
- Validate toàn bộ đầu vào bằng zod; chỉ dùng prepared statement.
- Mọi truy vấn lọc theo `user_id`; viết test chứng minh người dùng A không đọc hay sửa được dữ liệu của B.
- Bật helmet và Content Security Policy phù hợp; rate limit cho toàn bộ API.

## Các giai đoạn

1. **Core:** parser, danh mục mặc định, định dạng tiền, ít nhất 40 test đều qua.
2. **Server và bot:** SQLite, migrations, bot Telegram với đầy đủ lệnh, nút inline, học từ khóa, sửa tin, báo cáo và nhắc nhở. Dừng để tôi thử trên Telegram.
3. **API và web:** đăng nhập, toàn bộ endpoint, các màn hình web, PWA, hàng đợi offline.
4. **iOS:** Capacitor, phần native, workflow GitHub Actions xuất file `.ipa`.
5. **Hoàn thiện:** Docker Compose, PM2, sao lưu, Actual Budget, README hoàn chỉnh từ A đến Z.

## Tiêu chí hoàn thành

- Nhắn `phở 45k` thì bot trả lời trong vòng 1 giây với đúng số tiền và danh mục.
- Đổi danh mục cho một từ khóa một lần, lần sau bot tự đoán đúng.
- Báo cáo tuần tự đến lúc 20:00 Chủ nhật theo giờ Việt Nam.
- Web và app thấy cùng một dữ liệu; khoản nhập khi offline trên app được đồng bộ khi có mạng mà không bị trùng.
- GitHub Actions tạo ra file `.ipa` tải về được.
- `pnpm test` chạy xanh toàn bộ; README đủ chi tiết để người khác dựng lại dự án từ đầu trên một server Linux mới.

# Chi Tiêu

Ghi chi tiêu nhanh nhất có thể — nhắn "phở 45k" cho bot Telegram là xong,
dưới 1 giây có xác nhận kèm danh mục tự đoán. Web (PWA) và app iOS dùng
chung một server và một cơ sở dữ liệu, có thể ghi/xem chéo giữa 3 nơi.

## Mục lục

1. [Kiến trúc](#1-kiến-trúc)
2. [Chuẩn bị BotFather](#2-chuẩn-bị-botfather)
3. [Chạy thử trên máy dev](#3-chạy-thử-trên-máy-dev)
4. [Triển khai lên server — Docker Compose (khuyên dùng)](#4-triển-khai-lên-server--docker-compose-khuyên-dùng)
5. [Triển khai lên server — PM2](#5-triển-khai-lên-server--pm2)
6. [Cloudflare Tunnel (HTTPS công khai)](#6-cloudflare-tunnel-https-công-khai)
7. [Sao lưu và khôi phục](#7-sao-lưu-và-khôi-phục)
8. [Đồng bộ Actual Budget (tùy chọn)](#8-đồng-bộ-actual-budget-tùy-chọn)
9. [App iOS](#9-app-ios)
10. [Cách dùng bot Telegram](#10-cách-dùng-bot-telegram)
11. [Xử lý sự cố](#11-xử-lý-sự-cố)

## 1. Kiến trúc

```
packages/core   bộ phân tích tin nhắn tiếng Việt (số tiền, ngày, danh mục) — dùng chung
apps/server     Fastify (REST API) + grammY (bot Telegram) + SQLite, 1 process
apps/web        React PWA — Nhập nhanh, Lịch sử, Báo cáo, Danh mục, Cài đặt
apps/web/ios    Dự án Capacitor (SPM) — vỏ iOS bọc quanh web, build bằng GitHub Actions
deploy/         Dockerfile, docker-compose.yml, ecosystem.config.cjs (PM2), cloudflared/
```

Chỉ một server Node duy nhất phục vụ cả bot Telegram, API REST, và file
tĩnh của web (SPA). Dữ liệu là một file SQLite duy nhất — không cần
database server riêng.

## 2. Chuẩn bị BotFather

1. Mở [@BotFather](https://t.me/BotFather) trên Telegram, gửi `/newbot`,
   đặt tên và username (phải kết thúc bằng `bot`).
2. Lưu lại **token** BotFather trả về — đây là `TELEGRAM_BOT_TOKEN`.
3. Lấy Telegram ID của bạn bằng cách nhắn `/start` cho
   [@userinfobot](https://t.me/userinfobot) — đây là giá trị đầu tiên
   trong `ALLOWED_TELEGRAM_IDS`.
4. **Chỉ cần khi dùng web (Telegram Login Widget):** gửi `/setdomain` cho
   BotFather, chọn bot của bạn, nhập domain công khai của server (ví dụ
   `chitieu.cuongmc.id.vn`, không có `https://`). Không làm bước này thì
   trang đăng nhập web vẫn dùng được qua **mã ghép nối** (`/ketnoi`), chỉ
   là không có nút "Đăng nhập bằng Telegram".

## 3. Chạy thử trên máy dev

Yêu cầu: Node ≥ 22, [pnpm](https://pnpm.io) ≥ 12 (`npm i -g pnpm@12`).

```bash
git clone <url-repo-cua-ban> chitieu
cd chitieu
pnpm install
cp apps/server/.env.example apps/server/.env
```

Mở `apps/server/.env`, điền tối thiểu `TELEGRAM_BOT_TOKEN` và
`ALLOWED_TELEGRAM_IDS`, rồi:

```bash
pnpm dev
```

Lệnh này chạy đồng thời server (polling Telegram, cổng 3333) và web dev
server (Vite, có proxy `/api` sang cổng 3333). Nhắn thử "phở 45k" cho bot,
hoặc mở `http://localhost:5173` cho web, gõ `/ketnoi` trên Telegram để lấy
mã 6 số đăng nhập web.

Trước khi triển khai thật, chạy toàn bộ test:

```bash
pnpm typecheck && pnpm test
```

## 4. Triển khai lên server — Docker Compose (khuyên dùng)

Yêu cầu: một server Linux có Docker + Docker Compose. Không cần cài Node,
pnpm, hay bất kỳ gì khác trên server — mọi thứ build trong container.

```bash
git clone <url-repo-cua-ban> chitieu
cd chitieu
cp apps/server/.env.example apps/server/.env
# sửa apps/server/.env: điền TELEGRAM_BOT_TOKEN, ALLOWED_TELEGRAM_IDS, ...

docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
```

Kiểm tra:

```bash
curl http://127.0.0.1:3333/api/health
docker compose -f deploy/docker-compose.yml logs -f chitieu
```

Server chỉ nghe trên `127.0.0.1:3333` (không mở ra Internet trực tiếp) —
xem [mục 6](#6-cloudflare-tunnel-https-công-khai) để có HTTPS công khai.
Dữ liệu (SQLite + backup) nằm trong volume Docker `chitieu-data`, sống sót
qua `docker compose down`/`up` và cập nhật image.

**Cập nhật lên bản mới:**

```bash
git pull
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
```

## 5. Triển khai lên server — PM2

Dùng khi bạn muốn chạy trực tiếp bằng Node (không Docker) — ví dụ server
đã có Node sẵn, hoặc muốn dễ debug bằng `pm2 logs`.

Yêu cầu: Node ≥ 22, pnpm ≥ 12, [PM2](https://pm2.keymetrics.io/)
(`npm i -g pm2`).

```bash
git clone <url-repo-cua-ban> chitieu
cd chitieu
pnpm install
cp apps/server/.env.example apps/server/.env
# sửa apps/server/.env

pnpm --filter @chitieu/server build
pnpm --filter @chitieu/web build
pm2 start deploy/ecosystem.config.cjs
pm2 save        # để PM2 tự khởi động lại app sau khi server reboot
```

`apps/server/.env` được app tự đọc lúc khởi động
(`process.loadEnvFile()`), PM2 không cần truyền biến môi trường nào
thêm. Dữ liệu SQLite và backup nằm trong `apps/server/data/` và
`apps/server/backups/` theo đường dẫn tương đối mặc định trong `.env`.

**Cập nhật lên bản mới:**

```bash
git pull
pnpm install
pnpm --filter @chitieu/server build
pnpm --filter @chitieu/web build
pm2 restart chitieu
```

## 6. Cloudflare Tunnel (HTTPS công khai)

Cần thiết nếu muốn dùng web từ ngoài (không chỉ localhost) hoặc dùng
Telegram Login Widget/`BOT_MODE=webhook`. Không cần mở port trên router —
Cloudflare Tunnel tạo kết nối ra ngoài từ server, không cần IP tĩnh.

```bash
# Trên server (ngoài container, hoặc dùng service cloudflared trong
# docker-compose.yml — xem comment trong file đó):
cloudflared tunnel login
cloudflared tunnel create chitieu
cloudflared tunnel route dns chitieu chitieu.cuongmc.id.vn
```

Copy [`deploy/cloudflared/config.yml`](deploy/cloudflared/config.yml) vào
`~/.cloudflared/config.yml`, sửa `tunnel:` và `credentials-file:` theo
Tunnel vừa tạo, rồi:

```bash
cloudflared tunnel run chitieu
# hoặc cài chạy nền: sudo cloudflared service install
```

> [!WARNING]
> **Không đặt Cloudflare Access (hay bất kỳ lớp xác thực nào của
> Cloudflare)** trước domain này. App iOS gọi thẳng `/api/*` bằng Bearer
> token, không đi qua trình duyệt nên không "đăng nhập" được với
> Cloudflare Access — làm vậy app iOS sẽ không hoạt động được. Việc xác
> thực người dùng đã do chính app lo (Telegram Login Widget cho web, mã
> ghép nối cho web/iOS).

Sau khi tunnel chạy, đặt `PUBLIC_URL=https://chitieu.cuongmc.id.vn` trong
`.env` và khởi động lại app (nếu dùng `BOT_MODE=webhook`; với
`BOT_MODE=polling` mặc định, `PUBLIC_URL` chỉ ảnh hưởng CSRF/Login
Widget, không cần webhook).

## 7. Sao lưu và khôi phục

Server tự sao lưu SQLite hằng ngày theo `BACKUP_CRON` (mặc định 03:00),
giữ `BACKUP_KEEP` bản gần nhất (mặc định 30), lưu trong `BACKUP_DIR`.
Tùy chọn: đặt `BACKUP_TELEGRAM_CHAT_ID` (Telegram ID của bạn) để bot gửi
thêm bản sao lưu đã gzip vào Telegram sau mỗi lần backup — có bản sao lưu
ngoài server, không phụ thuộc ổ đĩa server còn sống.

**Sao lưu ngay (không đợi cron):**

```bash
# Docker:
docker compose -f deploy/docker-compose.yml exec chitieu node dist/backup-now.mjs

# PM2 / chạy trực tiếp (đã pnpm --filter @chitieu/server build trước đó):
cd apps/server && pnpm backup:now
```

**Khôi phục từ một bản sao lưu:** dừng server trước, khôi phục, rồi chạy
lại.

```bash
# PM2:
pm2 stop chitieu
cd apps/server && pnpm restore ./backups/chitieu-20260101-0300.db
pm2 start chitieu

# Docker (đường dẫn backup là đường dẫn TRONG container, dưới /data/backups):
docker compose -f deploy/docker-compose.yml stop chitieu
docker compose -f deploy/docker-compose.yml run --rm chitieu \
  node dist/restore.mjs /data/backups/chitieu-20260101-0300.db
docker compose -f deploy/docker-compose.yml start chitieu
```

Script `restore` kiểm tra `PRAGMA integrity_check` trước khi khôi phục,
và đổi tên DB hiện tại thành `<tên>.before-restore-<thời điểm>` thay vì
xóa — không mất dữ liệu nếu chọn nhầm file.

## 8. Đồng bộ Actual Budget (tùy chọn)

Nếu bạn đã dùng [Actual Budget](https://actualbudget.org/) và muốn giao
dịch từ Chi Tiêu tự động chảy sang đó (một chiều: Chi Tiêu → Actual,
không ngược lại), điền vào `.env`:

```
ACTUAL_SERVER_URL=https://actual.vidu.com
ACTUAL_PASSWORD=mat-khau-server-actual
ACTUAL_SYNC_ID=id-cua-budget-actual   # lấy trong Settings → Show advanced settings
```

Khởi động lại app — đồng bộ tự chạy mỗi `ACTUAL_SYNC_INTERVAL_MIN` phút
(mặc định 5). App tự tạo account tên `ACTUAL_ACCOUNT_NAME` (mặc định
"Chi Tiêu") và các nhóm/danh mục còn thiếu trong Actual, khớp theo tên
danh mục. Khoản chi/thu mới, sửa, hoặc xóa trong Chi Tiêu đều được phản
ánh sang Actual ở lượt đồng bộ kế tiếp. Actual lỗi hoặc không kết nối
được thì chỉ ghi log — không ảnh hưởng bot/web/app, dữ liệu SQLite của
Chi Tiêu luôn là nguồn gốc.

Nếu budget Actual có đặt mật khẩu mã hóa (end-to-end encryption), thêm
`ACTUAL_ENCRYPTION_PASSWORD`. Nếu có nhiều Telegram ID trong
`ALLOWED_TELEGRAM_IDS` nhưng chỉ muốn đồng bộ một người, đặt
`ACTUAL_USER_TELEGRAM_ID`.

## 9. App iOS

Máy dev không có Mac, nên `.ipa` được build tự động qua GitHub Actions
(runner macOS thật). Hướng dẫn đầy đủ (đẩy code lên GitHub, chạy
workflow, tải `.ipa`, cài lên iPhone qua AltStore/SideStore/Sideloadly,
hoặc ký bằng tài khoản Apple Developer): xem
[`docs/ios-build.md`](docs/ios-build.md).

Nếu không muốn sideload gì cả, mở trang web bằng Safari trên iPhone rồi
**"Thêm vào màn hình chính"** — chạy như app, có hàng đợi offline, chỉ
thiếu vài tính năng native (haptics, StatusBar theo giao diện).

## 10. Cách dùng bot Telegram

- Nhắn thẳng: `phở 45k`, `xăng 70k`, `lương +15tr`, hoặc nhiều khoản một
  lúc (mỗi khoản một dòng, hoặc ngăn bằng `;`).
- Sửa lại tin đã gửi — bot tự cập nhật giao dịch tương ứng, không tạo
  bản trùng.
- Bấm nút [🏷 Đổi danh mục] trên tin xác nhận — lần sau gõ từ giống vậy,
  bot tự nhớ danh mục.
- Lệnh: `/homnay`, `/tuan`, `/thang` (báo cáo), `/xoa` (xóa khoản gần
  nhất, có nút khôi phục), `/danhmuc` (xem danh mục), `/ngansach` (đặt
  ngân sách — ví dụ `/ngansach ăn uống 3tr` hoặc `/ngansach tổng 10tr`),
  `/nhacnho` (bật/tắt nhắc 21:30 nếu chưa ghi gì hôm đó), `/ketnoi` (lấy
  mã 6 số để đăng nhập web/app), `/xuat` (xuất CSV), `/huongdan`.

## 11. Xử lý sự cố

**Bot không trả lời:** kiểm tra `TELEGRAM_BOT_TOKEN` đúng, Telegram ID
của bạn có trong `ALLOWED_TELEGRAM_IDS` (phân biệt số, không phải
username), xem log (`docker compose logs -f chitieu` hoặc `pm2 logs
chitieu`).

**`/api/health` không phản hồi:** container/process có đang chạy không
(`docker compose ps` / `pm2 status`); nếu chạy Docker, kiểm tra cổng
`127.0.0.1:3333` có bị process khác chiếm không.

**Web đăng nhập bằng Telegram Login Widget không hiện nút:** cần
`/setdomain` trên BotFather trỏ đúng domain, và domain đó phải chạy
HTTPS thật (qua Cloudflare Tunnel) — Login Widget không chạy trên
`http://` hay IP thô. Dùng mã ghép nối (`/ketnoi`) để không phụ thuộc
bước này.

**App iOS không đăng nhập được / mất kết nối:** kiểm tra không có
Cloudflare Access nào chặn trước domain (xem cảnh báo ở
[mục 6](#6-cloudflare-tunnel-https-công-khai)); server phải chạy
`BOT_MODE=polling` hoặc webhook đúng `PUBLIC_URL`, mã ghép nối chưa hết
hạn (5 phút) hoặc chưa bị vô hiệu (sai quá 5 lần — gõ `/ketnoi` lấy mã
mới).

**Đồng bộ Actual không chạy:** cần đủ cả 3 biến
`ACTUAL_SERVER_URL`/`ACTUAL_PASSWORD`/`ACTUAL_SYNC_ID` — thiếu một là
tắt hẳn, không báo lỗi. Xem log tìm dòng "Đồng bộ Actual Budget thất
bại" để biết chi tiết.

**Muốn xem/query trực tiếp dữ liệu:** SQLite là một file thường
(`DB_PATH`, hoặc `/data/chitieu.db` trong Docker) — dùng
`sqlite3 chitieu.db` hoặc bất kỳ trình xem SQLite nào. **Dừng server
trước** khi copy file ra ngoài để tránh đọc lúc đang có WAL chưa
checkpoint.

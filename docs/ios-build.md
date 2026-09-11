# Build app iOS (.ipa) bằng GitHub Actions

Vì máy dev không có Mac, việc dựng file `.ipa` được giao hết cho GitHub
Actions (runner `macos-26`, xem [`.github/workflows/ios.yml`](../.github/workflows/ios.yml)).

## 1. Đưa code lên GitHub

```bash
gh repo create <ten-repo> --private --source=. --remote=origin
git push -u origin master
```

(Hoặc tạo repo trên github.com rồi `git remote add origin <url>` như thường.)

## 2. Chạy thử workflow (không cần tag)

Vào tab **Actions** trên GitHub → chọn workflow **Build iOS (.ipa)** → **Run workflow**
(nút "Run workflow" xuất hiện vì workflow có `workflow_dispatch`). Cách này build
thử ngay mà không cần tag, phiên bản sẽ là `0.0.<số lần chạy>`.

## 3. Phát hành một phiên bản qua tag

```bash
git tag v0.1.0
git push origin v0.1.0
```

Đẩy tag khớp `v*` sẽ tự chạy workflow, và khi xong sẽ tự đính kèm file `.ipa`
vào một **GitHub Release** ứng với tag đó.

## 4. Lấy file .ipa

- **Từ Release:** vào tab **Releases**, tải `ChiTieu-unsigned.ipa` (và
  `ChiTieu-signed.ipa` nếu repo đã cấu hình ký, xem mục 6).
- **Từ Actions:** vào lần chạy workflow tương ứng → mục **Artifacts** ở cuối
  trang → tải `ChiTieu-unsigned-ipa`.

## 5. Cài lên iPhone

File `.ipa` **chưa ký** không thể cài trực tiếp qua App Store hay iTunes/Finder —
Apple chỉ cho chạy app chưa ký nếu được ký lại bằng một trong các cách sau:

- **[AltStore](https://altstore.io/) hoặc [SideStore](https://sidestore.io/)** —
  dùng Apple ID thường (miễn phí), tự ký lại app mỗi 7 ngày, cần cắm máy vào
  Mac/PC định kỳ để làm mới (hoặc dùng chế độ "AltServer" qua Wi-Fi).
- **[Sideloadly](https://sideloadly.io/)** (Windows/Mac) — tương tự AltStore,
  ký và cài trực tiếp qua cáp USB, cũng cần ký lại mỗi 7 ngày với Apple ID
  miễn phí.
- **Có tài khoản Apple Developer ($99/năm):** cấu hình đủ 4 secret ở mục 6 để
  workflow tự xuất bản `.ipa` **đã ký**, cài qua Sideloadly/AltStore/Xcode mà
  không cần ký lại thường xuyên (hạn theo provisioning profile, thường 1 năm).

Nếu không muốn sideload gì cả, cách đơn giản nhất vẫn là mở
`https://chitieu.cuongmc.id.vn` trên Safari và **"Thêm vào màn hình chính"**
(PWA) — không cần file `.ipa`, không cần ký lại bao giờ, chỉ thiếu vài tính
năng "native" như haptics.

## 6. Ký tự động (tùy chọn)

Thêm 4 secret sau vào **Settings → Secrets and variables → Actions** của repo
để workflow tự ký:

| Secret | Nội dung |
|---|---|
| `IOS_P12_BASE64` | File chứng chỉ `.p12` (Development hoặc Distribution), mã hóa base64: `base64 -i Certificate.p12 \| pbcopy` |
| `IOS_P12_PASSWORD` | Mật khẩu đặt khi xuất file `.p12` |
| `IOS_PROVISION_PROFILE_BASE64` | File `.mobileprovision` tương ứng, mã hóa base64 |
| `APPLE_TEAM_ID` | Team ID trong Apple Developer (10 ký tự) |

Tùy chọn thêm biến (**Settings → Secrets and variables → Actions → Variables**)
`IOS_EXPORT_METHOD` = `development` (mặc định, cài qua Sideloadly/AltStore) hoặc
`ad-hoc`/`app-store` tùy loại provisioning profile.

Muốn đẩy thẳng lên **TestFlight**, thêm thêm 3 secret:

| Secret | Nội dung |
|---|---|
| `ASC_KEY_ID` | Key ID của App Store Connect API key |
| `ASC_ISSUER_ID` | Issuer ID tương ứng |
| `ASC_KEY_P8_BASE64` | File `AuthKey_xxx.p8`, mã hóa base64 |

**Không bao giờ commit các file chứng chỉ/profile vào repo** — chỉ đưa qua
GitHub Secrets. Thiếu secret nào thì workflow tự bỏ qua bước ký, không báo lỗi.

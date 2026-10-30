# Chạy trên simulator và máy thật

## Simulator

```bash
pnpm install          # tải cả rnllama.xcframework (script postinstall của llama.rn)
pnpm prebuild
pnpm ios
```

- `pnpm-workspace.yaml` cho phép script `postinstall` của `llama.rn` chạy (`onlyBuiltDependencies`). Script tải framework llama.cpp dựng sẵn từ GitHub release và kiểm tra SHA-256. Nếu thiếu, build iOS báo `'rnllama/rn-llama.h' file not found`; chạy `pnpm rebuild llama.rn` rồi `pod install` trong `ios/`.
- Simulator không có Metal, model chạy bằng CPU. Dùng model ≤ 1B; tốc độ chậm là bình thường.
- Muốn làm UI mà không cần model: `EXPO_PUBLIC_MULL_ENGINE=mock pnpm start`, rồi mở lại app.
- Màn dev: `xcrun simctl openurl booted "mull://dev/engine"` để nạp model, stream, dừng, giải phóng và xem TTFT, tok/s.
- Background URLSession trên simulator không phản ánh đúng máy thật; các tiêu chí tải nền phải kiểm lại trên máy.

## Máy thật

Entitlement `increased-memory-limit` và `extended-virtual-addressing` chỉ được thêm khi build qua EAS (`development`, `staging`, `production`), vì cần provisioning profile có hai quyền này. Build local lên máy thật với tài khoản miễn phí sẽ không có chúng, nên model 3B trở lên dễ bị iOS tắt.

```bash
eas login                       # tài khoản leanhtuan1994
eas init                        # tạo project "mull", rồi chép id vào EAS_PROJECT_ID trong env.js
pnpm build:development:ios      # dev client có entitlement
```

### Checklist đo trên máy thật

Làm trên một iPhone 6 GB (iPhone 13/14) và một iPhone 8 GB (15 Pro trở lên). Ghi kết quả vào báo cáo nghiệm thu.

- [ ] TTFT và tok/s của model 3B Q4 với prompt ngắn, 5 lần mỗi máy (màn `mull://dev/engine` in ra cả hai số). Mục tiêu dự kiến: TTFT ≤ 3 giây, ≥ 10 tok/s trên máy 8 GB.
- [ ] RAM đỉnh khi chạy model lớn nhất mà mỗi máy thấy trong nhóm "Chạy tốt" (Xcode › Debug Navigator › Memory). Nếu bị jetsam, tăng `minRamGB` cho model đó.
- [ ] 20 lượt hỏi đáp liên tiếp không crash; đổi model giữa chừng không crash.
- [ ] Tải model ≥ 1 GB, đưa app vào nền 5 phút rồi quay lại; tắt hẳn app giữa chừng rồi mở lại. Lượt tải phải tiếp tục hoặc bắt đầu lại sạch sẽ, không bao giờ có file hỏng được đánh dấu đã tải.
- [ ] Gây cảnh báo bộ nhớ (mở nhiều app nặng) trong lúc chat: phải hiện thẻ "iPhone sắp hết bộ nhớ".
- [ ] Bật chế độ máy bay, gửi tin: câu trả lời vẫn hiện dần.
- [ ] Proxyman: trong một phiên chat không có request nào ngoài tải file model.

## Kiểm thử E2E (Maestro)

Chỉ iOS. Chạy Metro rồi chạy các flow với dev build trên simulator đã boot:

```bash
EXPO_PUBLIC_MULL_ENGINE=mock pnpm start   # câu trả lời giả lập, nhanh
pnpm e2e-test
```

- `onboarding-download-chat` xoá dữ liệu app rồi tải Qwen3 0.6B (~400 MB) từ Hugging Face. Flow này cũng chạy được với engine thật (chạy Metro không có `EXPO_PUBLIC_MULL_ENGINE`), nhưng trên CPU của simulator mỗi câu trả lời mất vài phút.
- Các flow sau dùng lại trạng thái đó: một model đã tải và một chat tên "Lượng tử hoá là gì?".
- `delete-model` chạy cuối vì nó xoá model. Model đang nạp trong bộ nhớ hiện "Đang dùng" thay cho nút xoá, nên cần khởi động lại app hoặc giải phóng model trước.

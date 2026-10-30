# Mull

Trợ lý AI riêng tư chạy ngay trên iPhone. Mull tải một model ngôn ngữ nhỏ (GGUF) về máy rồi trò chuyện hoàn toàn offline: không tài khoản, không máy chủ, không thu thập dữ liệu. Mạng chỉ dùng để tải file model.

- iPhone, iOS 17 trở lên. Giao diện tiếng Việt, có sáng/tối.
- Engine: [llama.rn](https://github.com/mybigday/llama.rn) (llama.cpp, Metal trên máy thật, CPU trên simulator).
- Danh mục model đóng gói trong app (`src/features/models/catalog.json`), file tải từ Hugging Face, kiểm tra SHA-256 trước khi dùng.

## Bắt đầu

Yêu cầu: Node 22, pnpm 10, Xcode 27, CocoaPods.

```bash
pnpm install
pnpm prebuild        # sinh thư mục ios/
pnpm ios             # build và chạy trên iOS Simulator
```

Trên simulator, model chạy bằng CPU nên rất chậm; hãy chọn model ≤ 1B (onboarding chỉ đề xuất các model này khi chạy trên simulator). Muốn làm UI mà không chờ model, chạy Metro với engine giả lập:

```bash
EXPO_PUBLIC_MULL_ENGINE=mock pnpm start
```

## Kiểm tra

```bash
pnpm check-all       # lint, type-check, kiểm tra file dịch, unit test
pnpm e2e-test        # Maestro trên iOS Simulator (xem docs/running-on-device.md)
```

## Tài liệu

- [Kiến trúc](docs/architecture.md)
- [Thêm model vào danh mục](docs/model-catalog.md)
- [Chạy trên simulator và máy thật](docs/running-on-device.md)
- Yêu cầu và kế hoạch: `plans/`

## Nguồn gốc

Dựng từ template [react-native-caracal](https://github.com/leanhtuan1994/react-native-caracal) (Expo SDK 58, React Native 0.88, Uniwind + HeroUI Native). Một số bài học về vòng đời model, ngân sách RAM và ước lượng token tham khảo từ [private-mind](https://github.com/software-mansion-labs/private-mind).

## Giấy phép

Mã nguồn: MIT (xem `LICENSE`). Mỗi model có giấy phép riêng, ghi trong danh mục và trong mục Cài đặt › Giới thiệu.

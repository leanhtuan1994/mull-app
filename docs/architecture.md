# Kiến trúc Mull

Mull là app Expo (SDK 58, React Native 0.88, New Architecture) chỉ chạy trên iPhone. Mọi thứ nằm trên máy: model, lịch sử chat, cài đặt. Mạng chỉ dùng để tải file model từ Hugging Face.

## Các lớp

```
UI (expo-router)            src/app, src/components
   │  hooks: useChat, useLlm, useModels, useSettings
Stores (zustand)            src/features/{chat,llm,models,settings}
   │  phụ thuộc truyền vào → test được bằng MockEngine, SQLite trong bộ nhớ, transport giả
Hạ tầng                     LlmEngine (llama.rn) · expo-sqlite · MMKV · background URLSession · MullFiles (Swift)
```

`src/features/services.ts` tạo các singleton (engine, `llm`, `chat`, model store) và hàm `bootstrap()` mà root layout chờ trước khi hiện màn đầu tiên:

1. Mở SQLite, chạy migration (`src/db/migrations.ts`, theo `PRAGMA user_version`), bật WAL và khoá ngoại.
2. Đồng bộ catalog vào bảng `models`, gieo 3 preset lời nhắc gốc.
3. Nối lại các lượt tải chạy nền, kiểm tra các file đã tải xong khi app đang tắt, và đối chiếu DB với đĩa.
4. Giữ `defaultModelId` trỏ tới một model có trên máy.

## Engine và vòng đời model

- `LlmEngine` (`src/features/llm/engine.ts`): `load`, `generate(messages, sampling, onToken)`, `stop`, `unload`, `countTokens?`.
- `LlamaRnEngine`: `initLlama` với `n_ctx` theo catalog (2048), `n_gpu_layers` 99 trên máy thật (Metal), 0 trên simulator. Model kiểu Qwen3 được gọi với `enable_thinking: false`, và khối `<think>` (nếu có) bị lọc khỏi stream.
- `MockEngine`: phát lại câu trả lời mẫu theo từng token. Bật cho cả app bằng `EXPO_PUBLIC_MULL_ENGINE=mock`.
- `createLlmStore` (`llm-store.ts`): một hàng đợi tuần tự cho `ensureLoaded`, warm-up, `generate` và `unload`. `stop()` đi thẳng tới engine. Vì vậy model không bao giờ bị giải phóng khi đang sinh câu trả lời (crash đã biết của llama.cpp). Yêu cầu sinh còn đang chờ trong hàng đợi mà bị dừng sẽ trả về kết quả rỗng có cờ `stopped`.
- `useAppLifecycle`: vào nền thì dừng câu trả lời (phần dở được lưu), sau 60 giây ở nền thì giải phóng model; cảnh báo bộ nhớ của iOS thì giải phóng ngay và hiện thẻ lỗi.

## Chat

`createChatStore` (`src/features/chat/chat-store.ts`):

- Tin nhắn đầu tiên tạo bản ghi chat (tiêu đề cắt ở 40 ký tự) và chép nội dung preset mặc định vào `chats.systemPrompt`.
- `buildPrompt` (`context-budget.ts`) ghép lời nhắc của model (catalog) với lời nhắc của chat, rồi nhét các tin mới nhất vừa `contextTokens − reserve`. `reserve` = độ dài câu trả lời (256/512/1024), tối thiểu 25% context và 256 token. Token được ước lượng theo loại chữ (`token-estimate.ts`): ASCII 0,25, chữ Latin có dấu 0,5, CJK 1,0 token/ký tự.
- Token được gom vào buffer và đẩy lên UI mỗi `requestAnimationFrame`. Câu trả lời chỉ được ghi vào SQLite một lần khi kết thúc, kèm `tokensPerSecond`, `timeToFirstToken`, `tokenCount`, `stoppedByUser`.
- Rời một chat khi đang sinh câu trả lời thì câu trả lời bị dừng và phần dở được lưu.

## Tải model

- `download-machine.ts`: máy trạng thái thuần `queued → downloading → verifying → done | failed | cancelled`, tối đa 2 lượt tải cùng lúc.
- `downloader.ts`: transport dùng `@kesha-antonov/react-native-background-downloader` (background `URLSession`, nối lại được sau khi app bị tắt qua `getExistingDownloadTasks`). Plugin của thư viện tự thêm `handleEventsForBackgroundURLSession` vào `AppDelegate`.
- `model-store.ts`: file tải về là `Application Support/models/<id>/model.gguf.download`. Chỉ khi khớp `sizeBytes` và SHA-256 (băm theo luồng 4 MB trong `modules/mull-files`, không chặn JS thread) file mới được đổi tên thành `model.gguf` và ghi `isDownloaded = 1`. Thư mục `models/` được gắn cờ `isExcludedFromBackup`.
- Trước khi tải (`use-start-download.ts`): cần dung lượng trống ≥ 110% kích thước file; đang dùng mạng di động mà chưa bật "Tải qua mạng di động" thì hỏi trước khi bắt đầu. Không đổi `allowsCellularAccess` của session: thư viện tạo lại URLSession khi đổi cấu hình này và huỷ mọi lượt tải đang chạy. Vì vậy một lượt tải bắt đầu qua Wi-Fi có thể tiếp tục qua mạng di động nếu Wi-Fi mất.

## Dữ liệu

| Nơi                          | Nội dung                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| SQLite `mull.db`             | `models`, `chats`, `messages`, `prompt_presets`, `messages_fts` (FTS5, `unicode61 remove_diacritics 2`)                 |
| MMKV                         | cài đặt nhỏ (`mull-settings`: onboarding, model mặc định, nhiệt độ, độ dài, mạng di động), giao diện (`SELECTED_THEME`) |
| `Application Support/models` | file GGUF, không sao lưu iCloud                                                                                         |

Tìm kiếm không dấu: tiêu đề chat và nội dung tin nhắn được chuẩn hoá bằng `normalizeVi()` (NFD, bỏ dấu, `đ → d`, chữ thường) trước khi ghi vào `messages_fts`; câu truy vấn cũng được chuẩn hoá như vậy, từ cuối cùng khớp theo tiền tố.

## Giao diện

- Token sáng/tối ở `src/themes/mull.css` (hướng B của prototype), thêm vào Uniwind ở `global.css`.
- Drawer từ `expo-router/drawer` (`drawerType: 'slide'`, rộng 310). `DrawerScene` thu nhỏ màn nội dung về 94% và bo góc 44 theo tiến trình vuốt; khi bật Reduce Motion thì drawer chuyển sang kiểu `front`, không thu nhỏ.
- Sheet (`model/[id]`, `model-picker`, `prompt-edit`) dùng `presentation: 'formSheet'` của native stack.
- Chữ theo Dynamic Type nhưng dừng ở 1,6× (`MAX_FONT_SCALE` trong `components/ui/text.tsx`, áp cho cả `TextInput`) để các cỡ trợ năng lớn nhất không làm vỡ thanh tiêu đề, pill và ô nhập.
- Kính mờ dùng `GlassLayer` (Liquid Glass trên iOS 26+, blur trên bản cũ); khi bật Reduce Transparency thì chuyển sang nền đặc.

## Kiểm thử

- Jest: các store và repository chạy với `MockEngine`, SQLite trong bộ nhớ (`src/db/test-db.ts`, dùng `node:sqlite` của Node 22 có FTS5) và transport/file giả.
- Maestro: `.maestro/mull/`, xem `.maestro/README.md`.

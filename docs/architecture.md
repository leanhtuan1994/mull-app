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

1. Mở SQLite, chạy migration (`src/db/migrations.ts`, theo `PRAGMA user_version`), bật WAL và khoá ngoại. Dọn bản nháp đính kèm cũ hơn 24 giờ và thư mục đính kèm không còn chủ.
2. Đồng bộ catalog vào bảng `models`, gieo 3 preset lời nhắc gốc.
3. Nối lại các lượt tải chạy nền, kiểm tra các file đã tải xong khi app đang tắt, và đối chiếu DB với đĩa.
4. Giữ `defaultModelId` trỏ tới một model chat có trên máy (`downloadedChatIds`, không bao giờ là model embedding).
5. Chạy tiếp các tài liệu đọc dở (`ingest.resume()`).

## Engine và vòng đời model

- `LlmEngine` (`src/features/llm/engine.ts`): `load`, `generate(messages, sampling, onToken)`, `stop`, `unload`, `countTokens?`.
- `LlamaRnEngine`: `initLlama` với `n_ctx` theo catalog, `n_gpu_layers` 99 trên máy thật (Metal), 0 trên simulator. Model kiểu Qwen3 được gọi với `enable_thinking: false`, và khối `<think>` (nếu có) bị lọc khỏi stream. Model đọc ảnh nạp thêm mmproj bằng `initMultimodal` (`image_max_tokens` chặn token mỗi ảnh, tắt `ctx_shift`). Tin nhắn có thể là `ContentPart[]` (chữ và ảnh).
- `LlamaRnEmbeddingEngine`: context riêng `embedding: true`, vector chuẩn hoá độ dài 1.
- `MockEngine`: phát lại câu trả lời mẫu theo từng token. Bật cho cả app bằng `EXPO_PUBLIC_MULL_ENGINE=mock`.
- `createLlmStore` (`llm-store.ts`): một hàng đợi tuần tự cho `ensureLoaded`, warm-up, `generate`, `embed`, `countTokens` và `unload`. Hàng đợi có hai mức: việc nền (các lô embed của tài liệu) luôn nhường cho việc thường, nên câu hỏi chỉ chờ tối đa một lô embed. Cảnh báo bộ nhớ gỡ model embedding trước, rồi mới tới model chat. `stop()` đi thẳng tới engine. Vì vậy model không bao giờ bị giải phóng khi đang sinh câu trả lời (crash đã biết của llama.cpp). Yêu cầu sinh còn đang chờ trong hàng đợi mà bị dừng sẽ trả về kết quả rỗng có cờ `stopped`.
- `useAppLifecycle`: vào nền thì dừng câu trả lời (phần dở được lưu), sau 60 giây ở nền thì giải phóng model; cảnh báo bộ nhớ của iOS thì giải phóng ngay và hiện thẻ lỗi.

## Chat

`createChatStore` (`src/features/chat/chat-store.ts`):

- Tin nhắn đầu tiên tạo bản ghi chat (tiêu đề cắt ở 40 ký tự) và chép nội dung preset mặc định vào `chats.systemPrompt`.
- `buildPrompt` (`context-budget.ts`) ghép lời nhắc của model (catalog) với lời nhắc của chat, rồi nhét các tin mới nhất vừa `contextTokens − reserve`. `reserve` = độ dài câu trả lời (256/512/1024), tối thiểu 25% context và 256 token. Token được ước lượng theo loại chữ (`token-estimate.ts`): ASCII 0,25, chữ Latin có dấu 0,5, CJK 1,0 token/ký tự.
- Token được gom vào buffer và đẩy lên UI mỗi `requestAnimationFrame`. Câu trả lời chỉ được ghi vào SQLite một lần khi kết thúc, kèm `tokensPerSecond`, `timeToFirstToken`, `tokenCount`, `stoppedByUser`.
- Rời một chat khi đang sinh câu trả lời thì câu trả lời bị dừng và phần dở được lưu.
- Ảnh: model đọc ảnh nhận ảnh của 2 tin gần nhất có ảnh; ảnh cũ hơn được thay bằng một dòng ghi chú. Model chữ chỉ nhận phần chữ.
- Tài liệu (`features/attachments`): khi đính kèm, `ingest` trích chữ (PDFKit hoặc đọc txt/md), làm sạch (NFC, gỡ token điều khiển của chat template), chia đoạn khoảng 350 token chồng 50, rồi embed từng lô 8 đoạn ở mức ưu tiên nền nếu có model embedding. Khi trả lời, `buildDocumentContext` đưa nguyên văn nếu mọi tài liệu của chat vừa 40% ngân sách, nếu không thì lấy các đoạn gần câu hỏi nhất (cosine, hoặc so từ khoá khi chưa có vector). Các đoạn được bọc trong thẻ `<tài_liệu>`, đặt trong lượt user, và nguồn được lưu ở `messages.sources`.
- Markdown (`markdown-text.tsx`): `react-native-enriched-markdown` (GFM, LaTeX bằng RaTeX, code tô màu bằng tree-sitter). `prepareMarkdown` chuyển `\(…\)` / `\[…\]` sang `$…$` / `$$…$$`, thay mọi ảnh bằng nhãn chữ (câu trả lời không bao giờ khiến app tải URL), bỏ link `mull:` do model tự viết, rồi mới gắn link trích dẫn `[n]` do app tạo. Khi đang stream, `remend` đóng tạm các dấu markdown còn dở.

## Tải model

- `download-machine.ts`: máy trạng thái thuần `queued → downloading → verifying → done | failed | cancelled`, tối đa 2 lượt tải cùng lúc.
- `downloader.ts`: transport dùng `@kesha-antonov/react-native-background-downloader` (background `URLSession`, nối lại được sau khi app bị tắt qua `getExistingDownloadTasks`). Plugin của thư viện tự thêm `handleEventsForBackgroundURLSession` vào `AppDelegate`.
- `model-store.ts`: mỗi model là một thư mục; model đọc ảnh có hai file (`model.gguf`, `mmproj.gguf`) tải lần lượt, id transfer là `<model>/<file>`. File tải về là `<file>.download`. Chỉ khi khớp `sizeBytes` và SHA-256 (băm theo luồng 4 MB trong `modules/mull-files`, không chặn JS thread) file mới được đổi tên thành `model.gguf` và ghi `isDownloaded = 1`. Thư mục `models/` được gắn cờ `isExcludedFromBackup`.
- Trước khi tải (`use-start-download.ts`): cần dung lượng trống ≥ 110% kích thước file; đang dùng mạng di động mà chưa bật "Tải qua mạng di động" thì hỏi trước khi bắt đầu. Không đổi `allowsCellularAccess` của session: thư viện tạo lại URLSession khi đổi cấu hình này và huỷ mọi lượt tải đang chạy. Vì vậy một lượt tải bắt đầu qua Wi-Fi có thể tiếp tục qua mạng di động nếu Wi-Fi mất.

## Dữ liệu

| Nơi                               | Nội dung                                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite `mull.db`                  | `models`, `chats`, `messages`, `prompt_presets`, `messages_fts` (FTS5, `unicode61 remove_diacritics 2`), `attachments`, `document_chunks` (vector Float32 dạng BLOB) |
| MMKV                              | cài đặt nhỏ (`mull-settings`: onboarding, model mặc định, nhiệt độ, độ dài, mạng di động), giao diện (`SELECTED_THEME`)                                              |
| `Application Support/models`      | file GGUF, không sao lưu iCloud                                                                                                                                      |
| `Application Support/attachments` | `drafts/<uuid>/` khi chưa gửi, `<chatId>/<uuid>/` khi đã gửi; không sao lưu iCloud. Đường dẫn lưu trong DB là tương đối                                              |

Tìm kiếm không dấu: tiêu đề chat và nội dung tin nhắn được chuẩn hoá bằng `normalizeVi()` (NFD, bỏ dấu, `đ → d`, chữ thường) trước khi ghi vào `messages_fts`; câu truy vấn cũng được chuẩn hoá như vậy, từ cuối cùng khớp theo tiền tố.

## Giao diện

- Token sáng/tối ở `src/themes/mull.css` (hướng B của prototype), thêm vào Uniwind ở `global.css`.
- Drawer từ `expo-router/drawer` (`drawerType: 'slide'`, rộng 310). `DrawerScene` thu nhỏ màn nội dung về 94% và bo góc 44 theo tiến trình vuốt; khi bật Reduce Motion thì drawer chuyển sang kiểu `front`, không thu nhỏ.
- Sheet (`model/[id]`, `model-picker`, `prompt-edit`, `source/[id]`) dùng `presentation: 'formSheet'` của native stack. `source/[id]` chỉ mở đoạn thuộc chat đang mở.
- Danh sách tin nhắn dùng `@legendapp/list` (`alignItemsAtEnd`, `initialScrollAtEnd`, `maintainScrollAtEnd`); khi bàn phím mở/đóng mà danh sách đang ở đáy thì cuộn lại về đáy. Lý do chọn: `plans/261030-1645-mull-v2-content-chat/reports/phase-03-scroll-report.md`.
- Chữ theo Dynamic Type nhưng dừng ở 1,6× (`MAX_FONT_SCALE` trong `components/ui/text.tsx`, áp cho cả `TextInput`) để các cỡ trợ năng lớn nhất không làm vỡ thanh tiêu đề, pill và ô nhập.
- Kính mờ dùng `GlassLayer` (Liquid Glass trên iOS 26+, blur trên bản cũ); khi bật Reduce Transparency thì chuyển sang nền đặc.

## Kiểm thử

- Jest: các store và repository chạy với `MockEngine`, SQLite trong bộ nhớ (`src/db/test-db.ts`, dùng `node:sqlite` của Node 22 có FTS5) và transport/file giả.
- Maestro: `.maestro/mull/`, xem `.maestro/README.md`.

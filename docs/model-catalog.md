# Danh mục model

Danh mục nằm trong app: `src/features/models/catalog.json`, được kiểm tra bằng zod ở `catalog-schema.ts` mỗi lần đọc qua `loadCatalog()`. Sau này có thể thêm nguồn từ xa trong `loadCatalog()` mà không phải sửa màn hình nào.

## Thêm một model

1. Chọn một repo GGUF **không bị khoá** (gated) trên Hugging Face, giấy phép cho phép phân phối lại, bản `Q4_K_M`.
2. Lấy URL ghim theo commit, SHA-256 và kích thước thật của file. Không tự điền tay:

   ```bash
   node scripts/catalog-file.mjs unsloth/Qwen3-1.7B-GGUF Qwen3-1.7B-Q4_K_M.gguf
   ```

   Lệnh in ra `{ url, sha256, sizeBytes }`. Model đọc ảnh chạy lệnh này thêm một lần cho file `mmproj-*.gguf`.

3. Thêm một mục vào `models`, URL ghim theo commit: `https://huggingface.co/<repo>/resolve/<commit>/<file>.gguf`.
4. Chạy `pnpm test catalog compatibility` để kiểm tra schema, id không trùng và nhóm RAM.

## Các trường

| Trường                                   | Ý nghĩa                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `id`                                     | Khoá ổn định, dùng làm tên thư mục trên đĩa và khoá trong DB. Không đổi sau khi phát hành.                 |
| `name`, `family`, `publisher`, `license` | Hiển thị. `family` quyết định màu ô chữ cái (`qwen`, `llama`, `gemma`, `smollm`, `phi`).                   |
| `params`                                 | Số tham số (tỉ).                                                                                           |
| `sizeBytes`, `sha256`, `url`             | File GGUF; app chỉ dùng file khi khớp cả kích thước lẫn SHA-256.                                           |
| `kind`                                   | `chat` (mặc định) hoặc `embedding`. Model embedding chỉ dùng để đọc tài liệu, không bao giờ là model chat. |
| `contextTokens`                          | `n_ctx` khi nạp model: 8192 với model ≤ 2B, 4096 với model 3–4B.                                           |
| `kvBytesPerToken`                        | KV cache f16 mỗi token: số lớp × số KV head × head dim × 2 × 2 byte. Tính vào ngân sách RAM.               |
| `vision?`                                | `{ mmproj: { url, sha256, sizeBytes }, imageMaxTokens }`. File mmproj tải sau file model, cùng thư mục.    |
| `embedding?`                             | `{ dimensions, queryPrefix, documentPrefix }`, bắt buộc với `kind: embedding`.                             |
| `thinking`                               | `true` với model kiểu Qwen3 tự "suy nghĩ" trước khi trả lời; app gọi với `enable_thinking: false`.         |
| `defaultSampling`                        | `topP`, `minP`, `repeatPenalty` theo khuyến nghị của model. Nhiệt độ lấy từ Cài đặt.                       |
| `systemPrompt?`                          | Lời nhắc riêng của model, ghép trước lời nhắc của người dùng.                                              |
| `labels`                                 | Nhãn năng lực, dịch ở `labels.*` trong file dịch.                                                          |
| `description`                            | `{ vi, en }`: mô tả theo ngôn ngữ của app, hiện ở màn chi tiết model.                                      |
| `minRamGB?`                              | Ghi đè công thức RAM. Dùng cho model mà công thức cho là vừa nhưng thực tế cần máy lớn hơn.                |
| `simulatorFriendly`                      | Model ≤ 1B, đủ nhanh để thử trên CPU của simulator. Onboarding trên simulator chỉ đề xuất các model này.   |

## Ngân sách RAM

- Ngân sách: `RAM × 0,6 × 0,95 − 0,5 GB` (RAM iOS báo về).
- Chi phí một model: tổng các file (model và mmproj) + KV cache ở ngữ cảnh đầy đủ (`contextTokens × kvBytesPerToken`) + 0,3 GB.
- Model "chạy tốt" khi chi phí ≤ ngân sách. `minRamGB` là ngưỡng sàn cộng thêm, không bao giờ cho model vượt ngân sách.
- Model chat và model embedding chỉ cùng nằm trong bộ nhớ khi tổng chi phí vừa ngân sách; nếu không thì nạp lần lượt.
- Model đề xuất: model lớn nhất có chi phí ≤ 85% ngân sách.

Hiện tại Qwen3 4B và Phi-4 mini (≈ 2,5 GB) đặt `minRamGB: 8`, để máy 6 GB không thấy chúng trong nhóm "Chạy tốt". Ngưỡng này cần kiểm lại khi có số đo trên máy thật.

## Danh mục hiện tại (2026-10-31)

| Model               | File                                           | Kích thước | Simulator |
| ------------------- | ---------------------------------------------- | ---------- | --------- |
| Qwen3 0.6B          | unsloth/Qwen3-0.6B-GGUF                        | 397 MB     | có        |
| Gemma 3 1B          | unsloth/gemma-3-1b-it-GGUF                     | 806 MB     | có        |
| Llama 3.2 1B        | bartowski/Llama-3.2-1B-Instruct-GGUF           | 808 MB     | có        |
| Qwen3 1.7B          | unsloth/Qwen3-1.7B-GGUF                        | 1,1 GB     |           |
| SmolLM3 3B          | unsloth/SmolLM3-3B-GGUF                        | 1,9 GB     |           |
| Llama 3.2 3B        | bartowski/Llama-3.2-3B-Instruct-GGUF           | 2,0 GB     |           |
| Phi-4 mini          | unsloth/Phi-4-mini-instruct-GGUF               | 2,5 GB     |           |
| Qwen3 4B (2507)     | unsloth/Qwen3-4B-Instruct-2507-GGUF            | 2,5 GB     |           |
| Qwen3-VL 2B         | Qwen/Qwen3-VL-2B-Instruct-GGUF (+ mmproj Q8_0) | 1,4 GB     |           |
| Qwen3-VL 4B         | Qwen/Qwen3-VL-4B-Instruct-GGUF (+ mmproj Q8_0) | 2,8 GB     |           |
| EmbeddingGemma 300M | ggml-org/embeddinggemma-300M-GGUF (embedding)  | 318 MB     | có        |

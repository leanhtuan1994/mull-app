/**
 * An answer that uses every markdown element Mull renders, with the math
 * syntaxes models actually produce. Used by the dev markdown screen, the
 * seeded long chat and the mock engine.
 */
import { mockTokenize } from '@/features/llm/mock-engine';

const FENCE = '```';
const TICK = '`';

export const MARKDOWN_SAMPLE = String.raw`## Lượng tử hoá model là gì?

Lượng tử hoá **giảm số bit** cho mỗi trọng số, nên model *nhẹ hơn* và chạy nhanh hơn trên iPhone. Đọc thêm ở [llama.cpp](https://github.com/ggml-org/llama.cpp).

> Một model 4B ở mức Q4 chỉ còn khoảng 2,4 GB, vừa với máy 8 GB.

### So sánh nhanh

| Mức | Bit/trọng số | Dung lượng 4B | Chất lượng |
|---|---:|---:|---|
| F16 | 16 | 8,0 GB | Gốc |
| Q8_0 | 8,5 | 4,3 GB | Gần như gốc |
| Q4_K_M | 4,8 | 2,4 GB | Tốt |

### Các bước

1. Tải file GGUF đã lượng tử hoá.
2. Kiểm SHA-256.
   - Sai thì tải lại.
   - Đúng thì ghi vào danh mục.
3. Nạp model bằng llama.rn.

- [x] Chạy offline
- [x] Không cần tài khoản
- [ ] Đọc giọng nói

### Công thức

Sai số lượng tử hoá với bước \(\Delta\) nằm trong \(\pm \Delta / 2\), còn dung lượng xấp xỉ:

\[
\text{size} \approx \frac{N \cdot b}{8} \ \text{byte}
\]

Với $N = 4 \times 10^9$ và $b = 4{,}8$ thì được khoảng 2,4 GB. Giá gói cước $5 hay $10 không phải công thức.

### Mã

${FENCE}swift
func modelSize(parameters: Double, bits: Double) -> Double {
    // Byte = tham số × bit / 8
    return parameters * bits / 8
}
${FENCE}

${FENCE}typescript
const sizeGB = (params: number, bits: number) =>
  (params * bits) / 8 / 1024 ** 3;
${FENCE}

Dùng ${TICK}sizeGB(4e9, 4.8)${TICK} để tính nhanh.

---

Hết ví dụ.`;

/** The sample split into model-sized pieces, for replaying it as a stream. */
export function markdownSampleTokens(): string[] {
  return mockTokenize(MARKDOWN_SAMPLE);
}

import type { NewChunk } from '@/db/repos';
import { estimateTokens } from '@/features/chat/token-estimate';

export type PageText = { page: number | null; text: string };

const MAX_TOKENS = 350;
const OVERLAP_TOKENS = 50;
/**
 * Also a hard cap in characters: the estimate counts digits and long ASCII
 * runs cheaply, but tokenizers split them finely, and an embedding batch
 * rejects a passage longer than its batch size.
 */
const MAX_CHARS = 1200;

/**
 * Chat-template markers a document could carry to forge a turn, such as
 * `<|im_start|>system`. Document text is data, never instructions.
 */
const CONTROL_TOKENS =
  /<\|[^|>\n]{1,40}\|>|<\/?(?:s|start_of_turn|end_of_turn|bos|eos|tài_liệu|__media__)>|\[\/?INST\]|<<\/?SYS>>/gi;

/** NFC text without template markers, control characters or ragged spacing. */
export function cleanDocumentText(text: string): string {
  return text
    .normalize('NFC')
    .replace(CONTROL_TOKENS, ' ')

    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const fits = (text: string) =>
  estimateTokens(text) <= MAX_TOKENS && text.length <= MAX_CHARS;

/** Splits a run with no usable spaces (a URL, base64, CJK) by length. */
function hardSplit(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += MAX_CHARS) {
    out.push(text.slice(i, i + MAX_CHARS));
  }
  return out;
}

/** Paragraphs, then sentences, then words: pieces that each fit one chunk. */
function pieces(text: string): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    if (!paragraph.trim()) continue;
    if (fits(paragraph)) {
      out.push(paragraph.trim());
      continue;
    }
    for (const sentence of paragraph.split(/(?<=[.!?…;:])\s+|\n/)) {
      if (fits(sentence)) {
        if (sentence.trim()) out.push(sentence.trim());
        continue;
      }
      let current = '';
      for (const word of sentence.split(/\s+/).flatMap(hardSplit)) {
        const next = current ? `${current} ${word}` : word;
        if (current && !fits(next)) {
          out.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) out.push(current);
    }
  }
  return out;
}

/**
 * Splits pages into passages of about 350 tokens that never cross a page,
 * each starting with the last ~50 tokens of the one before, so an answer
 * that straddles two passages is still found.
 */
export function chunkDocument(pages: PageText[]): NewChunk[] {
  const chunks: NewChunk[] = [];
  for (const { page, text } of pages) {
    let current: string[] = [];
    let tokens = 0;
    // Pieces added since the last passage; overlap alone is no passage.
    let fresh = 0;
    const flush = () => {
      if (fresh === 0) return;
      const body = current.join('\n');
      chunks.push({
        ord: chunks.length,
        page,
        text: body,
        tokenCount: estimateTokens(body),
      });
      // Carry the tail into the next passage, never the whole passage.
      const carried: string[] = [];
      let carriedTokens = 0;
      for (let i = current.length - 1; i > 0; i--) {
        const cost = estimateTokens(current[i]);
        if (carriedTokens + cost > OVERLAP_TOKENS) break;
        carried.unshift(current[i]);
        carriedTokens += cost;
      }
      current = carried;
      tokens = carriedTokens;
      fresh = 0;
    };
    for (const unit of pieces(cleanDocumentText(text))) {
      const cost = estimateTokens(unit);
      const length = current.reduce((sum, u) => sum + u.length + 1, 0);
      if (tokens + cost > MAX_TOKENS || length + unit.length > MAX_CHARS)
        flush();
      current.push(unit);
      tokens += cost;
      fresh += 1;
    }
    flush();
  }
  return chunks;
}

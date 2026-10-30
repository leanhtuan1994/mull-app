/**
 * Rough token counts by script, for when the engine cannot count exactly.
 * Vietnamese letters with diacritics usually split into more tokens than
 * plain ASCII, so they cost twice as much.
 */
const TOKENS_PER_CHAR = {
  ascii: 0.25,
  accentedLatin: 0.5,
  cjk: 1,
  emoji: 2,
  other: 0.5,
} as const;

/** Chat templates add a few tokens around each message. */
export const MESSAGE_OVERHEAD_TOKENS = 4;

function costOf(codePoint: number): number {
  if (codePoint < 0x80) return TOKENS_PER_CHAR.ascii;
  if (
    (codePoint >= 0x00c0 && codePoint <= 0x024f) || // Latin-1 supplement, Latin extended A/B
    (codePoint >= 0x1e00 && codePoint <= 0x1eff) || // Latin extended additional (Vietnamese)
    (codePoint >= 0x0300 && codePoint <= 0x036f) // combining marks
  ) {
    return TOKENS_PER_CHAR.accentedLatin;
  }
  if (
    (codePoint >= 0x3040 && codePoint <= 0x30ff) || // Hiragana, Katakana
    (codePoint >= 0x3400 && codePoint <= 0x9fff) || // CJK
    (codePoint >= 0xac00 && codePoint <= 0xd7af) // Hangul
  ) {
    return TOKENS_PER_CHAR.cjk;
  }
  if (codePoint >= 0x1f000) return TOKENS_PER_CHAR.emoji;
  return TOKENS_PER_CHAR.other;
}

export function estimateTokens(text: string): number {
  let total = 0;
  for (const char of text) total += costOf(char.codePointAt(0) ?? 0);
  return Math.ceil(total);
}

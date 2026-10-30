/**
 * Folds Vietnamese text for accent-insensitive search: decompose (NFD), drop
 * the combining marks, map đ/Đ to d and lower-case. "Lượng tử hoá" becomes
 * "luong tu hoa".
 */
export function normalizeVi(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turns user input into an FTS5 MATCH expression: every word must appear,
 * the last one as a prefix so results update while typing. Quotes keep FTS
 * operators in the input from being interpreted.
 */
export function toFtsQuery(input: string): string | null {
  const words = searchWords(input);
  if (words.length === 0) return null;
  return words
    .map((word, i) => (i === words.length - 1 ? `"${word}"*` : `"${word}"`))
    .join(' ');
}

/** The folded words of a search query, without FTS operator characters. */
export function searchWords(input: string): string[] {
  return normalizeVi(input)
    .replace(/["*^():{}[\]]/g, ' ')
    .split(' ')
    .filter(Boolean);
}

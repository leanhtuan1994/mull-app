import { normalizeVi, searchWords } from '@/lib/normalize-vi';

export type SearchExcerpt = { before: string; match: string; after: string };

const MARKDOWN = /[*_`#>|~]+/g;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const LEAD = 28;
const TAIL = 160;

/**
 * A short piece of `text` around the first query word it contains, ignoring
 * accents and case like the search itself, so the drawer can show why a chat
 * matched.
 */
export function searchExcerpt(
  text: string,
  query: string
): SearchExcerpt | null {
  const chars = Array.from(
    text.replace(MARKDOWN, '').replace(/\s+/g, ' ').trim()
  );
  if (chars.length === 0) return null;

  // Fold one character at a time so a position in the folded text maps back
  // to the original character.
  let folded = '';
  const starts = chars.map((char) => {
    const start = folded.length;
    folded += normalizeVi(char) || ' ';
    return start;
  });

  for (const word of searchWords(query)) {
    const at = findWordStart(folded, word);
    if (at < 0) continue;
    const first = starts.findLastIndex((start) => start <= at);
    let end = starts.findIndex((start) => start >= at + word.length);
    if (end < 0) end = chars.length;

    let from = Math.max(0, first - LEAD);
    if (from > 0) {
      const space = chars.indexOf(' ', from);
      from = space >= 0 && space < first ? space + 1 : from;
    }
    return {
      before: (from > 0 ? '…' : '') + chars.slice(from, first).join(''),
      match: chars.slice(first, end).join(''),
      after: chars.slice(end, end + TAIL).join(''),
    };
  }
  return { before: '', match: '', after: chars.slice(0, TAIL).join('') };
}

/** Like FTS prefix matching: the word must start a token. */
function findWordStart(folded: string, word: string): number {
  let at = folded.indexOf(word);
  while (at > 0 && WORD_CHAR.test(folded[at - 1])) {
    at = folded.indexOf(word, at + 1);
  }
  return at;
}

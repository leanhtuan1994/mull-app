import type { IndexedChunk } from '@/db/types';
import { searchWords } from '@/lib/normalize-vi';

/** Passages by cosine similarity; vectors are unit length, so a dot product. */
export function rankByVector(
  chunks: IndexedChunk[],
  query: ArrayLike<number>
): IndexedChunk[] {
  const scored = chunks
    .filter((c) => c.embedding && c.embedding.length === query.length)
    .map((chunk) => {
      let score = 0;
      const vector = chunk.embedding!;
      for (let i = 0; i < vector.length; i++) score += vector[i] * query[i];
      return { chunk, score };
    });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.chunk);
}

/**
 * Passages by how many of the question's words they contain, accents
 * ignored. Used until the embedding model has indexed the document.
 */
export function rankByWords(
  chunks: IndexedChunk[],
  question: string
): IndexedChunk[] {
  const words = new Set(searchWords(question).filter((w) => w.length > 1));
  const scored = chunks.map((chunk) => {
    const text = new Set(searchWords(chunk.text));
    let score = 0;
    for (const word of words) if (text.has(word)) score += 1;
    return { chunk, score };
  });
  // Stable sort keeps reading order among equal scores.
  return scored.sort((a, b) => b.score - a.score).map((s) => s.chunk);
}

/**
 * The best passages that fit `budgetTokens`, at most `limit`, then put back
 * in reading order so the model reads them as the document flows.
 */
export function pickPassages(
  ranked: IndexedChunk[],
  budgetTokens: number,
  limit = 6
): IndexedChunk[] {
  const picked: IndexedChunk[] = [];
  const seen = new Set<string>();
  let used = 0;
  for (const chunk of ranked) {
    if (picked.length >= limit) break;
    if (seen.has(chunk.text)) continue;
    if (used + chunk.tokenCount > budgetTokens) continue;
    picked.push(chunk);
    seen.add(chunk.text);
    used += chunk.tokenCount;
  }
  return picked.sort(
    (a, b) => a.attachmentId - b.attachmentId || a.ord - b.ord
  );
}

/**
 * Indexed passages by vector, then passages still without a vector by
 * words, so a document attached after another one is never invisible.
 */
export function rankMixed(
  chunks: IndexedChunk[],
  query: ArrayLike<number>,
  question: string
): IndexedChunk[] {
  const unindexed = chunks.filter(
    (c) => !c.embedding || c.embedding.length !== query.length
  );
  return [...rankByVector(chunks, query), ...rankByWords(unindexed, question)];
}

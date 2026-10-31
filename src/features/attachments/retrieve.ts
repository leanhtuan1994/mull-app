import type { IndexedChunk } from '@/db/types';
import { normalizeVi } from '@/lib/normalize-vi';

export type Scored = { chunk: IndexedChunk; score: number };

/** Candidates each ranking contributes before they are fused. */
const CANDIDATES = 20;
/** Reciprocal rank fusion constant, `1 / (k + rank)`; 60 is the usual default. */
const RRF_K = 60;
/**
 * A passage counts as relevant when its cosine is within this of the best
 * one. Measured with EmbeddingGemma on the handbook fixture: answers score
 * 0.44–0.70 and a question the document does not answer still reaches 0.47,
 * so only the gap to the best passage separates them. At 0.08 every answer
 * is kept, and one or two passages per question are chosen instead of 6.
 */
const SEMANTIC_GAP = 0.08;
/** ...or when its keyword score is at least this share of the best one. */
const KEYWORD_SHARE = 0.75;
/** Passages chosen for relevance; neighbours are added around them. */
const MAX_SEEDS = 4;
/** Passages sent in all, seeds and neighbours. */
const MAX_PASSAGES = 8;

/**
 * Folded words that carry no topic: question words and particles. Tones are
 * folded away, so "bao" also stands for "bảo"; the bigram ("bao hiem")
 * keeps those words findable.
 */
const STOPWORDS = new Set(
  (
    'a ai bao cac can co cua da dang de do duoc gi hay hoac khi khong la lam ma ' +
    'minh mot nao neu nhieu nhu nhung o oi roi sao se thi the theo toi trong va ' +
    'vay ve voi an and are can do does for how in is of on or the to what when ' +
    'where which who why'
  ).split(' ')
);

/** Folded words, then pairs of neighbouring words, without stopword-only terms. */
export function keywordTerms(text: string): string[] {
  const words = normalizeVi(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const terms = words.filter((w) => !STOPWORDS.has(w));
  for (let i = 1; i < words.length; i++) {
    if (STOPWORDS.has(words[i - 1]) && STOPWORDS.has(words[i])) continue;
    terms.push(`${words[i - 1]} ${words[i]}`);
  }
  return terms;
}

/** Passages by cosine similarity; vectors are unit length, so a dot product. */
export function rankByVector(
  chunks: IndexedChunk[],
  query: ArrayLike<number>
): Scored[] {
  return chunks
    .filter((c) => c.embedding && c.embedding.length === query.length)
    .map((chunk) => {
      let score = 0;
      const vector = chunk.embedding!;
      for (let i = 0; i < vector.length; i++) score += vector[i] * query[i];
      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Passages that share words with the question, by BM25, accents ignored.
 * Pairs of words count too, which keeps "nghỉ phép" apart from "nghỉ ốm"
 * and finds codes such as "KD-11". Works without an embedding model.
 */
export function rankByKeywords(
  chunks: IndexedChunk[],
  question: string
): Scored[] {
  const query = new Set(keywordTerms(question));
  if (query.size === 0 || chunks.length === 0) return [];
  const docs = chunks.map((chunk) => {
    const counts = new Map<string, number>();
    const terms = keywordTerms(chunk.text);
    for (const term of terms) {
      if (query.has(term)) counts.set(term, (counts.get(term) ?? 0) + 1);
    }
    return { chunk, counts, length: terms.length };
  });
  const average = docs.reduce((sum, d) => sum + d.length, 0) / docs.length;
  const idf = new Map<string, number>();
  for (const term of query) {
    const df = docs.filter((d) => d.counts.has(term)).length;
    idf.set(term, Math.log(1 + (docs.length - df + 0.5) / (df + 0.5)));
  }
  const k1 = 1.2;
  const b = 0.75;
  return docs
    .map(({ chunk, counts, length }) => {
      let score = 0;
      for (const [term, tf] of counts) {
        const norm = k1 * (1 - b + (b * length) / Math.max(1, average));
        score += (idf.get(term)! * tf * (k1 + 1)) / (tf + norm);
      }
      return { chunk, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Reciprocal rank fusion of several rankings, best first. */
export function fuseRankings(rankings: Scored[][]): IndexedChunk[] {
  const fused = new Map<number, { chunk: IndexedChunk; score: number }>();
  for (const ranking of rankings) {
    ranking.slice(0, CANDIDATES).forEach(({ chunk }, rank) => {
      const entry = fused.get(chunk.id) ?? { chunk, score: 0 };
      entry.score += 1 / (RRF_K + rank + 1);
      fused.set(chunk.id, entry);
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .map((e) => e.chunk);
}

/**
 * The passages most likely to answer `question`: the vector and keyword
 * rankings fused, keeping only passages close to the best of either, so a
 * small model is not handed unrelated text. Passages without a vector yet
 * are found by keywords alone.
 */
export function selectSeeds(
  chunks: IndexedChunk[],
  query: ArrayLike<number> | null,
  question: string
): IndexedChunk[] {
  const byVector = query ? rankByVector(chunks, query) : [];
  const byKeywords = rankByKeywords(chunks, question);
  const cosine = new Map(byVector.map((s) => [s.chunk.id, s.score]));
  const keyword = new Map(byKeywords.map((s) => [s.chunk.id, s.score]));
  const bestCosine = byVector[0]?.score ?? 0;
  const bestKeyword = byKeywords[0]?.score ?? 0;
  const relevant = (chunk: IndexedChunk) =>
    (cosine.has(chunk.id) &&
      cosine.get(chunk.id)! >= bestCosine - SEMANTIC_GAP) ||
    (keyword.has(chunk.id) &&
      keyword.get(chunk.id)! >= bestKeyword * KEYWORD_SHARE);
  // The same file attached twice would otherwise fill the seeds with copies.
  const seen = new Set<string>();
  return fuseRankings([byVector, byKeywords])
    .filter((chunk) => {
      if (!relevant(chunk) || seen.has(chunk.text)) return false;
      seen.add(chunk.text);
      return true;
    })
    .slice(0, MAX_SEEDS);
}

/**
 * Seeds first, then the passages right after and before each seed, as far
 * as `budgetTokens` allows; returned in reading order. With no
 * seed (a question without matching words, before indexing), the documents'
 * opening passages stand in.
 */
export function withNeighbours(
  seeds: IndexedChunk[],
  chunks: IndexedChunk[],
  budgetTokens: number
): IndexedChunk[] {
  const byPosition = new Map(
    chunks.map((c) => [`${c.attachmentId}:${c.ord}`, c])
  );
  const at = (chunk: IndexedChunk, offset: number) =>
    byPosition.get(`${chunk.attachmentId}:${chunk.ord + offset}`);
  const wanted =
    seeds.length > 0
      ? [...seeds, ...seeds.flatMap((s) => [at(s, 1), at(s, -1)])].filter(
          (c): c is IndexedChunk => c !== undefined
        )
      : chunks;

  const picked = new Map<number, IndexedChunk>();
  let used = 0;
  for (const chunk of wanted) {
    if (picked.size >= MAX_PASSAGES) break;
    if (picked.has(chunk.id) || used + chunk.tokenCount > budgetTokens)
      continue;
    picked.set(chunk.id, chunk);
    used += chunk.tokenCount;
  }
  return [...picked.values()].sort(
    (a, b) => a.attachmentId - b.attachmentId || a.ord - b.ord
  );
}

/**
 * `next` without the lines it repeats from the end of `previous`: each
 * passage starts with the tail of the one before, which the model need not
 * read twice when both are sent.
 */
export function withoutOverlap(previous: string, next: string): string {
  const before = previous.split('\n');
  const after = next.split('\n');
  for (let k = Math.min(before.length, after.length - 1); k > 0; k--) {
    const tail = before.slice(-k);
    if (tail.every((line, i) => line === after[i]))
      return after.slice(k).join('\n');
  }
  return next;
}

import type { IndexedChunk } from '@/db/types';
import { estimateTokens } from '@/features/chat/token-estimate';

import {
  fuseRankings,
  keywordTerms,
  rankByKeywords,
  selectSeeds,
  withNeighbours,
  withoutOverlap,
} from './retrieve';

function chunk(
  id: number,
  text: string,
  {
    embedding = null,
    attachmentId = 1,
  }: { embedding?: number[] | null; attachmentId?: number } = {}
): IndexedChunk {
  return {
    id,
    attachmentId,
    ord: id,
    page: null,
    text,
    tokenCount: estimateTokens(text),
    embedding: embedding && new Float32Array(embedding),
  };
}

const LEAVE = chunk(0, 'Nghỉ phép năm: mỗi người có 14 ngày phép.');
const SICK = chunk(1, 'Nghỉ ốm: báo quản lý trước 9 giờ sáng.');
const CODES = chunk(2, 'Mã phòng ban: Kế toán là KT-07, Kinh doanh là KD-11.');

describe('keywordTerms', () => {
  it('folds accents, drops question words and keeps word pairs', () => {
    expect(keywordTerms('Nghỉ phép bao nhiêu ngày?')).toEqual([
      'nghi',
      'phep',
      'ngay',
      'nghi phep',
      'phep bao',
      'nhieu ngay',
    ]);
  });
});

describe('rankByKeywords', () => {
  it('tells passages apart by word pairs', () => {
    const ranked = rankByKeywords([SICK, LEAVE], 'nghỉ phép');
    expect(ranked[0].chunk.id).toBe(LEAVE.id);
  });

  it('finds codes split by punctuation', () => {
    const ranked = rankByKeywords([LEAVE, SICK, CODES], 'KD-11 là phòng nào?');
    expect(ranked.map((s) => s.chunk.id)).toEqual([CODES.id]);
  });

  it('returns nothing when no word matches', () => {
    expect(rankByKeywords([LEAVE], 'thú cưng')).toEqual([]);
  });
});

describe('fuseRankings', () => {
  it('puts passages both rankings agree on first', () => {
    const fused = fuseRankings([
      [
        { chunk: SICK, score: 0.9 },
        { chunk: LEAVE, score: 0.8 },
      ],
      [
        { chunk: LEAVE, score: 3 },
        { chunk: CODES, score: 1 },
      ],
    ]);
    expect(fused.map((c) => c.id)).toEqual([LEAVE.id, SICK.id, CODES.id]);
  });
});

describe('selectSeeds', () => {
  const chunks = [
    chunk(0, 'Giờ làm việc từ 8 giờ.', { embedding: [1, 0, 0] }),
    chunk(1, 'Bãi xe ở tầng hầm.', { embedding: [0.95, 0.31, 0] }),
    chunk(2, 'Căng tin ở tầng hai.', { embedding: [0.6, 0.8, 0] }),
    chunk(3, 'Liên hệ máy lẻ 2417.', { embedding: [0, 0, 1] }),
  ];

  it('keeps passages close to the best cosine and drops the rest', () => {
    const seeds = selectSeeds(chunks, [1, 0, 0], 'mấy giờ');
    expect(seeds.map((c) => c.id)).toEqual([0, 1]);
  });

  it('keeps a strong keyword match the vector missed', () => {
    const seeds = selectSeeds(chunks, [1, 0, 0], 'máy lẻ 2417');
    expect(seeds.map((c) => c.id)).toContain(3);
  });

  it('skips copies of a passage', () => {
    const copy = { ...chunks[0], id: 10, attachmentId: 2 };
    const seeds = selectSeeds([...chunks, copy], [1, 0, 0], 'mấy giờ');
    expect(seeds.filter((c) => c.text === chunks[0].text)).toHaveLength(1);
  });

  it('works on keywords alone before indexing', () => {
    const seeds = selectSeeds(chunks, null, 'căng tin');
    expect(seeds.map((c) => c.id)).toEqual([2]);
  });
});

describe('withNeighbours', () => {
  const chunks = [0, 1, 2, 3, 4].map((i) => chunk(i, `Đoạn số ${i}.`));
  const cost = chunks[0].tokenCount;

  it('adds the passages around each seed, in reading order', () => {
    const picked = withNeighbours([chunks[2]], chunks, 100);
    expect(picked.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('fits seeds before neighbours', () => {
    const picked = withNeighbours([chunks[1], chunks[3]], chunks, cost * 3);
    expect(picked.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('never joins passages of different documents', () => {
    const other = chunk(9, 'Tài liệu khác.', { attachmentId: 2 });
    other.ord = 3;
    const picked = withNeighbours([chunks[2]], [...chunks, other], 100);
    expect(picked.map((c) => c.id)).not.toContain(9);
  });

  it('starts from the opening passages when nothing matched', () => {
    const picked = withNeighbours([], chunks, cost * 2);
    expect(picked.map((c) => c.id)).toEqual([0, 1]);
  });
});

describe('withoutOverlap', () => {
  it('drops the lines a passage repeats from the one before', () => {
    expect(withoutOverlap('a\nb\nc', 'b\nc\nd\ne')).toBe('d\ne');
  });

  it('keeps a passage that does not repeat anything', () => {
    expect(withoutOverlap('a\nb', 'c\nd')).toBe('c\nd');
  });

  it('never empties a passage', () => {
    expect(withoutOverlap('a\nb', 'a\nb')).toBe('a\nb');
  });
});

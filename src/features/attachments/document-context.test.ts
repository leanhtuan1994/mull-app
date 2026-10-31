import type { IndexedChunk } from '@/db/types';
import { estimateTokens } from '@/features/chat/token-estimate';
import { mockEmbedding } from '@/features/llm/mock-engine';

import { buildDocumentContext, citedNumbers } from './document-context';

const TOPICS = [
  'Lịch họp nhóm vào sáng thứ Hai lúc chín giờ tại phòng họp tầng ba.',
  'Ngân sách quý ba tăng mười phần trăm so với quý hai nhờ doanh thu mới.',
  'Quy trình xin nghỉ phép cần gửi đơn trước ba ngày cho quản lý trực tiếp.',
  'Máy pha cà phê ở tầng hai được bảo trì vào chiều thứ Sáu hằng tuần.',
];

function chunks(withVectors: boolean): IndexedChunk[] {
  return TOPICS.map((text, i) => ({
    id: 100 + i,
    attachmentId: 1,
    ord: i,
    page: i + 1,
    text,
    tokenCount: estimateTokens(text),
    embedding: withVectors ? new Float32Array(mockEmbedding(text)) : null,
  }));
}

const names = new Map([[1, 'so-tay.pdf']]);

describe('buildDocumentContext', () => {
  it('includes whole documents that fit the budget', async () => {
    const context = await buildDocumentContext({
      chunks: chunks(false),
      names,
      question: 'Tóm tắt',
      budgetTokens: 1000,
      embedQuery: async () => null,
    });
    expect(context?.sources.map((s) => s.chunkId)).toEqual([
      100, 101, 102, 103,
    ]);
    expect(context?.block).toContain('[2] (so-tay.pdf, tr. 2)');
    expect(context?.block.startsWith('<tài_liệu>')).toBe(true);
  });

  it('retrieves the closest passage by vector when the document is long', async () => {
    const context = await buildDocumentContext({
      chunks: chunks(true),
      names,
      question: 'Xin nghỉ phép cần gửi đơn trước mấy ngày?',
      budgetTokens: 30,
      embedQuery: async (q) => mockEmbedding(q),
    });
    expect(context?.sources).toEqual([
      expect.objectContaining({ n: 1, chunkId: 102, page: 3 }),
    ]);
    expect(context?.needsEmbeddings).toBe(false);
  });

  it('falls back to matching words, ignoring accents, before indexing', async () => {
    const context = await buildDocumentContext({
      chunks: chunks(false),
      names,
      question: 'ngan sach quy ba',
      budgetTokens: 30,
      embedQuery: async () => null,
    });
    expect(context?.sources[0].chunkId).toBe(101);
    expect(context?.needsEmbeddings).toBe(true);
  });

  it('never exceeds the budget', async () => {
    const context = await buildDocumentContext({
      chunks: chunks(true),
      names,
      question: 'thứ',
      budgetTokens: 45,
      embedQuery: async (q) => mockEmbedding(q),
    });
    const used = context!.sources
      .map((s) => chunks(false).find((c) => c.id === s.chunkId)!.tokenCount)
      .reduce((a, b) => a + b, 0);
    expect(used).toBeLessThanOrEqual(45);
  });
});

describe('citedNumbers', () => {
  it('lists the numbers an answer cites, skipping markdown links', () => {
    expect(
      citedNumbers('Theo [2] và [1], rồi [2]. Xem [web](x) và [3](y).')
    ).toEqual([2, 1]);
  });
});

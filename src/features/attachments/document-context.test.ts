import type { IndexedChunk } from '@/db/types';
import { estimateTokens } from '@/features/chat/token-estimate';
import { mockEmbedding } from '@/features/llm/mock-engine';

import {
  buildDocumentContext,
  citedNumbers,
  searchQuery,
  sourcesUsed,
} from './document-context';

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

  it('sends the lines two passages share only once', async () => {
    const overlapping: IndexedChunk[] = [
      'Mở đầu.\nDòng chung.',
      'Dòng chung.\nPhần tiếp.',
    ].map((text, i) => ({
      id: 200 + i,
      attachmentId: 1,
      ord: i,
      page: null,
      text,
      tokenCount: estimateTokens(text),
      embedding: null,
    }));
    const context = await buildDocumentContext({
      chunks: overlapping,
      names,
      question: 'Tóm tắt',
      budgetTokens: 1000,
      embedQuery: async () => null,
    });
    expect(context?.block.match(/Dòng chung/g)).toHaveLength(1);
    expect(context?.block).toContain('[2] (so-tay.pdf)\nPhần tiếp.');
  });

  it('adds the passages around the closest one', async () => {
    const context = await buildDocumentContext({
      chunks: chunks(true),
      names,
      question: 'Xin nghỉ phép cần gửi đơn trước mấy ngày?',
      budgetTokens: 70,
      embedQuery: async (q) => mockEmbedding(q),
    });
    expect(context?.sources.map((s) => s.chunkId)).toContain(102);
    expect(context?.sources.length).toBeGreaterThan(1);
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

describe('searchQuery', () => {
  const previous = 'Mạng Wi-Fi cho khách tên là gì?';

  it.each([
    'Mật khẩu của nó đổi khi nào?',
    'Còn sinh con thì sao?',
    'Số máy lẻ của anh ấy là bao nhiêu?',
    'Ở đâu?',
  ])('joins the previous question to the follow-up "%s"', (question) => {
    expect(searchQuery(question, previous)).toBe(`${previous}\n${question}`);
  });

  it('keeps a question that stands on its own', () => {
    const question = 'Bảo hiểm sức khoẻ có khám răng không?';
    expect(searchQuery(question, previous)).toBe(question);
  });

  it('does not take "nó" from inside another word', () => {
    const question = 'Nộp đơn nghỉ phép năm cho quản lý trực tiếp?';
    expect(searchQuery(question, previous)).toBe(question);
  });

  it('keeps the question when there is no earlier one', () => {
    expect(searchQuery('Còn nó?')).toBe('Còn nó?');
  });
});

describe('sourcesUsed', () => {
  const sources = [1, 2, 3].map((n) => ({
    n,
    chunkId: n,
    attachmentId: 1,
    name: 'so-tay.pdf',
    page: null,
  }));
  const passages = [
    'Căng tin ở tầng hai phục vụ bữa trưa từ 11 giờ 30.',
    'Bãi xe máy ở tầng hầm B1, ô tô ở tầng B2.',
    'Mật khẩu dài ít nhất 12 ký tự.',
  ];

  it('keeps every source when the answer cites by number', () => {
    expect(sourcesUsed('Ở tầng hai [1].', { sources, passages })).toEqual(
      sources
    );
  });

  it('keeps the sources whose wording the answer reuses', () => {
    const used = sourcesUsed('Ô tô gửi ở tầng hầm B2.', { sources, passages });
    expect(used.map((s) => s.n)).toEqual([2]);
  });

  it('shows none when the answer says the documents lack it', () => {
    expect(
      sourcesUsed('Mình không thấy thông tin này trong tài liệu.', {
        sources,
        passages,
      })
    ).toEqual([]);
  });

  it('keeps them all when nothing overlaps', () => {
    expect(sourcesUsed('Được.', { sources, passages })).toEqual(sources);
  });
});

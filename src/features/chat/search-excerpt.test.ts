import { searchExcerpt } from './search-excerpt';

describe('searchExcerpt', () => {
  it('finds the match without accents and keeps the original text', () => {
    expect(searchExcerpt('Gợi ý quán ăn ở Đà Nẵng nhé', 'da nang')).toEqual({
      before: 'Gợi ý quán ăn ở ',
      match: 'Đà',
      after: ' Nẵng nhé',
    });
  });

  it('matches a prefix only at the start of a word', () => {
    expect(searchExcerpt('cada đà', 'da')?.match).toBe('đà');
  });

  it('cuts long leading text at a word boundary', () => {
    const text = `${'một hai ba bốn năm sáu bảy tám chín mười '.repeat(2)}lượng tử hoá`;
    const excerpt = searchExcerpt(text, 'luong tu');
    expect(excerpt?.before.startsWith('…')).toBe(true);
    expect(excerpt?.before.slice(1, 2)).not.toBe(' ');
    expect(excerpt?.match).toBe('lượng');
  });

  it('drops markdown markers and line breaks', () => {
    expect(searchExcerpt('**Kế hoạch**\n- việc một', 'viec')).toEqual({
      before: 'Kế hoạch - ',
      match: 'việc',
      after: ' một',
    });
  });

  it('falls back to the start of the text when no word is found', () => {
    expect(searchExcerpt('Xin chào', 'tam biet')).toEqual({
      before: '',
      match: '',
      after: 'Xin chào',
    });
    expect(searchExcerpt('   ', 'a')).toBeNull();
  });
});

import { normalizeVi, toFtsQuery } from './normalize-vi';

describe('normalizeVi', () => {
  it.each([
    ['Lượng tử hoá trên iPhone', 'luong tu hoa tren iphone'],
    ['Đà Nẵng', 'da nang'],
    ['ĐƯỜNG ĐI', 'duong di'],
    ['  Phở   bò  ', 'pho bo'],
    ['Tỉ lệ nấu nước dùng', 'ti le nau nuoc dung'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeVi(input)).toBe(expected);
  });

  it('treats precomposed and decomposed input the same', () => {
    expect(normalizeVi('hoá'.normalize('NFC'))).toBe(
      normalizeVi('hoá'.normalize('NFD'))
    );
  });
});

describe('toFtsQuery', () => {
  it('requires every word and prefixes the last', () => {
    expect(toFtsQuery('luong tu')).toBe('"luong" "tu"*');
    expect(toFtsQuery('Lượng Tử')).toBe('"luong" "tu"*');
  });

  it('strips FTS operators', () => {
    expect(toFtsQuery('a" OR (b*)')).toBe('"a" "or" "b"*');
  });

  it('returns null for blank input', () => {
    expect(toFtsQuery('   ')).toBeNull();
    expect(toFtsQuery('"*"')).toBeNull();
  });
});

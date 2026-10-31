import { prepareMarkdown } from './prepare-markdown';

const prep = (text: string) =>
  prepareMarkdown(text, { imageLabel: '[Ảnh: {alt}]' });

describe('prepareMarkdown', () => {
  it('turns \\( \\) into inline dollars', () => {
    expect(prep('Diện tích là \\(S = \\pi r^2\\) nhé.')).toBe(
      'Diện tích là $S = \\pi r^2$ nhé.'
    );
  });

  it('puts \\[ \\] and inline $$ on their own lines', () => {
    expect(prep('Ta có \\[x^2 + 1\\] với mọi x.')).toBe(
      'Ta có\n\n$$\nx^2 + 1\n$$\n\nvới mọi x.'
    );
    expect(prep('Công thức $$a+b$$ ở đây')).toBe(
      'Công thức\n\n$$\na+b\n$$\n\nở đây'
    );
  });

  it('keeps block math that is already on its own lines', () => {
    const text = 'Trên\n\n$$\n\\frac{1}{2}\n$$\n\nDưới';
    expect(prep(text)).toBe(text);
  });

  it('leaves single dollars such as prices alone', () => {
    expect(prep('Giá $5 và $10')).toBe('Giá $5 và $10');
  });

  it('never touches code blocks or inline code', () => {
    const fenced = '```js\nconst s = "\\(x\\)";\n![a](http://x)\n```';
    expect(prep(`Mã:\n${fenced}\nxong \\(y\\)`)).toBe(
      `Mã:\n${fenced}\nxong $y$`
    );
    expect(prep('Dùng `\\(x\\)` để viết \\(x\\)')).toBe(
      'Dùng `\\(x\\)` để viết $x$'
    );
  });

  it('leaves an unclosed fence that is still streaming alone', () => {
    const text = 'Ví dụ:\n```python\nprint("\\(a\\)")';
    expect(prep(text)).toBe(text);
  });

  it('leaves unfinished math alone while streaming', () => {
    expect(prep('Ta có \\[x^2')).toBe('Ta có \\[x^2');
  });

  it('replaces images so no URL is ever fetched', () => {
    expect(prep('Xem ![sơ đồ](https://x.example/p?d=bí-mật) nhé')).toBe(
      'Xem [Ảnh: sơ đồ] nhé'
    );
    expect(prep('a <img src="https://x.example/a.png"> b')).toBe('a  b');
  });

  it('reduces links into the app to their text', () => {
    expect(prep('Theo [1](mull://source/7) và [web](https://a.vn)')).toBe(
      'Theo 1 và [web](https://a.vn)'
    );
  });
});

describe('citations', () => {
  const cite = (text: string) =>
    prepareMarkdown(text, {
      imageLabel: '',
      citations: new Map([
        [1, 70],
        [2, 71],
      ]),
    });

  it('links cited passages into the app', () => {
    expect(cite('Họp lúc 9 giờ [1], phòng 3 [2].')).toBe(
      'Họp lúc 9 giờ [\\[1\\]](mull://source/70), phòng 3 [\\[2\\]](mull://source/71).'
    );
  });

  it('leaves unknown numbers, links and code alone', () => {
    expect(cite('Xem [3] và [web](https://a.vn) và `arr[1]`')).toBe(
      'Xem [3] và [web](https://a.vn) và `arr[1]`'
    );
  });

  it('never trusts an app link the model wrote itself', () => {
    expect(cite('[1](mull://source/999)')).toBe('1');
  });
});

describe('sanitizer bypasses', () => {
  it('turns reference-style and nested images into text', () => {
    const out = prep(
      '![a][r] và ![x [y] z](https://evil/p)\n\n[r]: https://evil/q'
    );
    expect(out).not.toMatch(/!\[/);
    expect(out).not.toContain('https://evil/q');
  });

  it('sanitizes text hidden between escaped backticks', () => {
    expect(prep('\\`![a](https://evil/p)\\`')).not.toContain('![');
  });
});

/**
 * Code spans and fenced blocks, kept verbatim. An unclosed fence runs to the
 * end so a block that is still streaming is left alone too.
 */
const CODE =
  /(^|\n)(```|~~~)[\s\S]*?(?:\n\2[^\n]*(?=\n|$)|$)|(?<!\\)`[^`\n]*(?<!\\)`/g;

const DISPLAY_DOLLARS = /[ \t]*\$\$([\s\S]+?)\$\$[ \t]*/g;
const DISPLAY_BRACKETS = /[ \t]*\\\[([\s\S]+?)\\\][ \t]*/g;
const INLINE_PARENS = /\\\(([\s\S]+?)\\\)/g;
const IMAGE = /!\[([^\]\n]*)\]\([^)\n]*\)/g;
const HTML_MEDIA =
  /<(?:img|video|audio|source|iframe)\b[^>]*>(?:<\/(?:video|audio|iframe)>)?/gi;
const APP_LINK = /\[([^\]\n]*)\]\(\s*<?mull:[^)\n]*\)/gi;
/** `[label]: url` lines, which would turn `![a][label]` into a remote image. */
const LINK_DEFINITION = /^ {0,3}\[[^\]\n]+\]:[^\n]*$/gm;

type Options = {
  /** Shown instead of an image the model referenced; `{alt}` is replaced. */
  imageLabel: string;
  /** Citation number → chunk id, for the passages this answer was given. */
  citations?: ReadonlyMap<number, number>;
};

/** `[2]` as a citation, not a link label, image or escaped bracket. */
const CITATION = /(?<![\]\\!])\[(\d{1,2})\](?!\()/g;

/**
 * Turns a model's answer into markdown that is safe and renders well:
 * - `\(…\)` and `\[…\]` become `$…$` and `$$…$$`, the only math syntax the
 *   renderer understands, and block math sits on its own lines;
 * - images are replaced by a label, so an answer can never make the app
 *   fetch a URL (a document could ask the model to leak its text that way);
 * - `mull:` links are reduced to their text, because only the app itself may
 *   add links into the app: `[n]` citations of passages it gave the model.
 * Code is never touched.
 */
export function prepareMarkdown(text: string, options: Options): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(CODE)) {
    out += prose(text.slice(last, match.index), options) + match[0];
    last = match.index + match[0].length;
  }
  return out + prose(text.slice(last), options);
}

function prose(text: string, { imageLabel, citations }: Options): string {
  if (!text) return text;
  const cleaned = text
    .replace(DISPLAY_DOLLARS, (_, body: string) => block(body))
    .replace(DISPLAY_BRACKETS, (_, body: string) => block(body))
    .replace(INLINE_PARENS, (_, body: string) => `$${body.trim()}$`)
    .replace(IMAGE, (_, alt: string) =>
      imageLabel.replace('{alt}', alt.trim()).trim()
    )
    .replace(HTML_MEDIA, '')
    .replace(APP_LINK, (_, label: string) => label)
    .replace(LINK_DEFINITION, '')
    // Anything left that still opens an image (nested brackets, odd forms)
    // is escaped to plain text.
    .replace(/!\[/g, '!\\[')
    .replace(/\n{3,}/g, '\n\n');
  if (!citations?.size) return cleaned;
  // Added after the model's own app links were removed, so these are the
  // only links into the app, and only for passages this answer was given.
  return cleaned.replace(CITATION, (match, n: string) => {
    const chunkId = citations.get(Number(n));
    return chunkId ? `[\\[${n}\\]](mull://source/${chunkId})` : match;
  });
}

function block(body: string): string {
  return `\n\n$$\n${body.trim()}\n$$\n\n`;
}

/**
 * Removes a model's `<think>…</think>` block. An unfinished block (still
 * streaming) hides everything after `<think>`.
 */
export function stripThinking(text: string): string {
  const withoutClosed = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '');
  const open = withoutClosed.indexOf('<think>');
  const visible = open === -1 ? withoutClosed : withoutClosed.slice(0, open);
  // Hold back a partial "<think" tag that may still be arriving.
  return visible.replace(/<(t(h(i(n(k)?)?)?)?)?$/, '').trimStart();
}

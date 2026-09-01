/**
 * Cheap "could this text contain markdown?" test.
 *
 * Most chat messages are plain prose. Running remark over them costs a full
 * parse on every render and drags the react-markdown chain onto the boot path,
 * yet produces exactly the raw string back. The pattern is deliberately
 * over-eager — a false positive only means the normal markdown path runs.
 */
const MARKDOWN_HINT = /[\\`*_~[\]()<>#|!&@=+-]|\d+[.)]\s|https?:\/\/|www\./

export function hasMarkdown(text) {
  return typeof text === 'string' && MARKDOWN_HINT.test(text)
}

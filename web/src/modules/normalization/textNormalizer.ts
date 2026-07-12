/**
 * Text Normalizer — Phase 3
 * Normalizes whitespace, punctuation, casing, control characters, and encoding artifacts.
 * Produces normalized sentences and word tokens for downstream analysis.
 */

/** Control characters and zero-width characters to strip. */
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200F\u202A-\u202E\uFEFF]/g;

/** Common encoding artifacts (Mojibake patterns). */
const ENCODING_ARTIFACTS: Array<[RegExp, string]> = [
  [/\u00c3\u00a2/g, "â"],
  [/\u00c3\u00a9/g, "é"],
  [/\u00c3\u00a8/g, "è"],
  [/\u00c3\u00aa/g, "ê"],
  [/\u00c3\u00ab/g, "ë"],
  [/\u00c3\u00a0/g, "à"],
  [/\u00c3\u00a1/g, "á"],
  [/\u00c3\u00ad/g, "í"],
  [/\u00c3\u00b3/g, "ó"],
  [/\u00c3\u00b6/g, "ö"],
  [/\u00c3\u00ba/g, "ú"],
  [/\u00c3\u00bc/g, "ü"],
  [/\u00c3\u00b1/g, "ñ"],
  [/\u2013/g, "–"],
  [/\u2014/g, "—"],
  [/\u2018/g, "'"],
  [/\u2019/g, "'"],
  [/\u201c/g, '"'],
  [/\u201d/g, '"'],
  [/\u00a0/g, " "],
  [/\u2026/g, "…"],
];

/** Punctuation normalization map — collapse variants to canonical forms. */
const PUNCTUATION_NORMALIZE: Array<[RegExp, string]> = [
  [/\u00ab/g, '"'],
  [/\u00bb/g, '"'],
  [/''/g, '"'],
  [/``/g, '"'],
  [/\u2032/g, "'"],
  [/\u2033/g, '"'],
];

/** Sentence boundary pattern. */
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z\u00C0-\u017F])/g;

/** Word token pattern — matches words including contractions and hyphenated words. */
const WORD_PATTERN = /\b[a-zA-Z\u00C0-\u017F]+(?:[''-][a-zA-Z\u00C0-\u017F]+)*\b/g;

/**
 * Normalize text: strip control chars, fix encoding, normalize whitespace, punctuation, casing.
 * @param text Raw text to normalize.
 * @param options Normalization options.
 * @returns Normalized text string.
 */
export function normalizeText(
  text: string,
  options: {
    stripControlChars?: boolean;
    fixEncoding?: boolean;
    normalizeWhitespace?: boolean;
    normalizePunctuation?: boolean;
    normalizeCasing?: "none" | "lower" | "title" | "sentence";
    trim?: boolean;
  } = {},
): string {
  const {
    stripControlChars = true,
    fixEncoding = true,
    normalizeWhitespace = true,
    normalizePunctuation = true,
    normalizeCasing = "none",
    trim = true,
  } = options;

  let result = text;

  if (stripControlChars) {
    result = result.replace(CONTROL_CHARS, "");
  }

  if (fixEncoding) {
    for (const [pattern, replacement] of ENCODING_ARTIFACTS) {
      result = result.replace(pattern, replacement);
    }
  }

  if (normalizePunctuation) {
    for (const [pattern, replacement] of PUNCTUATION_NORMALIZE) {
      result = result.replace(pattern, replacement);
    }
    // Collapse multiple exclamation/question marks
    result = result.replace(/!{2,}/g, "!");
    result = result.replace(/\?{2,}/g, "?");
    // Normalize spacing around punctuation
    result = result.replace(/\s+([,.!?;:])/g, "$1");
    result = result.replace(/([,.!?;:])(?=[A-Za-z])/g, "$1 ");
  }

  if (normalizeWhitespace) {
    // Replace all whitespace sequences with single space
    result = result.replace(/\s+/g, " ");
  }

  switch (normalizeCasing) {
    case "lower":
      result = result.toLowerCase();
      break;
    case "title":
      result = result.replace(/\b\w/g, (c) => c.toUpperCase());
      break;
    case "sentence":
      result = result.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
      break;
    case "none":
    default:
      break;
  }

  if (trim) {
    result = result.trim();
  }

  return result;
}

/**
 * Split text into normalized sentences.
 * @param text Text to split.
 * @returns Array of normalized sentences.
 */
export function normalizeSentences(text: string): string[] {
  const normalized = normalizeText(text, { normalizeWhitespace: true, stripControlChars: true });
  if (!normalized) return [];

  const sentences = normalized
    .split(SENTENCE_BOUNDARY)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return sentences;
}

/**
 * Tokenize text into normalized word tokens.
 * @param text Text to tokenize.
 * @returns Array of normalized word tokens (lowercased).
 */
export function normalizeWords(text: string): string[] {
  const normalized = normalizeText(text, { normalizeCasing: "lower", stripControlChars: true });
  if (!normalized) return [];

  const matches = normalized.match(WORD_PATTERN);
  return matches ?? [];
}

/**
 * Normalize a value for comparison/deduplication.
 * Produces a lowercase, whitespace-collapsed, punctuation-simplified key.
 * @param value Value to normalize for comparison.
 * @returns Normalized comparison key.
 */
export function normalizeForComparison(value: string): string {
  return normalizeText(value, {
    normalizeCasing: "lower",
    normalizeWhitespace: true,
    normalizePunctuation: true,
    stripControlChars: true,
  })
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a heading or title text.
 * Preserves casing (titles are meaningful) but normalizes whitespace and punctuation.
 * @param text Heading text.
 * @returns Normalized heading text.
 */
export function normalizeHeadingText(text: string): string {
  return normalizeText(text, {
    normalizeWhitespace: true,
    normalizePunctuation: true,
    stripControlChars: true,
    fixEncoding: true,
  });
}

/**
 * Normalize paragraph text.
 * Normalizes whitespace, punctuation, and encoding but preserves casing.
 * @param text Paragraph text.
 * @returns Normalized paragraph text.
 */
export function normalizeParagraphText(text: string): string {
  return normalizeText(text, {
    normalizeWhitespace: true,
    normalizePunctuation: true,
    stripControlChars: true,
    fixEncoding: true,
  });
}

/**
 * Tokenize a list of paragraph texts into token arrays.
 * @param paragraphs Array of paragraph texts.
 * @returns Array of token arrays (one per paragraph).
 */
export function tokenizeParagraphs(paragraphs: string[]): string[][] {
  return paragraphs.map((p) => normalizeWords(p));
}

/**
 * Tokenize a list of list item texts into token arrays.
 * @param items Array of list item texts.
 * @returns Array of token arrays.
 */
export function tokenizeListItems(items: string[]): string[][] {
  return items.map((item) => normalizeWords(item));
}

/**
 * Tokenize a list of table row texts into token arrays.
 * @param rows Array of table row texts (each row is a joined cell string).
 * @returns Array of token arrays.
 */
export function tokenizeTableRows(rows: string[]): string[][] {
  return rows.map((row) => normalizeWords(row));
}

/**
 * Build a single normalized text block from multiple text fragments.
 * @param fragments Text fragments to combine.
 * @returns Combined normalized text.
 */
export function buildNormalizedText(fragments: string[]): string {
  return fragments
    .map((f) => normalizeText(f, { normalizeWhitespace: true, stripControlChars: true }))
    .filter((f) => f.length > 0)
    .join(" ");
}

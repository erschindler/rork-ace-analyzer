/**
 * DOM Parsing Utility — Production Version for ACE v1.2
 *
 * Handles parsing, corruption detection, hydration detection,
 * visible text extraction, selector generation, truncation, and completeness heuristics.
 */

const MIN_VISIBLE_TEXT = 80;
const MAX_EMPTY_NODES = 12000;
const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10MB

const BOILERPLATE_SELECTORS = [
  "#cookie-banner", "#gdpr-banner", ".cookie-consent", ".gdpr-overlay",
  "#login-wall", ".paywall", ".skeleton", "[role='dialog']"
];

const SPA_ROOT_SELECTORS = [
  "#root", "#app", "#__next", "#__nuxt", "[data-reactroot]",
  "[data-v-app]", "[ng-version]"
];

const HYDRATION_PATTERNS = [
  "data-reactroot", "data-react-helmet", "data-server-rendered",
  "data-n-hydration", "data-n-ssr", "ng-version", "data-v-"
];

/**
 * Parse HTML string into a Document with full diagnostics.
 * @param html Raw HTML string to parse.
 * @returns Parsed document, parse errors, and corruption detection result.
 */
export function parseHtmlToDom(html: string): {
  doc: Document;
  parseErrors: string[];
  domCorruption: boolean;
  domCorruptionReason?: string;
} {
  const parseErrors: string[] = [];

  if (!html || html.trim().length === 0) {
    const emptyDoc = new DOMParser().parseFromString("<html><head></head><body></body></html>", "text/html");
    return {
      doc: emptyDoc,
      parseErrors: ["Empty HTML"],
      domCorruption: true,
      domCorruptionReason: "Empty HTML string"
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  if (doc.getElementsByTagName("parsererror").length > 0) {
    parseErrors.push("ParserError node detected");
  }

  const corruptionReason = detectDomCorruption(doc);

  return {
    doc,
    parseErrors,
    domCorruption: !!corruptionReason,
    domCorruptionReason: corruptionReason
  };
}

/** Detect DOM corruption: missing body, too few text nodes, too many empty nodes, script-only, hydration shell. */
function detectDomCorruption(doc: Document): string | undefined {
  if (!doc.body) return "Missing <body> element";

  const textNodes = countTextNodes(doc.body);
  if (textNodes < 3) return `Too few text nodes (${textNodes})`;

  const emptyNodes = countEmptyNodes(doc.body);
  if (emptyNodes > MAX_EMPTY_NODES) return `Too many empty nodes (${emptyNodes})`;

  if (detectScriptOnlyDom(doc)) return "Script-only DOM";

  if (detectHydrationShell(doc)) return "Hydration shell detected";

  return undefined;
}

/** Count non-empty text nodes within an element subtree. */
function countTextNodes(el: Element): number {
  let count = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if ((node.textContent ?? "").trim().length > 0) count++;
  }
  return count;
}

/** Count completely empty element nodes within an element subtree. */
function countEmptyNodes(el: Element): number {
  return Array.from(el.querySelectorAll("*")).filter((child: Element) =>
    child.children.length === 0 && (child.textContent ?? "").trim().length === 0
  ).length;
}

/**
 * Extract all visible text from a Document, excluding hidden/script/style content.
 * @param doc Parsed Document.
 * @returns Visible text content, whitespace-normalized.
 */
export function extractVisibleText(doc: Document): string {
  if (!doc.body) return "";
  const clone = doc.body.cloneNode(true) as Element;

  clone.querySelectorAll("script, style, template, noscript, svg").forEach((el: Element) => el.remove());

  // Remove hidden elements
  clone.querySelectorAll('*').forEach((el: Element) => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      el.remove();
    }
  });

  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Extract visible text from a single element, excluding script/style/template content.
 * @param el Element to extract text from.
 * @returns Visible text content, whitespace-normalized.
 */
export function extractVisibleTextFromElement(el: Element | null): string {
  if (!el) return "";
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("script, style, template").forEach((e: Element) => e.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Generate a CSS selector path for an element, useful for evidence traceability.
 * Builds a unique selector by walking up the DOM tree.
 * @param el Element to generate a selector for.
 * @returns CSS selector string (e.g. "body > div.main > h1").
 */
export function generateSelector(el: Element | null): string {
  if (!el || !el.tagName) return "";
  if (el.id) return `#${el.id}`;

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current.tagName && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${current.id}`;
      parts.unshift(selector);
      break;
    }

    // Add nth-of-type if there are siblings of the same tag
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((s: Element) => s.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    // Add class names for specificity (limited to first 2 for readability)
    if (current.classList.length > 0) {
      const classes = Array.from(current.classList).slice(0, 2).map((c: string) => `.${c}`).join("");
      selector += classes;
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

/**
 * Truncate text to a maximum length, adding an ellipsis if truncated.
 * @param text Text to potentially truncate.
 * @param maxLength Maximum number of characters to keep.
 * @returns Truncated text with ellipsis, or original text if under the limit.
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trimEnd() + "…";
}

/**
 * Detect hydration shell / empty SPA — body has very little visible text
 * and matches SPA root selector patterns or hydration attributes.
 * @param doc Parsed Document.
 * @returns True if a hydration shell is detected.
 */
export function detectHydrationShell(doc: Document): boolean {
  const text = extractVisibleText(doc);
  if (text.length >= MIN_VISIBLE_TEXT) return false;

  for (const sel of SPA_ROOT_SELECTORS) {
    if (doc.querySelector(sel)) return true;
  }

  for (const pattern of HYDRATION_PATTERNS) {
    if (doc.documentElement.outerHTML.includes(pattern)) return true;
  }

  return doc.querySelectorAll("script").length > 5 && text.length < 50;
}

/**
 * Detect script-only / empty body — body contains only script/noscript/template tags
 * or has almost no visible text.
 * @param doc Parsed Document.
 * @returns True if the body is script-only or nearly empty.
 */
export function detectScriptOnlyDom(doc: Document): boolean {
  const body = doc.body;
  if (!body) return true;

  const children = Array.from(body.children);
  const nonScript = children.filter((el: Element) => {
    const tag = el.tagName.toLowerCase();
    return !["script", "noscript", "template"].includes(tag);
  });

  return nonScript.length === 0 || extractVisibleText(doc).length < 20;
}

/**
 * Detect boilerplate-only pages — page content is dominated by cookie banners,
 * GDPR overlays, or authentication walls with very little actual content.
 * @param doc Parsed Document.
 * @returns True if the page appears to be boilerplate-only.
 */
export function detectBoilerplateDom(doc: Document): boolean {
  const text = extractVisibleText(doc).toLowerCase();
  if (text.length < 100) return false;

  const boilerplateCount = BOILERPLATE_SELECTORS.filter((sel: string) => doc.querySelector(sel)).length;
  return boilerplateCount >= 2 && text.length < 400;
}

/**
 * Detect malformed DOM — missing essential structural elements like <html>, <head>, or <body>.
 * @param doc Parsed Document.
 * @returns True if the DOM appears malformed.
 */
export function detectMalformedDom(doc: Document): boolean {
  if (!doc.documentElement) return true;
  if (!doc.head) return true;
  if (!doc.body) return true;

  // Check for parsererror nodes
  if (doc.getElementsByTagName("parsererror").length > 0) return true;

  // Check for completely empty document
  const allElements = doc.querySelectorAll("*");
  if (allElements.length < 3) return true;

  return false;
}

/**
 * Detect oversized HTML — content exceeds the maximum processing size.
 * @param html Raw HTML string.
 * @returns True if the HTML exceeds the size limit.
 */
export function detectOversizedHtml(html: string): boolean {
  return html.length > MAX_HTML_SIZE;
}

/**
 * Detect character encoding failures — presence of replacement characters
 * or common mojibake patterns indicating encoding issues.
 * @param html Raw HTML string.
 * @returns True if encoding issues are detected.
 */
export function detectEncodingFailure(html: string): boolean {
  // Check for Unicode replacement character (U+FFFD) — indicates decoding failure
  if (html.includes("\uFFFD")) return true;

  // Check for common mojibake patterns (UTF-8 interpreted as Latin-1)
  if (html.includes("Ã©") || html.includes("Ã¨") || html.includes("Ã§") || html.includes("Ã ")) return true;

  // Check for invalid UTF-8 sequences (raw bytes that shouldn't appear in valid UTF-8)
  // Look for sequences of replacement-like bytes
  const mojibakePattern = /[\u00C0-\u00C3][\u0080-\u00BF]/;
  if (mojibakePattern.test(html)) return true;

  return false;
}

/**
 * Find the main content container of a document.
 * Checks for <main>, [role="main"], <article>, then falls back to <body>.
 * @param doc Parsed Document.
 * @returns The main content element, or body as fallback.
 */
export function extractMainContent(doc: Document): Element {
  return doc.querySelector("main") ||
         doc.querySelector('[role="main"]') ||
         doc.querySelector("article") ||
         doc.body;
}

/**
 * Detect shadow DOM usage by scanning script content for attachShadow calls.
 * @param doc Parsed Document.
 * @returns True if shadow DOM usage is detected in scripts.
 */
export function detectShadowDom(doc: Document): boolean {
  const scripts = doc.querySelectorAll("script");
  for (const script of scripts) {
    if ((script.textContent ?? "").includes("attachShadow")) return true;
  }
  return false;
}

/**
 * Conservative heuristic to detect mid-sentence truncation in text.
 * Only flags clear mid-word cuts ending in consonant clusters that are
 * not common English words — avoids false positives from headings/labels.
 * @param text Text to check for truncation.
 * @returns True if mid-sentence truncation is likely.
 */
export function isMidSentenceTruncation(text: string): boolean {
  if (!text || text.length < 150) return false;
  const trimmed = text.trimEnd();
  const lastChar = trimmed[trimmed.length - 1];
  if ([".", "!", "?", ":", ";"].includes(lastChar)) return false;

  const lastWord = trimmed.split(/\s+/).pop() || "";
  if (lastWord.length > 3 && /^[a-zA-Z]+$/.test(lastWord) && /[^aeiou]{2,}$/i.test(lastWord)) {
    return true;
  }
  return false;
}

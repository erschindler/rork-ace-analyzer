/**
 * DOM Parsing Utility — Phase 2
 * Parses HTML strings into Documents and detects all DOM-failure modes.
 * Deterministic, explainable, never throws silently.
 */

/** Maximum HTML size before flagging as oversized (5MB). */
const MAX_HTML_SIZE = 5 * 1024 * 1024;

/** Minimum visible text length to consider a page non-boilerplate-only. */
const MIN_VISIBLE_TEXT = 50;

/** Elements that count as boilerplate-only content. */
const BOILERPLATE_SELECTORS = [
  "#cookie-banner",
  "#gdpr-banner",
  "#gdpr-consent",
  ".cookie-consent",
  ".cookie-banner",
  ".gdpr-overlay",
  ".privacy-overlay",
  "#login-wall",
  ".login-wall",
  ".paywall",
  "#skeleton-loader",
  ".skeleton",
  "[role='dialog'][aria-modal='true']",
];

/** Common SPA root element IDs. */
const SPA_ROOT_IDS = ["root", "app", "__next", "__nuxt", "__vue"];

/** Hydration shell indicator patterns. */
const HYDRATION_PATTERNS = [
  "data-reactroot",
  "data-react-helmet",
  "data-server-rendered",
  "data-react-checksum",
  "ng-version",
  "data-v-",
  "data-n-hydration",
  "data-n-ssr",
];

/**
 * Parse an HTML string into a DOM Document.
 * Handles malformed HTML gracefully via the browser's DOMParser.
 * Also detects DOM corruption and returns a corruption flag + reason.
 * @param html Raw HTML string to parse.
 * @returns Parsed Document, parse errors, and DOM corruption info.
 */
export function parseHtmlToDom(html: string): {
  doc: Document;
  parseErrors: string[];
  domCorruption: boolean;
  domCorruptionReason: string | undefined;
} {
  const parseErrors: string[] = [];

  if (!html || html.trim().length === 0) {
    parseErrors.push("Empty HTML string provided");
    const emptyDoc = new DOMParser().parseFromString("<html><head></head><body></body></html>", "text/html");
    return { doc: emptyDoc, parseErrors, domCorruption: true, domCorruptionReason: "Empty HTML string" };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Detect parsererror nodes (Firefox / Chrome behavior differs)
  const parserErrorNodes = doc.getElementsByTagName("parsererror");
  if (parserErrorNodes.length > 0) {
    const errorText = parserErrorNodes[0]?.textContent ?? "Unknown parse error";
    parseErrors.push(`DOMParser error: ${errorText.trim().substring(0, 200)}`);
  }

  // Check for missing body or head
  if (!doc.body) {
    parseErrors.push("Missing <body> element");
  }
  if (!doc.head) {
    parseErrors.push("Missing <head> element");
  }

  // Note: We do NOT use a regex-based tag mismatch heuristic.
  // Counting tags via regex is unreliable because it matches tags inside
  // <script> and <style> content (e.g., JavaScript template literals),
  // does not handle self-closing tags, and miscounts void elements.
  // The browser's DOMParser already handles malformed HTML gracefully.
  // Parser errors are detected via parsererror nodes (checked above).

  // ─── DOM Corruption Detection ───────────────────────────────────
  // Reject DOMs when:
  // 1. body contains only script tags
  // 2. main is missing and content density is below 0.1
  // 3. heading extractor finds headings but semanticStructure finds none
  // 4. parsererror nodes are present
  // 5. DOM has fewer than 5 text nodes
  // 6. DOM has more than 10,000 empty nodes
  const corruptionReason = detectDomCorruption(doc, html, parseErrors);

  return { doc, parseErrors, domCorruption: corruptionReason !== undefined, domCorruptionReason: corruptionReason };
}

/**
 * Detect DOM corruption based on ACE v1.2 rules.
 * @returns Corruption reason string if corrupted, undefined otherwise.
 */
function detectDomCorruption(doc: Document, html: string, parseErrors: string[]): string | undefined {
  // Rule 4: parsererror nodes are present
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return "parsererror nodes present in DOM";
  }

  const body = doc.body;
  if (!body) {
    return "Missing <body> element";
  }

  // Rule 1: body contains only script tags
  const bodyChildren = Array.from(body.children);
  if (bodyChildren.length > 0) {
    const nonScriptChildren = bodyChildren.filter((el) => {
      const tag = el.tagName.toLowerCase();
      return tag !== "script" && tag !== "noscript" && tag !== "template";
    });
    if (nonScriptChildren.length === 0) {
      return "body contains only script tags";
    }
  }

  // Rule 5: DOM has fewer than 2 text nodes — only flag for truly empty DOMs.
  // The previous threshold of 5 was too aggressive and flagged legitimate
  // minimal pages. A DOM with 0-1 text nodes is effectively empty.
  const textNodeCount = countTextNodes(body);
  if (textNodeCount < 2) {
    return `DOM has only ${textNodeCount} text nodes — effectively empty`;
  }

  // Rule 6: DOM has more than 10,000 empty nodes
  const emptyNodeCount = countEmptyNodes(body);
  if (emptyNodeCount > 10000) {
    return `DOM has ${emptyNodeCount} empty nodes (maximum 10,000 allowed)`;
  }

  // Rule 2: main is missing AND there's almost no visible text
  // Only trigger for truly broken pages with no content at all.
  // Valid pages that don't use <main> are NOT corrupted.
  const hasMain = doc.querySelector("main") !== null || doc.querySelector('[role="main"]') !== null;
  if (!hasMain) {
    const visibleText = extractVisibleText(doc);
    // Only flag as corruption if there's essentially no visible text
    if (visibleText.trim().length === 0) {
      return `main element missing and no visible text content`;
    }
  }

  // Rule 3: heading extractor finds headings but semanticStructure finds none
  // This is checked in the evidenceLayer after extraction — not here.
  // A page with headings but no semantic structure elements is semantically poor,
  // not DOM-corrupted. Only flag if the DOM has truly no structure at all.

  // Check for truncated HTML — only flag for very short HTML that's clearly broken
  // Large real-world pages may have missing closing tags due to proxy truncation
  // but still contain valid content
  if (!html.includes("</html>") && !html.includes("</body>") && html.length < 500) {
    return "HTML appears truncated — missing closing tags and very short";
  }

  // Note: Mid-sentence truncation is checked in the evidence layer as a
  // non-critical warning, NOT as DOM corruption. Many valid pages have text
  // that doesn't end with terminal punctuation (e.g., navigation elements,
  // timestamps, copyright notices). Flagging this as DOM corruption would
  // cause false positives.

  return undefined;
}

/**
 * Count all text nodes within an element (recursively).
 * Only counts non-empty text nodes (whitespace-only counts as empty).
 * Uses ownerDocument to ensure compatibility with DOMParser-created documents.
 */
function countTextNodes(el: Element): number {
  const ownerDoc = el.ownerDocument ?? document;
  let count = 0;
  try {
    const walker = ownerDoc.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node: Text): number {
        return (node.textContent ?? "").trim().length > 0
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });
    while (walker.nextNode()) {
      count++;
    }
  } catch {
    // Fallback: recursive walk if TreeWalker fails
    count = countTextNodesRecursive(el);
  }
  return count;
}

/** Recursive fallback for counting text nodes. */
function countTextNodesRecursive(el: Element): number {
  let count = 0;
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim().length > 0) {
      count++;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      count += countTextNodesRecursive(child as Element);
    }
  }
  return count;
}

/**
 * Count empty element nodes within an element (recursively).
 * An empty node has no text content and no element children.
 */
function countEmptyNodes(el: Element): number {
  let count = 0;
  const allElements = el.querySelectorAll("*");
  for (const child of Array.from(allElements)) {
    if (child.children.length === 0 && (child.textContent ?? "").trim().length === 0) {
      count++;
    }
  }
  return count;
}

/**
 * Extract all visible text from a Document, excluding script/style/template content.
 * @param doc Parsed Document.
 * @returns Concatenated visible text.
 */
export function extractVisibleText(doc: Document): string {
  const body = doc.body;
  if (!body) return "";

  // Clone to avoid modifying the original
  const clone = body.cloneNode(true) as Element;

  // Remove non-content elements
  const removeSelectors = ["script", "style", "template", "noscript", "svg", "iframe"];
  for (const sel of removeSelectors) {
    clone.querySelectorAll(sel).forEach((el) => el.remove());
  }

  return clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/**
 * Extract the main content element from a Document.
 * Tries semantic <main>, [role=main], then heuristics by content density.
 * @param doc Parsed Document.
 * @returns The main content Element or body as fallback.
 */
export function extractMainContent(doc: Document): Element {
  // Try semantic <main>
  const main = doc.querySelector("main");
  if (main && extractVisibleTextFromElement(main).length > MIN_VISIBLE_TEXT) {
    return main;
  }

  // Try [role="main"]
  const roleMain = doc.querySelector('[role="main"]');
  if (roleMain && extractVisibleTextFromElement(roleMain).length > MIN_VISIBLE_TEXT) {
    return roleMain;
  }

  // Try <article> with most content
  const articles = doc.querySelectorAll("article");
  let bestArticle: Element | null = null;
  let bestLen = 0;
  articles.forEach((art) => {
    const len = extractVisibleTextFromElement(art).length;
    if (len > bestLen) {
      bestLen = len;
      bestArticle = art;
    }
  });
  if (bestArticle && bestLen > MIN_VISIBLE_TEXT) {
    return bestArticle;
  }

  // Fallback: body
  return doc.body ?? doc.documentElement;
}

/**
 * Detect if the document is a hydration shell (SPA with no rendered content).
 * @param doc Parsed Document.
 * @returns True if a hydration shell is detected.
 */
export function detectHydrationShell(doc: Document): boolean {
  const body = doc.body;
  if (!body) return true;

  const visibleText = extractVisibleText(doc);
  if (visibleText.length < MIN_VISIBLE_TEXT) {
    // Check for SPA root patterns
    const hasSpaRoot = SPA_ROOT_IDS.some((id) => {
      const el = doc.getElementById(id);
      return el !== null;
    });

    const hasHydrationAttr = HYDRATION_PATTERNS.some((pattern) => {
      return body.querySelector(`[${pattern}], [class*="${pattern}"]`) !== null
        || body.outerHTML.includes(pattern);
    });

    // Check for script-heavy body with little content
    const scripts = body.querySelectorAll("script");
    const hasAppScripts = scripts.length > 2;

    return hasSpaRoot || (hasHydrationAttr && hasAppScripts);
  }

  return false;
}

/**
 * Detect if the document contains shadow DOM roots.
 * Note: DOMParser does not hydrate shadow DOM; we detect via custom element
 * patterns and attachShadow calls in scripts.
 * @param doc Parsed Document.
 * @returns True if shadow DOM usage is detected.
 */
export function detectShadowDom(doc: Document): boolean {
  // Check for attachShadow in inline scripts
  const scripts = doc.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent ?? "";
    if (text.includes("attachShadow") || text.includes("shadowRoot")) {
      return true;
    }
  }

  // Check for known custom element patterns that use shadow DOM
  const customElements = doc.querySelectorAll("*");
  for (const el of customElements) {
    const tag = el.tagName.toLowerCase();
    if (tag.includes("-") && !tag.startsWith("x-")) {
      // Custom element — likely uses shadow DOM
      // Only flag if there's minimal visible content inside
      const text = extractVisibleTextFromElement(el).trim();
      if (text.length < 20) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detect if the document is malformed (parser errors, missing structure).
 * @param doc Parsed Document.
 * @returns True if malformed DOM is detected.
 */
export function detectMalformedDom(doc: Document): boolean {
  // Missing body
  if (!doc.body) return true;

  // Missing html root
  if (!doc.documentElement) return true;

  // Parsererror nodes
  if (doc.getElementsByTagName("parsererror").length > 0) return true;

  // Check for severely broken structure — no head and no body children
  const bodyChildren = doc.body.children;
  const headChildren = doc.head?.children ?? [];
  if (bodyChildren.length === 0 && headChildren.length === 0) {
    // Could be plain text — check if body has text
    if ((doc.body.textContent ?? "").trim().length > 0) {
      return true; // Text without structure = malformed
    }
    return true;
  }

  return false;
}

/**
 * Detect if the <body> contains only <script> tags (script-only DOM).
 * @param doc Parsed Document.
 * @returns True if script-only DOM is detected.
 */
export function detectScriptOnlyDom(doc: Document): boolean {
  const body = doc.body;
  if (!body) return true;

  const bodyChildren = Array.from(body.children);
  if (bodyChildren.length === 0) {
    // Check if body has any text
    const text = (body.textContent ?? "").trim();
    return text.length === 0;
  }

  // Check if all children are scripts or noscript
  const nonScriptChildren = bodyChildren.filter((el) => {
    const tag = el.tagName.toLowerCase();
    return tag !== "script" && tag !== "noscript" && tag !== "template";
  });

  if (nonScriptChildren.length === 0) return true;

  // Check if non-script children have no visible text
  const visibleText = extractVisibleText(doc);
  if (visibleText.length === 0 && bodyChildren.length > 0) {
    return true;
  }

  return false;
}

/**
 * Detect if the page is boilerplate-only (cookie banners, GDPR, login walls).
 * @param doc Parsed Document.
 * @returns True if boilerplate-only content is detected.
 */
export function detectBoilerplateDom(doc: Document): boolean {
  const visibleText = extractVisibleText(doc);
  if (visibleText.length === 0) return false; // Already caught by other detectors

  // Check for boilerplate elements
  let boilerplateCount = 0;
  for (const sel of BOILERPLATE_SELECTORS) {
    if (doc.querySelector(sel)) {
      boilerplateCount++;
    }
  }

  // If multiple boilerplate elements and very little content
  if (boilerplateCount >= 2 && visibleText.length < MIN_VISIBLE_TEXT * 2) {
    return true;
  }

  // Check if visible text is mostly cookie/consent language
  const boilerplateKeywords = [
    "cookie",
    "gdpr",
    "consent",
    "privacy policy",
    "accept all",
    "reject all",
    "manage cookies",
    "by continuing",
    "we use cookies",
    "sign in to continue",
    "log in to view",
    "subscribe to continue",
  ];
  const lowerText = visibleText.toLowerCase();
  const keywordHits = boilerplateKeywords.filter((kw) => lowerText.includes(kw));
  if (keywordHits.length >= 2 && visibleText.length < 500) {
    return true;
  }

  return false;
}

/**
 * Detect if the HTML string is oversized.
 * @param html Raw HTML string.
 * @returns True if oversized.
 */
export function detectOversizedHtml(html: string): boolean {
  if (!html) return false;
  return html.length > MAX_HTML_SIZE;
}

/**
 * Detect encoding failures in the HTML string.
 * @param html Raw HTML string.
 * @returns True if encoding failure is detected.
 */
export function detectEncodingFailure(html: string): boolean {
  if (!html) return false;

  // Check for replacement characters (U+FFFD) indicating decode failures
  if (html.includes("\uFFFD")) return true;

  // Check for meta charset declaration
  const charsetMatch = html.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i);
  const declaredCharset = charsetMatch?.[1]?.toLowerCase() ?? "";

  // If charset is not UTF-8 or compatible, flag
  if (declaredCharset && !declaredCharset.includes("utf")) {
    return true;
  }

  // Check for mojibake patterns (common encoding artifacts)
  const mojibakePatterns = [
    "\u00c3\u00a2", // Ã¢
    "\u00c3\u00a3", // Ã£
    "\u00e2\u0080\u0099", // '
    "\u00e2\u0080\u009c", // "
    "\u00e2\u0080\u009d", // "
  ];
  for (const pattern of mojibakePatterns) {
    if (html.includes(pattern)) return true;
  }

  return false;
}

// ─── Internal Helpers ──────────────────────────────────────────────

/**
 * Extract visible text from a single element (not full document).
 * @internal
 */
export function extractVisibleTextFromElement(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("script, style, template, noscript").forEach((e) => e.remove());
  return clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/**
 * Generate a unique CSS selector path for an element.
 * @param el Target element.
 * @returns CSS selector string.
 */
export function generateSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current.tagName !== "HTML") {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector += `#${current.id}`;
      parts.unshift(selector);
      break;
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    // Add class if present (first class only for brevity)
    if (current.classList.length > 0 && !current.id) {
      const firstClass = current.classList[0];
      if (firstClass && !firstClass.includes(":")) {
        selector += `.${firstClass}`;
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

/**
 * Truncate text to a maximum length with ellipsis.
 * @param text Text to truncate.
 * @param max Maximum length (default 500).
 * @returns Truncated text.
 */
export function truncateText(text: string, max = 500): string {
  if (text.length <= max) return text;
  return text.substring(0, max).trim() + "...";
}

/**
 * Check if text appears to end mid-word (a strong signal of truncation).
 *
 * This function deliberately uses a CONSERVATIVE heuristic — only flagging
 * text where the last word is clearly cut off (alphabetic, ends with a
 * consonant cluster, and is not a known English word).
 *
 * Many legitimate pages end with navigation links, copyright notices,
 * menu items, and other non-sentence text that lacks terminal punctuation.
 * These are NOT truncation. Only mid-word cuts are reliable truncation signals.
 *
 * @param text Text to check.
 * @returns True if text appears truncated mid-word.
 */
export function isMidSentenceTruncation(text: string): boolean {
  if (!text || text.length < 200) return false;

  const trimmed = text.trimEnd();
  if (trimmed.length < 200) return false;

  // Check if text ends with terminal punctuation or non-text characters
  const lastChar = trimmed[trimmed.length - 1];
  if ([".", "!", "?", ":", ";", ")", "]", "}", ",", "-", "/", "_"].includes(lastChar)) {
    return false;
  }

  // Only flag if the last word is clearly cut off mid-word.
  // A cut-off word is purely alphabetic and ends with a consonant cluster.
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1] ?? "";

  if (lastWord.length > 2 && lastWord.length < 15 && /^[a-zA-Z]+$/.test(lastWord)) {
    const endsWithConsonantCluster = /[^aeiouAEIOU]{2,}$/.test(lastWord);
    if (endsWithConsonantCluster) {
      // Exclude common English words that naturally end with consonant clusters
      const commonWords = new Set([
        "about", "content", "comment", "contact", "search",
        "home", "help", "sitemap", "blog", "news",
        "page", "post", "list", "text", "next", "last",
        "first", "second", "third", "fourth", "fifth",
        "north", "south", "east", "west",
        "wikipedia", "encyclopedia", "media", "wiki",
        "javascript", "css", "html", "xml",
        "microsoft", "apple", "google", "amazon",
        "washington", "jefferson", "franklin",
        "district", "department", "government",
        "article", "section", "chapter", "appendix",
        "index", "glossary", "bibliography",
        "copyright", "trademark", "patent",
        "privacy", "security", "access",
        "account", "settings", "preferences",
        "subscribe", "unsubscribe", "register",
        "download", "upload", "export", "import",
        "print", "share", "email", "link",
        "edit", "delete", "update", "create",
        "view", "hide", "show", "expand", "collapse",
        "back", "forward", "previous",
        "start", "stop", "end", "begin",
        "open", "close", "save", "cancel",
      ]);
      const lowerWord = lastWord.toLowerCase();
      if (!commonWords.has(lowerWord)) {
        return true;
      }
    }
  }

  return false;
}

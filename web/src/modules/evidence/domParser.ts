/**
 * DOM Parsing Utility — Production Version for ACE v1.2
 * 
 * Handles parsing, corruption detection, hydration detection,
 * visible text extraction, and completeness heuristics.
 */

const MIN_VISIBLE_TEXT = 80;
const MAX_EMPTY_NODES = 12000;

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
 */
export function parseHtmlToDom(html) {
  const parseErrors = [];

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

function detectDomCorruption(doc) {
  if (!doc.body) return "Missing <body> element";

  const textNodes = countTextNodes(doc.body);
  if (textNodes < 3) return `Too few text nodes (${textNodes})`;

  const emptyNodes = countEmptyNodes(doc.body);
  if (emptyNodes > MAX_EMPTY_NODES) return `Too many empty nodes (${emptyNodes})`;

  if (detectScriptOnlyDom(doc)) return "Script-only DOM";

  if (detectHydrationShell(doc)) return "Hydration shell detected";

  return undefined;
}

/** Count non-empty text nodes */
function countTextNodes(el) {
  let count = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if ((node.textContent ?? "").trim().length > 0) count++;
  }
  return count;
}

/** Count completely empty element nodes */
function countEmptyNodes(el) {
  return Array.from(el.querySelectorAll("*")).filter(child => 
    child.children.length === 0 && (child.textContent ?? "").trim().length === 0
  ).length;
}

/** Extract all visible text, excluding hidden/script/style content */
export function extractVisibleText(doc) {
  const clone = doc.body.cloneNode(true) as Element;

  clone.querySelectorAll("script, style, template, noscript, svg").forEach(el => el.remove());

  // Remove hidden elements
  clone.querySelectorAll('*').forEach(el => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      el.remove();
    }
  });

  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Detect hydration shell / empty SPA */
export function detectHydrationShell(doc) {
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

/** Detect script-only / empty body */
export function detectScriptOnlyDom(doc) {
  const body = doc.body;
  if (!body) return true;

  const children = Array.from(body.children);
  const nonScript = children.filter(el => {
    const tag = el.tagName.toLowerCase();
    return !["script", "noscript", "template"].includes(tag);
  });

  return nonScript.length === 0 || extractVisibleText(doc).length < 20;
}

/** Detect boilerplate-only pages */
export function detectBoilerplateDom(doc) {
  const text = extractVisibleText(doc).toLowerCase();
  if (text.length < 100) return false;

  const boilerplateCount = BOILERPLATE_SELECTORS.filter(sel => doc.querySelector(sel)).length;
  return boilerplateCount >= 2 && text.length < 400;
}

export function extractMainContent(doc) {
  return doc.querySelector("main") ||
         doc.querySelector('[role="main"]') ||
         doc.querySelector("article") ||
         doc.body;
}

export function detectShadowDom(doc) {
  const scripts = doc.querySelectorAll("script");
  for (const script of scripts) {
    if ((script.textContent ?? "").includes("attachShadow")) return true;
  }
  return false;
}

export function isMidSentenceTruncation(text) {
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

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
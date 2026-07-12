/**
 * Lazy-Load Detector — Production Version for ACE v1.2
 *
 * Detects lazy-loaded content patterns in HTML and DOM.
 * Supports:
 * - Native loading="lazy"
 * - data-lazy*, data-src*, data-bg*, data-background
 * - LazyLoad library attributes (data-ll-status, data-was-processed)
 * - IntersectionObserver usage
 * - Infinite scroll containers
 * - Elementor lazy widgets
 * - Unloaded images, iframes, videos
 */

//
// ATTRIBUTE PATTERNS
//
const LAZY_LOAD_ATTRIBUTES = [
  "loading",
  "data-lazy",
  "data-lazy-src",
  "data-src",
  "data-bg",
  "data-background",
  "data-lazyload",
  "data-ll-status",
  "data-was-processed",
  "data-evaluated",
  "data-elementor-type",
  "data-elementor-id",
  "data-ll-state",
  "data-ll-loaded",
];

//
// CLASS PATTERNS
//
const LAZY_LOAD_CLASS_PATTERNS = [
  "lazy",
  "lazyload",
  "lazy-load",
  "lazyloading",
  "lazy-loading",
  "lazyloaded",
  "lazy-loaded",
  "lazyload-item",
  "lazyload-pending",
  "lazyload-wrapper",
  "lozad",
  "blazy",
  "vanilla-lazyload",
  "elementor-lazy",
  "elementor-lazyload",
];

//
// SELECTORS
//
const LAZY_LOAD_SELECTORS = [
  '[loading="lazy"]',
  "[data-lazy]",
  "[data-lazy-src]",
  "[data-src]",
  "[data-bg]",
  "[data-background]",
  "[data-lazyload]",
  "[data-ll-status]",
  "[data-was-processed]",
  "[data-elementor-type]",
  "[data-elementor-id]",
  ".lazy",
  ".lazyload",
  ".lazy-loading",
  ".lazyload-pending",
  ".lazyload-item",
];

//
// INFINITE SCROLL PATTERNS
//
const INFINITE_SCROLL_PATTERNS = [
  "infinite-scroll",
  "infinite_scroll",
  "loadmore",
  "load-more",
  "auto-load",
  "scroll-pagination",
  "scroll-loader",
];

//
// HTML-LEVEL DETECTION
//
export function hasLazyLoadPatterns(html: string): boolean {
  if (!html) return false;
  const lower = html.toLowerCase();

  // Attribute patterns
  for (const attr of LAZY_LOAD_ATTRIBUTES) {
    if (lower.includes(attr.toLowerCase())) return true;
  }

  // Class patterns
  for (const pattern of LAZY_LOAD_CLASS_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) return true;
  }

  // IntersectionObserver usage
  if (lower.includes("intersectionobserver") || lower.includes("new intersectionobserver")) {
    return true;
  }

  // Infinite scroll patterns
  for (const pattern of INFINITE_SCROLL_PATTERNS) {
    if (lower.includes(pattern)) return true;
  }

  // Pagination + scroll combo
  if (lower.includes("pagination") && lower.includes("scroll")) {
    return true;
  }

  return false;
}

//
// DOM-LEVEL DETECTION
//
export function detectLazyLoadElements(doc: Document): Element[] {
  const elements = new Set<Element>();

  // Selector-based detection
  for (const selector of LAZY_LOAD_SELECTORS) {
    try {
      doc.querySelectorAll(selector).forEach((el) => elements.add(el));
    } catch {
      // Skip invalid selectors
    }
  }

  // Class-based detection
  doc.querySelectorAll("*").forEach((el) => {
    const className = el.className;
    if (!className || typeof className !== "string") return;

    const lowerClass = className.toLowerCase();
    for (const pattern of LAZY_LOAD_CLASS_PATTERNS) {
      if (lowerClass.includes(pattern.toLowerCase())) {
        elements.add(el);
        break;
      }
    }
  });

  return Array.from(elements);
}

//
// UNLOADED ELEMENT DETECTION
//
export function countUnloadedLazyElements(doc: Document): number {
  let count = 0;

  // Images with data-src but no src
  doc.querySelectorAll("img[data-src], img[data-lazy-src]").forEach((img) => {
    const src = img.getAttribute("src");
    if (!src || src.trim() === "") count++;
  });

  // Iframes lazy-loaded
  doc.querySelectorAll("iframe[data-src], iframe[data-lazy-src]").forEach((iframe) => {
    const src = iframe.getAttribute("src");
    if (!src || src.trim() === "") count++;
  });

  // Videos lazy-loaded
  doc.querySelectorAll("video[data-src], video[data-lazy-src]").forEach((video) => {
    const src = video.getAttribute("src");
    if (!src || src.trim() === "") count++;
  });

  // Lazyload classes not yet loaded
  doc.querySelectorAll(".lazy, .lazyload, .lazyload-pending").forEach((el) => {
    if (
      !el.classList.contains("lazy-loaded") &&
      !el.classList.contains("lazyloaded")
    ) {
      count++;
    }
  });

  // LazyLoad library statuses
  doc.querySelectorAll('[data-ll-status="pending"], [data-ll-status="loading"]').forEach(() => {
    count++;
  });

  // Elementor widgets not yet rendered
  doc.querySelectorAll("[data-elementor-type]").forEach((el) => {
    if (!el.querySelector(".elementor-widget-container")) {
      count++;
    }
  });

  return count;
}

//
// INTERSECTIONOBSERVER DETECTION
//
export function detectIntersectionObserverUsage(doc: Document): boolean {
  const scripts = doc.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent ?? "";
    if (
      text.includes("IntersectionObserver") ||
      text.includes("new IntersectionObserver")
    ) {
      return true;
    }
  }
  return false;
}

//
// SUMMARY
//
export function getLazyLoadSummary(doc: Document): {
  totalLazyElements: number;
  unloadedElements: number;
  hasIntersectionObserver: boolean;
  hasLazyLoadPatterns: boolean;
  infiniteScrollDetected: boolean;
} {
  const lazyElements = detectLazyLoadElements(doc);

  const html = doc.documentElement.outerHTML.toLowerCase();
  const infiniteScrollDetected = INFINITE_SCROLL_PATTERNS.some((p) => html.includes(p));

  return {
    totalLazyElements: lazyElements.length,
    unloadedElements: countUnloadedLazyElements(doc),
    hasIntersectionObserver: detectIntersectionObserverUsage(doc),
    hasLazyLoadPatterns: lazyElements.length > 0,
    infiniteScrollDetected,
  };
}

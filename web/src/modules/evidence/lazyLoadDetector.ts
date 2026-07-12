/**
 * Lazy-Load Detector — Phase 2
 *
 * Detects lazy-loaded content patterns in HTML and DOM.
 * Used by the rendered DOM extractor to identify elements that need
 * scrolling to trigger loading, and by the evidence layer to report
 * lazy-load detection in diagnostics.
 *
 * Supports:
 * - Native loading="lazy" attribute
 * - Elementor data-elementor-type / data-elementor-id
 * - data-lazy, data-lazy-src, data-src, data-bg, data-background
 * - IntersectionObserver usage in inline scripts
 * - Common lazyload CSS classes (lazy, lazyload, lazyload-item, etc.)
 * - data-ll-status (LazyLoad library)
 * - data-was-processed (LazyLoad library)
 * - data-evaluated (various frameworks)
 * - Infinite scroll containers
 */

/** Attributes that indicate lazy-loaded content. */
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
];

/** CSS class patterns that indicate lazy-loaded content. */
const LAZY_LOAD_CLASS_PATTERNS = [
  "lazy",
  "lazyload",
  "lazyload-item",
  "lazy-loading",
  "lazy-loaded",
  "lazyload-pending",
  "elementor-section",
  "elementor-widget",
  "elementor-element",
  "wp-block-lazy",
  "IntersectionObserver",
];

/** Selectors for finding lazy-loadable elements in the DOM. */
const LAZY_LOAD_SELECTORS = [
  '[loading="lazy"]',
  '[data-lazy]',
  '[data-lazy-src]',
  '[data-src]',
  '[data-bg]',
  '[data-background]',
  '[data-lazyload]',
  '[data-elementor-type]',
  '[data-elementor-id]',
  ".lazy",
  ".lazyload",
  ".lazyload-item",
  ".lazy-loading",
  ".lazyload-pending",
];

/**
 * Detect if an HTML string contains lazy-load patterns.
 * Used to determine if rendered DOM extraction should be attempted.
 * @param html Raw HTML string.
 * @returns True if lazy-load patterns are detected.
 */
export function hasLazyLoadPatterns(html: string): boolean {
  if (!html) return false;
  const lowerHtml = html.toLowerCase();

  // Check for lazy-load attributes
  for (const attr of LAZY_LOAD_ATTRIBUTES) {
    if (lowerHtml.includes(attr.toLowerCase())) return true;
  }

  // Check for lazy-load class patterns
  for (const pattern of LAZY_LOAD_CLASS_PATTERNS) {
    if (lowerHtml.includes(pattern.toLowerCase())) return true;
  }

  // Check for IntersectionObserver usage in scripts
  if (lowerHtml.includes("intersectionobserver")) return true;

  // Check for infinite scroll patterns
  if (
    lowerHtml.includes("infinite-scroll") ||
    lowerHtml.includes("infinite_scroll") ||
    lowerHtml.includes("loadmore") ||
    lowerHtml.includes("load-more") ||
    lowerHtml.includes("pagination") && lowerHtml.includes("scroll")
  ) {
    return true;
  }

  return false;
}

/**
 * Find all lazy-loadable elements in a Document.
 * @param doc Parsed Document.
 * @returns Array of elements that have lazy-loading attributes or classes.
 */
export function detectLazyLoadElements(doc: Document): Element[] {
  const elements = new Set<Element>();

  for (const selector of LAZY_LOAD_SELECTORS) {
    try {
      doc.querySelectorAll(selector).forEach((el) => elements.add(el));
    } catch {
      // Invalid selector — skip
    }
  }

  // Check for elements with IntersectionObserver-related classes
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

/**
 * Count lazy-loadable elements that haven't been loaded yet.
 * An element is "unloaded" if it has a data-src/data-lazy-src but no src,
 * or if it has a lazyload class but not a lazy-loaded class.
 * @param doc Parsed Document.
 * @returns Count of unloaded lazy-load elements.
 */
export function countUnloadedLazyElements(doc: Document): number {
  let count = 0;

  // Images with data-src but no src
  doc.querySelectorAll("img[data-src], img[data-lazy-src]").forEach((img) => {
    if (!img.getAttribute("src") || img.getAttribute("src") === "") {
      count++;
    }
  });

  // Elements with lazyload class but not lazy-loaded
  doc.querySelectorAll(".lazy, .lazyload, .lazyload-pending").forEach((el) => {
    if (!el.classList.contains("lazy-loaded") && !el.classList.contains("lazyloaded")) {
      count++;
    }
  });

  // Elements with data-ll-status="pending" or "loading"
  doc.querySelectorAll('[data-ll-status="pending"], [data-ll-status="loading"]').forEach(() => {
    count++;
  });

  // Elementor elements that haven't been rendered
  doc.querySelectorAll("[data-elementor-type]").forEach((el) => {
    const widgetType = el.getAttribute("data-elementor-type");
    if (widgetType && !el.querySelector(".elementor-widget-container")) {
      // Elementor widget without its container — not yet rendered
      count++;
    }
  });

  return count;
}

/**
 * Detect IntersectionObserver usage in inline scripts.
 * @param doc Parsed Document.
 * @returns True if IntersectionObserver is used in any inline script.
 */
export function detectIntersectionObserverUsage(doc: Document): boolean {
  const scripts = doc.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent ?? "";
    if (text.includes("IntersectionObserver") || text.includes("new IntersectionObserver")) {
      return true;
    }
  }
  return false;
}

/**
 * Get a summary of lazy-load detection for diagnostics.
 * @param doc Parsed Document.
 * @returns Object with lazy-load statistics.
 */
export function getLazyLoadSummary(doc: Document): {
  totalLazyElements: number;
  unloadedElements: number;
  hasIntersectionObserver: boolean;
  hasLazyLoadPatterns: boolean;
} {
  const lazyElements = detectLazyLoadElements(doc);
  return {
    totalLazyElements: lazyElements.length,
    unloadedElements: countUnloadedLazyElements(doc),
    hasIntersectionObserver: detectIntersectionObserverUsage(doc),
    hasLazyLoadPatterns: lazyElements.length > 0,
  };
}

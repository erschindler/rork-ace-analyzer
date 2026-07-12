/**
 * Elementor Detector — Phase 2 (Updated)
 *
 * Detects and classifies modern Elementor DOM structures in WordPress pages.
 * Supports:
 * - Legacy Section/Column layout
 * - Modern Flexbox Container layout (e-con*)
 * - Nested inner sections
 * - Widgets and widget containers
 * - Theme builder / Pro widgets
 * - Basic lazy-load / hydration readiness signals
 *
 * Elementor DOM hierarchy (legacy):
 *   .elementor-section (top-level section → treat as <section>)
 *     .elementor-container (layout container)
 *       .elementor-column (column → treat as <div role="region">)
 *         .elementor-widget-* (widget → content block)
 *         .elementor-inner-section (nested section → treat as nested <section>)
 *
 * Elementor DOM hierarchy (modern Flexbox):
 *   .e-con (Elementor Container)
 *     .e-con-inner
 *       .elementor-element (generic element wrapper)
 *         .elementor-widget-* (widget → content block)
 *
 * This module provides detection functions used by:
 * - semanticStructureExtractor: to identify Elementor sections/widgets
 * - evidenceLayer: to report Elementor detection in diagnostics
 * - renderedDomExtractor: to wait for Elementor's rendering lifecycle
 */

/** Class patterns that identify Elementor structural elements (legacy + modern). */
const ELEMENTOR_SECTION_PATTERNS = [
  // Legacy section patterns
  "elementor-section",
  "elementor-top-section",
  "elementor-inner-section",
  "elementor-section-wrap",
  // Modern container-based section wrappers
  "e-con", // Flexbox container
  "e-con-inner",
  "e-con-boxed",
  "e-con-full",
];

const ELEMENTOR_CONTAINER_PATTERNS = [
  "elementor-container",
  "elementor-widget-container",
  "elementor-element", // generic Elementor element wrapper
  "elementor-element-populated",
  "elementor-widget-wrap",
];

const ELEMENTOR_COLUMN_PATTERNS = [
  "elementor-column",
  "elementor-col-",
];

/** Widget patterns including common core + theme/pro widgets. */
const ELEMENTOR_WIDGET_PATTERNS = [
  "elementor-widget",
  "elementor-widget-heading",
  "elementor-widget-text-editor",
  "elementor-widget-button",
  "elementor-widget-image",
  "elementor-widget-icon",
  "elementor-widget-icon-box",
  "elementor-widget-image-box",
  "elementor-widget-menu",
  "elementor-widget-nav-menu",
  "elementor-widget-video",
  "elementor-widget-video-playlist",
  "elementor-widget-google_maps",
  "elementor-widget-spacer",
  "elementor-widget-divider",
  "elementor-widget-testimonial",
  "elementor-widget-tabs",
  "elementor-widget-accordion",
  "elementor-widget-toggle",
  "elementor-widget-counter",
  "elementor-widget-progress",
  "elementor-widget-star-rating",
  "elementor-widget-form",
  "elementor-widget-login",
  "elementor-widget-slides",
  "elementor-widget-carousel",
  "elementor-widget-gallery",
  "elementor-widget-call-to-action",
  "elementor-widget-html",
  "elementor-widget-shortcode",
  "elementor-widget-sidebar",
  "elementor-widget-woocommerce",
  // Theme builder / Pro widgets
  "elementor-widget-theme-site-logo",
  "elementor-widget-theme-site-title",
  "elementor-widget-theme-site-tagline",
  "elementor-widget-theme-site-description",
  "elementor-widget-theme-site-navigation",
  "elementor-widget-theme-site-search",
  "elementor-widget-theme-site-cart",
  "elementor-widget-theme-site-menu",
  "elementor-widget-theme-post-title",
  "elementor-widget-theme-post-content",
  "elementor-widget-theme-post-excerpt",
  "elementor-widget-theme-post-featured-image",
  "elementor-widget-theme-archive-title",
  "elementor-widget-theme-archive-description",
  "elementor-widget-archive-posts",
  "elementor-widget-posts",
  "elementor-widget-loop-grid",
  "elementor-widget-loop-carousel",
  "elementor-widget-loop-item",
  "elementor-widget-loop-template",
];

/** Data attributes that indicate Elementor elements. */
const ELEMENTOR_DATA_ATTRIBUTES = [
  "data-elementor-type",
  "data-elementor-id",
  "data-elementor-settings",
  "data-elementor-post-type",
  "data-elementor-device-mode",
];

/** Script/inline markers that often appear in Elementor pages. */
const ELEMENTOR_SCRIPT_MARKERS = [
  "elementor/frontend",
  "elementorFrontend",
  "elementor-webpack",
  "elementor-pro",
];

/**
 * Check if a Document contains Elementor-generated content.
 * This is a high-level detector that works for both legacy and modern layouts.
 * @param doc Parsed Document or Element.
 * @returns True if Elementor content is detected.
 */
export function isElementorPage(doc: Document | Element): boolean {
  // 1. Class-based detection (sections, containers, widgets)
  const classPatterns = [
    ...ELEMENTOR_SECTION_PATTERNS,
    ...ELEMENTOR_CONTAINER_PATTERNS,
    ...ELEMENTOR_WIDGET_PATTERNS,
    ...ELEMENTOR_COLUMN_PATTERNS,
  ];

  for (const pattern of classPatterns) {
    if (doc.querySelector(`[class*="${pattern}"]`)) {
      return true;
    }
  }

  // 2. Data-attribute detection
  for (const attr of ELEMENTOR_DATA_ATTRIBUTES) {
    if (doc.querySelector(`[${attr}]`)) {
      return true;
    }
  }

  // 3. Inline style detection (Elementor often injects style blocks with .elementor- selectors)
  const styles = doc.querySelectorAll("style");
  for (const style of styles) {
    const text = style.textContent ?? "";
    if (text.includes("elementor-") && text.includes(".elementor-")) {
      return true;
    }
  }

  // 4. Script markers (Elementor frontend / webpack / pro)
  const scripts = doc.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent ?? "";
    for (const marker of ELEMENTOR_SCRIPT_MARKERS) {
      if (text.includes(marker)) {
        return true;
      }
    }
    const src = script.getAttribute("src") ?? "";
    for (const marker of ELEMENTOR_SCRIPT_MARKERS) {
      if (src.includes(marker)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detect if an HTML string contains Elementor patterns.
 * Used to determine if rendered DOM extraction should wait for Elementor.
 * @param html Raw HTML string.
 * @returns True if Elementor patterns are detected.
 */
export function hasElementorPatterns(html: string): boolean {
  if (!html) return false;
  const lowerHtml = html.toLowerCase();

  return (
    lowerHtml.includes("elementor-section") ||
    lowerHtml.includes("elementor-widget") ||
    lowerHtml.includes("elementor-column") ||
    lowerHtml.includes("elementor-container") ||
    lowerHtml.includes("elementor-element") ||
    lowerHtml.includes("e-con") ||
    lowerHtml.includes("data-elementor-type") ||
    lowerHtml.includes("data-elementor-id") ||
    lowerHtml.includes("elementor/frontend") ||
    lowerHtml.includes("elementorfrontend")
  );
}

/**
 * Find all Elementor section-like elements in a Document.
 * Includes legacy .elementor-section and modern .e-con containers.
 * @param doc Parsed Document.
 * @returns Array of Elementor section elements.
 */
export function detectElementorSections(doc: Document): Element[] {
  const sections = new Set<Element>();

  for (const pattern of ELEMENTOR_SECTION_PATTERNS) {
    doc.querySelectorAll(`[class*="${pattern}"]`).forEach((el) => sections.add(el));
  }

  return Array.from(sections);
}

/**
 * Find all Elementor inner section elements (nested sections).
 * @param doc Parsed Document.
 * @returns Array of Elementor inner section elements.
 */
export function detectElementorInnerSections(doc: Document): Element[] {
  const innerSections = new Set<Element>();

  doc.querySelectorAll("[class*='elementor-inner-section']").forEach((el) =>
    innerSections.add(el),
  );

  // Modern nested containers can also be represented by nested .e-con elements
  doc.querySelectorAll(".e-con .e-con-inner").forEach((el) => innerSections.add(el));

  return Array.from(innerSections);
}

/**
 * Find all Elementor widget elements in a Document.
 * Widgets are the content-bearing elements (headings, text, buttons, images).
 * @param doc Parsed Document.
 * @returns Array of Elementor widget elements.
 */
export function detectElementorWidgets(doc: Document): Element[] {
  const widgets = new Set<Element>();

  for (const pattern of ELEMENTOR_WIDGET_PATTERNS) {
    doc.querySelectorAll(`[class*="${pattern}"]`).forEach((el) => widgets.add(el));
  }

  // Generic widget wrapper
  doc.querySelectorAll("[class*='elementor-widget']").forEach((el) => widgets.add(el));

  return Array.from(widgets);
}

/**
 * Find all Elementor column elements.
 * @param doc Parsed Document.
 * @returns Array of Elementor column elements.
 */
export function detectElementorColumns(doc: Document): Element[] {
  const columns = new Set<Element>();

  for (const pattern of ELEMENTOR_COLUMN_PATTERNS) {
    doc.querySelectorAll(`[class*="${pattern}"]`).forEach((el) => columns.add(el));
  }

  return Array.from(columns);
}

/**
 * Extract all text content from Elementor widgets.
 * Includes heading text, paragraph text, button text, alt text, aria-label, and title.
 * @param doc Parsed Document.
 * @returns Concatenated text from all Elementor widgets.
 */
export function extractElementorText(doc: Document): string {
  const widgets = detectElementorWidgets(doc);
  const texts: string[] = [];

  for (const widget of widgets) {
    // Get the widget container (where the actual content is)
    const container =
      widget.querySelector(".elementor-widget-container") ??
      widget.querySelector(".elementor-widget-wrap") ??
      widget;
    const target = container ?? widget;

    // Extract heading text
    target.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
      const text = h.textContent?.trim() ?? "";
      if (text) texts.push(text);
    });

    // Extract paragraph text
    target.querySelectorAll("p").forEach((p) => {
      const text = p.textContent?.trim() ?? "";
      if (text) texts.push(text);
    });

    // Extract button and link text
    target
      .querySelectorAll("button, .elementor-button, .elementor-button-text, a")
      .forEach((btn) => {
        const text = btn.textContent?.trim() ?? "";
        if (text) texts.push(text);
      });

    // Extract alt text from images
    target.querySelectorAll("img[alt]").forEach((img) => {
      const alt = img.getAttribute("alt")?.trim() ?? "";
      if (alt) texts.push(alt);
    });

    // Extract aria-label text
    const ariaLabel = target.getAttribute("aria-label")?.trim();
    if (ariaLabel) texts.push(ariaLabel);

    // Extract title attribute text
    const title = target.getAttribute("title")?.trim();
    if (title) texts.push(title);

    // If no specific elements found, get the widget's direct text
    if (
      target.querySelectorAll("h1, h2, h3, h4, h5, h6, p, button, a, img").length === 0
    ) {
      const directText = target.textContent?.trim() ?? "";
      if (directText) texts.push(directText);
    }
  }

  return texts.join(" ");
}

/**
 * Check if Elementor's frontend rendering has completed.
 * Elementor injects a `elementorFrontend` object when its JS is loaded.
 * @param win Window object of the iframe.
 * @returns True if Elementor frontend is initialized.
 */
export function isElementorFrontendReady(win: Window): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = win as any;
    const frontend = w.elementorFrontend;
    if (!frontend) return false;

    const hasModules = typeof frontend.modules !== "undefined";
    const hasConfig = typeof frontend.config !== "undefined";
    const hasHooks = typeof frontend.hooks !== "undefined";

    return hasModules || hasConfig || hasHooks;
  } catch {
    return false;
  }
}

/**
 * Get a summary of Elementor detection for diagnostics.
 * @param doc Parsed Document.
 * @returns Object with Elementor statistics.
 */
export function getElementorSummary(doc: Document): {
  isElementor: boolean;
  sectionCount: number;
  innerSectionCount: number;
  widgetCount: number;
  columnCount: number;
  widgetTypes: string[];
} {
  const sections = detectElementorSections(doc);
  const innerSections = detectElementorInnerSections(doc);
  const widgets = detectElementorWidgets(doc);
  const columns = detectElementorColumns(doc);

  // Extract widget types from classes
  const widgetTypes = new Set<string>();
  widgets.forEach((widget) => {
    const className = widget.className;
    if (typeof className === "string") {
      const match = className.match(/elementor-widget-([\w-]+)/);
      if (match) widgetTypes.add(match[1]);
    }
  });

  return {
    isElementor:
      sections.length > 0 ||
      widgets.length > 0 ||
      doc.querySelector("[data-elementor-type]") !== null,
    sectionCount: sections.length,
    innerSectionCount: innerSections.length,
    widgetCount: widgets.length,
    columnCount: columns.length,
    widgetTypes: Array.from(widgetTypes),
  };
}

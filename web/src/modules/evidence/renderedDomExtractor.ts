/**
 * Rendered DOM Extractor — Phase 2
 *
 * Renders HTML in a hidden iframe to execute JavaScript, trigger lazy loading,
 * and capture the fully rendered DOM. This is the critical module for
 * JS-heavy sites (React/Vue SPAs, Elementor/WordPress, hydration shells).
 *
 * Strategy:
 *   1. Fetch raw HTML via the backend (server-side, no CORS)
 *   2. Create a hidden iframe in the document
 *   3. Write the HTML into the iframe using srcdoc
 *   4. Wait for DOMContentLoaded, network idle, and async rendering
 *   5. Detect and wait for Elementor's frontend lifecycle
 *   6. Scroll the page programmatically to trigger lazy-loaded content
 *   7. Wait for new DOM nodes to appear after each scroll
 *   8. Re-scan and merge all content into the final DOM snapshot
 *   9. Serialize the fully rendered DOM as HTML
 *
 * If rendering fails or the result is a hydration shell/script-only DOM,
 * contamination is flagged and the raw HTML is used as fallback.
 */

import { hasElementorPatterns } from "./elementorDetector";
import { hasLazyLoadPatterns } from "./lazyLoadDetector";
import { detectHydrationShell, detectScriptOnlyDom, extractVisibleText } from "./domParser";

/** Maximum time to wait for rendering (ms). */
const RENDER_TIMEOUT_MS = 15_000;

/** Time to wait after DOMContentLoaded before checking content (ms). */
const INITIAL_RENDER_WAIT_MS = 2_000;

/** Time to wait after each scroll for new content (ms). */
const SCROLL_SETTLE_MS = 800;

/** Maximum number of scroll steps to trigger lazy loading. */
const MAX_SCROLL_STEPS = 15;

/** Time to wait for Elementor frontend to initialize (ms). */
const ELEMENTOR_WAIT_MS = 3_000;

/** Additional time to wait for network idle after initial render (ms). */
const NETWORK_IDLE_WAIT_MS = 1_500;

/** Result of rendered DOM extraction. */
export interface RenderedDomResult {
  /** The fully rendered HTML serialized from the iframe. */
  html: string;
  /** Whether JavaScript rendering was used. */
  rendered: boolean;
  /** Whether lazy-load scrolling was performed. */
  lazyLoadTriggered: boolean;
  /** Whether Elementor was detected and waited for. */
  elementorDetected: boolean;
  /** Number of scroll steps performed. */
  scrollSteps: number;
  /** Content growth: visible text length after rendering minus before. */
  contentGrowth: number;
  /** Error message if rendering failed. */
  error?: string;
  /** Contamination flags from rendering. */
  contaminationFlags: string[];
}

/**
 * Render HTML in a hidden iframe and capture the fully rendered DOM.
 *
 * This function:
 * 1. Creates a hidden iframe
 * 2. Writes the HTML into it
 * 3. Waits for JS execution and rendering
 * 4. Scrolls to trigger lazy loading
 * 5. Serializes the rendered DOM
 *
 * @param html Raw HTML string to render.
 * @param url Source URL (for relative URL resolution).
 * @returns RenderedDomResult with the fully rendered HTML.
 */
export async function renderDomInIframe(
  html: string,
  url: string,
): Promise<RenderedDomResult> {
  if (!html || html.trim().length === 0) {
    return {
      html: "",
      rendered: false,
      lazyLoadTriggered: false,
      elementorDetected: false,
      scrollSteps: 0,
      contentGrowth: 0,
      error: "Empty HTML provided for rendering",
      contaminationFlags: ["empty_input"],
    };
  }

  const contaminationFlags: string[] = [];
  const hasLazy = hasLazyLoadPatterns(html);
  const hasElementor = hasElementorPatterns(html);

  // Parse the base URL for relative URL resolution
  let baseUrl: string;
  try {
    const parsed = new URL(url);
    baseUrl = `${parsed.protocol}//${parsed.host}`;
  } catch {
    baseUrl = "";
  }

  // Inject a <base> tag if we have a base URL, so relative resources load
  let renderableHtml = html;
  if (baseUrl) {
    // Inject <base> right after <head> or at the start
    if (renderableHtml.includes("<head>")) {
      renderableHtml = renderableHtml.replace(
        /<head>/i,
        `<head><base href="${baseUrl}">`,
      );
    } else if (renderableHtml.includes("<head ")) {
      renderableHtml = renderableHtml.replace(
        /<head\s/i,
        `<head ><base href="${baseUrl}"> `,
      );
    } else if (renderableHtml.includes("<html")) {
      renderableHtml = renderableHtml.replace(
        /<html[^>]*>/i,
        (match) => `${match}<head><base href="${baseUrl}"></head>`,
      );
    } else {
      renderableHtml = `<head><base href="${baseUrl}"></head>${renderableHtml}`;
    }
  }

  // Create the hidden iframe
  const iframe = document.createElement("iframe");
  iframe.style.position = "absolute";
  iframe.style.left = "-9999px";
  iframe.style.top = "-9999px";
  iframe.style.width = "1280px";
  iframe.style.height = "900px";
  iframe.style.visibility = "hidden";
  iframe.style.border = "none";
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");

  // Use srcdoc to inject the HTML
  iframe.srcdoc = renderableHtml;

  // Append to document
  document.body.appendChild(iframe);

  try {
    // Wait for the iframe to load
    await waitForIframeLoad(iframe, RENDER_TIMEOUT_MS);

    const iframeDoc = iframe.contentDocument;
    const iframeWin = iframe.contentWindow;

    if (!iframeDoc || !iframeWin) {
      return {
        html: html, // Fall back to raw HTML
        rendered: false,
        lazyLoadTriggered: false,
        elementorDetected: hasElementor,
        scrollSteps: 0,
        contentGrowth: 0,
        error: "Could not access iframe document",
        contaminationFlags: ["rendering_failed"],
      };
    }

    // Wait for initial rendering (DOMContentLoaded + async JS)
    await waitForInitialRender(iframeWin, iframeDoc, INITIAL_RENDER_WAIT_MS);

    // Wait for network idle (no pending requests for a period)
    await waitForNetworkIdle(iframeWin, NETWORK_IDLE_WAIT_MS);

    // If Elementor is detected, wait for its frontend lifecycle
    if (hasElementor) {
      await waitForElementor(iframeWin, ELEMENTOR_WAIT_MS);
    }

    // Measure content before scrolling
    const textBeforeScroll = extractVisibleText(iframeDoc);

    // Scroll to trigger lazy loading
    let scrollSteps = 0;
    if (hasLazy) {
      scrollSteps = await triggerLazyLoadScrolling(iframeDoc, iframeWin);
    }

    // Wait for final settle after scrolling
    await delay(SCROLL_SETTLE_MS);

    // Measure content after scrolling
    const textAfterScroll = extractVisibleText(iframeDoc);
    const contentGrowth = textAfterScroll.length - textBeforeScroll.length;

    // Serialize the rendered DOM
    const renderedHtml = serializeRenderedDom(iframeDoc);

    // Validate rendered HTML has more content than raw
    const rawText = extractVisibleTextFromHtml(html);
    const renderedText = extractVisibleTextFromHtml(renderedHtml);

    // If rendered has significantly less content than raw, the JS may have
    // replaced the server-rendered content with a hydration shell.
    // In that case, use the raw HTML and DON'T set critical contamination —
    // the raw HTML has the content, we just couldn't render it.
    // This is a rendering fallback, not a DOM contamination event.
    if (renderedText.length < rawText.length * 0.3 && rawText.length > 200) {
      // Rendered content is much less than raw — fall back to raw HTML
      // Don't set hydration_shell — the raw HTML has full content
      return {
        html: html, // Use raw HTML which has more content
        rendered: false,
        lazyLoadTriggered: scrollSteps > 0,
        elementorDetected: hasElementor,
        scrollSteps,
        contentGrowth: 0,
        error: "Rendered DOM has less content than raw HTML — using raw HTML fallback",
        contaminationFlags: [], // No contamination — raw HTML is used
      };
    }

    // Only check for hydration shell / script-only DOM if rendering
    // produced comparable content (i.e., we're actually using the rendered DOM)
    const isHydrationShell = detectHydrationShell(iframeDoc);
    const isScriptOnly = detectScriptOnlyDom(iframeDoc);

    if (isHydrationShell) {
      contaminationFlags.push("hydration_shell");
    }
    if (isScriptOnly) {
      contaminationFlags.push("script_only_dom");
    }

    return {
      html: renderedHtml,
      rendered: true,
      lazyLoadTriggered: scrollSteps > 0,
      elementorDetected: hasElementor,
      scrollSteps,
      contentGrowth,
      contaminationFlags,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      html: html, // Fall back to raw HTML
      rendered: false,
      lazyLoadTriggered: false,
      elementorDetected: hasElementor,
      scrollSteps: 0,
      contentGrowth: 0,
      error: `Rendering error: ${errorMsg}`,
      contaminationFlags: ["rendering_failed"],
    };
  } finally {
    // Clean up the iframe
    iframe.remove();
  }
}

/**
 * Check if rendered DOM extraction should be attempted for this HTML.
 * Returns true if the HTML contains patterns that suggest JS rendering
 * is needed (lazy loading, Elementor, SPA frameworks).
 * @param html Raw HTML string.
 * @returns True if rendering should be attempted.
 */
export function shouldRenderDom(html: string): boolean {
  if (!html || html.length < 100) return false;
  return hasLazyLoadPatterns(html) || hasElementorPatterns(html) || hasSpaPatterns(html);
}

/**
 * Detect SPA framework patterns in HTML.
 * @param html Raw HTML string.
 * @returns True if SPA patterns are detected.
 */
function hasSpaPatterns(html: string): boolean {
  const lowerHtml = html.toLowerCase();
  return (
    lowerHtml.includes('id="root"') ||
    lowerHtml.includes('id="app"') ||
    lowerHtml.includes('id="__next"') ||
    lowerHtml.includes('id="__nuxt"') ||
    lowerHtml.includes('id="__vue"') ||
    lowerHtml.includes("data-reactroot") ||
    lowerHtml.includes("data-react-helmet") ||
    lowerHtml.includes("data-server-rendered") ||
    lowerHtml.includes("data-react-checksum") ||
    lowerHtml.includes("ng-version") ||
    lowerHtml.includes("data-n-hydration") ||
    lowerHtml.includes("data-n-ssr")
  );
}

// ─── Internal Helpers ──────────────────────────────────────────────

/**
 * Wait for the iframe to load.
 * @param iframe The iframe element.
 * @param timeout Maximum time to wait (ms).
 */
function waitForIframeLoad(iframe: HTMLIFrameElement, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Iframe load timeout after ${timeout}ms`));
    }, timeout);

    iframe.addEventListener("load", () => {
      clearTimeout(timer);
      resolve();
    });

    iframe.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Iframe load error"));
    });

    // If srcdoc is already loaded (synchronous for small docs)
    try {
      if (iframe.contentDocument?.readyState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    } catch {
      // Cross-origin — will wait for load event
    }
  });
}

/**
 * Wait for initial rendering: DOMContentLoaded + async JS.
 * @param win The iframe's window.
 * @param doc The iframe's document.
 * @param waitMs Additional wait time after DOMContentLoaded.
 */
async function waitForInitialRender(
  win: Window,
  doc: Document,
  waitMs: number,
): Promise<void> {
  // If DOMContentLoaded hasn't fired yet, wait for it
  if (doc.readyState === "loading") {
    await new Promise<void>((resolve) => {
      const onLoad = () => {
        doc.removeEventListener("DOMContentLoaded", onLoad);
        resolve();
      };
      doc.addEventListener("DOMContentLoaded", onLoad);

      // Also check readState in case it changes before listener attaches
      if (doc.readyState !== "loading") {
        doc.removeEventListener("DOMContentLoaded", onLoad);
        resolve();
      }
    });
  }

  // Wait for window load event (all resources)
  if (doc.readyState !== "complete") {
    await new Promise<void>((resolve) => {
      const onLoad = () => {
        win.removeEventListener("load", onLoad);
        resolve();
      };
      win.addEventListener("load", onLoad);

      // Timeout fallback
      setTimeout(() => {
        win.removeEventListener("load", onLoad);
        resolve();
      }, waitMs);
    });
  }

  // Additional settle time for async rendering
  await delay(waitMs);
}

/**
 * Wait for network idle — no pending requests for a period.
 * Uses a simple heuristic: check if document is still changing.
 * @param win The iframe's window.
 * @param idleMs Time to consider "idle" (ms).
 */
async function waitForNetworkIdle(win: Window, idleMs: number): Promise<void> {
  // Check if performance API is available for resource timing
  try {
    const entries = win.performance?.getEntriesByType?.("resource") ?? [];
    // If there are pending resources, wait a bit more
    if (entries.length > 5) {
      await delay(idleMs);
    } else {
      await delay(Math.min(idleMs, 500));
    }
  } catch {
    await delay(idleMs);
  }
}

/**
 * Wait for Elementor's frontend rendering to complete.
 * @param win The iframe's window.
 * @param timeout Maximum time to wait (ms).
 */
async function waitForElementor(win: Window, timeout: number): Promise<void> {
  const startTime = Date.now();

  // Wait for elementorFrontend to be defined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = win as any;

  while (Date.now() - startTime < timeout) {
    if (typeof w.elementorFrontend !== "undefined") {
      // Elementor frontend is loaded — wait a bit more for widgets to init
      await delay(500);
      return;
    }
    await delay(200);
  }

  // Elementor didn't initialize in time — continue with what we have
}

/**
 * Scroll the iframe document to trigger lazy-loaded content.
 * Scrolls from top to bottom in steps, waiting for new content after each.
 * @param doc The iframe's document.
 * @param win The iframe's window.
 * @returns Number of scroll steps performed.
 */
async function triggerLazyLoadScrolling(
  doc: Document,
  win: Window,
): Promise<number> {
  const scrollHeight = doc.documentElement?.scrollHeight ?? doc.body?.scrollHeight ?? 0;
  if (scrollHeight <= win.innerHeight) {
    // Page is short — no scrolling needed
    // Still trigger a small scroll to activate IntersectionObserver
    win.scrollTo(0, 10);
    await delay(SCROLL_SETTLE_MS);
    return 1;
  }

  const stepSize = Math.max(win.innerHeight, Math.floor(scrollHeight / MAX_SCROLL_STEPS));
  let steps = 0;
  let lastNodeCount = countDomNodes(doc);

  for (let y = 0; y <= scrollHeight + win.innerHeight; y += stepSize) {
    win.scrollTo(0, y);
    steps++;
    await delay(SCROLL_SETTLE_MS);

    // Check if new nodes appeared
    const currentNodeCount = countDomNodes(doc);
    if (currentNodeCount > lastNodeCount) {
      // New content loaded — wait a bit more for it to settle
      await delay(SCROLL_SETTLE_MS);
      lastNodeCount = currentNodeCount;
    }
  }

  // Scroll back to top to trigger any top-of-page lazy elements
  win.scrollTo(0, 0);
  await delay(SCROLL_SETTLE_MS);

  return steps;
}

/**
 * Count DOM nodes in a document (element nodes only).
 * @param doc The document to count nodes in.
 * @returns Number of element nodes.
 */
function countDomNodes(doc: Document): number {
  return doc.querySelectorAll("*").length;
}

/**
 * Serialize the rendered DOM to an HTML string.
 * Includes the full document with proper DOCTYPE.
 * @param doc The rendered document.
 * @returns Serialized HTML string.
 */
function serializeRenderedDom(doc: Document): string {
  // Get the full document HTML
  const docType = doc.doctype
    ? `<!DOCTYPE ${doc.doctype.name}${doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : ""}${doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : ""}>`
    : "<!DOCTYPE html>";

  const html = doc.documentElement?.outerHTML ?? "";
  return `${docType}\n${html}`;
}

/**
 * Extract visible text from an HTML string (for comparison).
 * @param html HTML string.
 * @returns Visible text content.
 */
function extractVisibleTextFromHtml(html: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return extractVisibleText(doc);
  } catch {
    return "";
  }
}

/**
 * Simple delay helper.
 * @param ms Milliseconds to wait.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

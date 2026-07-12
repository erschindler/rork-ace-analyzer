/**
 * Rendered DOM Extractor — Production Version
 *
 * Fully addresses JS-heavy sites, Elementor, SPAs, lazy loading, and hydration.
 */

import { hasElementorPatterns } from "./elementorDetector";
import { hasLazyLoadPatterns } from "./lazyLoadDetector";
import { detectHydrationShell, detectScriptOnlyDom, extractVisibleText } from "./domParser";

const RENDER_TIMEOUT_MS = 25000;
const INITIAL_RENDER_WAIT_MS = 3000;
const SCROLL_SETTLE_MS = 1000;
const MAX_SCROLL_STEPS = 22;
const ELEMENTOR_WAIT_MS = 5500;
const MUTATION_OBSERVE_WINDOW_MS = 3000;
const MAX_RETRIES = 2;

export interface RenderedDomResult {
  html: string;
  rendered: boolean;
  lazyLoadTriggered: boolean;
  elementorDetected: boolean;
  scrollSteps: number;
  contentGrowth: number;
  error?: string;
  contaminationFlags: string[];
  diagnostics: {
    nodeCount: number;
    textLength: number;
    scrollHeight: number;
    mutationCount: number;
    hydrationShell: boolean;
    scriptOnlyDom: boolean;
    retries: number;
  };
}

/**
 * Main entry point with retry logic
 */
export async function renderDomInIframe(html: string, url: string): Promise<RenderedDomResult> {
  if (!html || html.trim().length === 0) {
    return createFailureResult("Empty HTML", ["empty_input"]);
  }

  let attempt = 0;
  let bestResult = null;

  while (attempt <= MAX_RETRIES) {
    const result = await performRenderAttempt(html, url, attempt);
    bestResult = result;

    if (result.rendered && isGoodRender(result)) {
      return result;
    }

    attempt++;
    if (attempt <= MAX_RETRIES) await delay(1200);
  }

  return bestResult;
}

/** Single render attempt */
async function performRenderAttempt(html: string, url: string, attempt: number) {
  const contaminationFlags: string[] = [];
  const hasElementor = hasElementorPatterns(html);
  const hasLazy = hasLazyLoadPatterns(html);

  const iframe = createHiddenIframe();
  document.body.appendChild(iframe);

  try {
    iframe.srcdoc = injectBaseTag(html, url);

    await waitForIframeLoad(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;

    if (!doc || !win) {
      return createFailureResult("Iframe access failed", ["access_failed"]);
    }

    // Core rendering waits
    await waitForInitialRender(win, doc);
    await waitForSpaReadiness(doc);
    if (hasElementor) await waitForElementor(win);

    const mutationCount = await observeDomMutations(doc);

    const textBefore = extractVisibleText(doc);

    // Lazy loading
    let scrollSteps = 0;
    let contentGrowth = 0;
    if (hasLazy) {
      const scrollResult = await triggerLazyLoadScrollingWithGrowth(doc, win, textBefore.length);
      scrollSteps = scrollResult.steps;
      contentGrowth = scrollResult.growth;
    }

    await delay(SCROLL_SETTLE_MS);

    const textAfter = extractVisibleText(doc);
    const finalGrowth = contentGrowth || (textAfter.length - textBefore.length);

    const isHydration = detectHydrationShell(doc);
    const isScriptOnly = detectScriptOnlyDom(doc);

    if (isHydration) contaminationFlags.push("hydration_shell");
    if (isScriptOnly) contaminationFlags.push("script_only_dom");

    const diagnostics = {
      nodeCount: doc.querySelectorAll("*").length,
      textLength: textAfter.length,
      scrollHeight: doc.documentElement.scrollHeight,
      mutationCount,
      hydrationShell: isHydration,
      scriptOnlyDom: isScriptOnly,
      retries: attempt,
    };

    const renderedHtml = serializeRenderedDom(doc);

    return {
      html: renderedHtml,
      rendered: true,
      lazyLoadTriggered: scrollSteps > 0,
      elementorDetected: hasElementor,
      scrollSteps,
      contentGrowth: finalGrowth,
      contaminationFlags,
      diagnostics,
    };

  } catch (err) {
    return createFailureResult(err.message, ["rendering_failed"]);
  } finally {
    iframe.remove();
  }
}

// ==================== Core Helpers ====================

function createHiddenIframe() {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:absolute; left:-9999px; top:-9999px; width:1280px; height:900px; visibility:hidden; border:none;";
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
  return iframe;
}

function injectBaseTag(html, url) {
  try {
    const base = new URL(url).origin;
    if (/<\/head>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, match => `${match}<base href="${base}">`);
    }
    return `<head><base href="${base}"></head>` + html;
  } catch {
    return html;
  }
}

async function waitForIframeLoad(iframe) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Iframe timeout")), RENDER_TIMEOUT_MS);
    iframe.onload = () => { clearTimeout(timer); resolve(); };
  });
}

async function waitForInitialRender(win, doc) {
  if (doc.readyState === "loading") {
    await new Promise(r => doc.addEventListener("DOMContentLoaded", r, {once: true}));
  }
  await delay(INITIAL_RENDER_WAIT_MS);
}

async function waitForSpaReadiness(doc) {
  const selectors = [
    '[data-reactroot]', '[data-react-root]', '#__next', '[data-v-app]',
    '[ng-version]', '#root', '#app'
  ];

  for (let i = 0; i < 8; i++) {
    for (const sel of selectors) {
      if (doc.querySelector(sel)) return;
    }
    await delay(400);
  }
}

async function waitForElementor(win) {
  const start = Date.now();
  while (Date.now() - start < ELEMENTOR_WAIT_MS) {
    if (win.elementorFrontend?.modules) {
      await delay(1200);
      return;
    }
    await delay(400);
  }
}

async function observeDomMutations(doc) {
  return new Promise(resolve => {
    let count = 0;
    const obs = new MutationObserver(() => { count += 1; });
    obs.observe(doc.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      resolve(count);
    }, MUTATION_OBSERVE_WINDOW_MS);
  });
}

async function triggerLazyLoadScrollingWithGrowth(doc, win, initialTextLen) {
  let steps = 0;
  let lastHeight = doc.documentElement.scrollHeight;

  const stepSize = Math.max(500, Math.floor(lastHeight / MAX_SCROLL_STEPS));

  for (let y = 0; y < lastHeight + 1000; y += stepSize) {
    win.scrollTo(0, y);
    steps++;
    await delay(SCROLL_SETTLE_MS);

    const newHeight = doc.documentElement.scrollHeight;
    if (newHeight > lastHeight + 100) lastHeight = newHeight;
  }

  win.scrollTo(0, 0);
  await delay(SCROLL_SETTLE_MS);

  const finalText = extractVisibleText(doc);
  return { steps, growth: finalText.length - initialTextLen };
}

function serializeRenderedDom(doc) {
  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : "<!DOCTYPE html>";
  return doctype + "\n" + doc.documentElement.outerHTML;
}

function isPoorlyRendered(result) {
  return result.diagnostics.nodeCount < 250 || result.diagnostics.textLength < 300;
}

function createFailureResult(errorMsg, flags) {
  return {
    html: "",
    rendered: false,
    lazyLoadTriggered: false,
    elementorDetected: false,
    scrollSteps: 0,
    contentGrowth: 0,
    error: errorMsg,
    contaminationFlags: flags,
    diagnostics: { nodeCount: 0, textLength: 0, scrollHeight: 0, mutationCount: 0, hydrationShell: false, scriptOnlyDom: false, retries: 0 }
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
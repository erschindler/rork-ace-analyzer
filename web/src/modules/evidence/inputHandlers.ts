/**
 * Input Handlers — Phase 2
 * Entry points for evidence extraction from different input types.
 * Each returns a full AceEvidenceResult.
 */

import type { AceEvidenceResult, RenderingDiagnostics } from "@/types";
import { fetchRenderedHtml } from "./fetcher";
import { extractEvidenceFromHtmlString, createEmptyEvidenceResult } from "./evidenceLayer";
import { createContaminationDiagnostics } from "./contaminationDiagnostics";
import { renderDomInIframe, shouldRenderDom } from "./renderedDomExtractor";

/**
 * Extract evidence from a URL by fetching and parsing the rendered HTML.
 *
 * Strategy:
 *   1. Fetch raw HTML via backend (server-side, no CORS, no truncation)
 *   2. If the HTML contains JS-heavy patterns (lazy-load, Elementor, SPA),
 *      render it in a hidden iframe to capture the fully rendered DOM
 *   3. Extract evidence from the rendered HTML (or raw HTML as fallback)
 *   4. Merge diagnostics from both fetch and rendering phases
 *
 * @param url The URL to fetch and analyze.
 * @param options Optional configuration for rendering.
 * @returns Promise resolving to complete AceEvidenceResult.
 */
export async function extractEvidenceFromUrl(
  url: string,
  options?: { skipRendering?: boolean },
): Promise<AceEvidenceResult> {
  const fetchResult = await fetchRenderedHtml(url);

  // If fetch failed completely, return empty result with error
  if (!fetchResult.html || fetchResult.html.trim().length === 0) {
    return createEmptyEvidenceResult(
      url,
      fetchResult.fetchError ?? "Empty response from server",
      fetchResult.contaminationFlags,
    );
  }

  let htmlForExtraction = fetchResult.html;
  let renderingDiagnostics: RenderingDiagnostics | undefined;
  let renderingContaminationFlags: string[] = [];

  // Check if we should attempt rendered DOM extraction
  const shouldRender = !options?.skipRendering && shouldRenderDom(fetchResult.html);

  if (shouldRender) {
    try {
      const renderResult = await renderDomInIframe(fetchResult.html, fetchResult.finalUrl);

      renderingDiagnostics = {
        rendered: renderResult.rendered,
        lazyLoadTriggered: renderResult.lazyLoadTriggered,
        elementorDetected: renderResult.elementorDetected,
        scrollSteps: renderResult.scrollSteps,
        contentGrowth: renderResult.contentGrowth,
        renderingError: renderResult.error,
      };

      // Use rendered HTML if rendering succeeded
      if (renderResult.rendered && renderResult.html) {
        htmlForExtraction = renderResult.html;
      }

      // Merge rendering contamination flags
      renderingContaminationFlags = renderResult.contaminationFlags;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      renderingDiagnostics = {
        rendered: false,
        lazyLoadTriggered: false,
        elementorDetected: false,
        scrollSteps: 0,
        contentGrowth: 0,
        renderingError: `Rendering exception: ${errorMsg}`,
      };
      // Rendering failed — continue with raw HTML
    }
  }

  // Extract evidence from the (possibly rendered) HTML
  const result = extractEvidenceFromHtmlString(htmlForExtraction, fetchResult.finalUrl);

  // Merge fetch diagnostics into the result
  if (result.diagnostics) {
    result.diagnostics.fetchStatus = fetchResult.status;
    result.diagnostics.fetchError = fetchResult.fetchError;
    result.diagnostics.rendering = renderingDiagnostics;
    // Update htmlSize to reflect the actual HTML used for extraction
    result.diagnostics.htmlSize = htmlForExtraction.length;
  }

  // Merge contamination flags from fetch and rendering into the evidence result.
  // IMPORTANT: CORS proxy usage is the NORMAL path for most sites.
  // cors_proxy_fallback and cors_block are NOT contamination — they
  // indicate the direct fetch was blocked by CORS but the proxy succeeded.
  // Only merge truly problematic fetch flags.
  const significantFetchFlags = fetchResult.contaminationFlags.filter(
    (f) => f !== "cors_proxy_fallback" && f !== "cors_block" && f !== "cors_proxy_used",
  );

  // Merge rendering contamination flags (e.g., hydration_shell from rendering)
  const allSignificantFlags = [...significantFetchFlags, ...renderingContaminationFlags];

  if (allSignificantFlags.length > 0) {
    result.contamination = true;
    result.contaminationFlags = [
      ...(result.contaminationFlags ?? []),
      ...allSignificantFlags,
    ];
    if (!result.contaminationType) {
      result.contaminationType = allSignificantFlags[0];
    }
    // Update contamination diagnostics if present
    if (result.diagnostics?.contaminationDiagnostics) {
      const collector = createContaminationDiagnostics();
      // Re-record existing records
      for (const rec of result.diagnostics.contaminationDiagnostics.records) {
        collector.recordContamination(rec.source, rec.type, rec.reason, rec.severity, rec.blocksScoring, rec.detail);
      }
      // Record significant fetch-level contamination (not proxy usage)
      for (const flag of significantFetchFlags) {
        if (flag !== "fetch_failure") {
          collector.recordContamination("fetcher", flag, `Fetch contamination: ${flag}`, "warning", false);
        }
      }
      // Record rendering contamination
      for (const flag of renderingContaminationFlags) {
        const isCritical = flag === "hydration_shell" || flag === "script_only_dom" || flag === "rendering_failed";
        collector.recordContamination(
          "evidence_layer",
          flag,
          `Rendering contamination: ${flag}`,
          isCritical ? "critical" : "warning",
          isCritical,
        );
      }
      result.diagnostics.contaminationDiagnostics = collector.build();
    }
  }

  // Always record proxy usage as informational (not contamination)
  if (fetchResult.proxyUsed && result.diagnostics?.contaminationDiagnostics) {
    const collector = createContaminationDiagnostics();
    for (const rec of result.diagnostics.contaminationDiagnostics.records) {
      collector.recordContamination(rec.source, rec.type, rec.reason, rec.severity, rec.blocksScoring, rec.detail);
    }
    collector.recordContamination(
      "fetcher",
      "cors_proxy_fallback",
      `Fetched via CORS proxy: ${fetchResult.proxyUsed}`,
      "info",
      false,
      { proxyUsed: fetchResult.proxyUsed },
    );
    result.diagnostics.contaminationDiagnostics = collector.build();
  }

  return result;
}

/**
 * Extract evidence from a raw HTML string.
 * @param html Raw HTML string to analyze.
 * @param url Optional source URL (defaults to "inline://html").
 * @returns AceEvidenceResult with all extracted evidence.
 */
export function extractEvidenceFromHtml(html: string, url?: string): AceEvidenceResult {
  const sourceUrl = url ?? "inline://html";
  return extractEvidenceFromHtmlString(html, sourceUrl);
}

/**
 * Extract evidence from plain text.
 * Wraps the text in a minimal HTML structure for DOM-based extraction.
 * @param text Plain text content to analyze.
 * @param url Optional source URL (defaults to "inline://text").
 * @returns AceEvidenceResult with evidence extracted from the wrapped text.
 */
export function extractEvidenceFromText(text: string, url?: string): AceEvidenceResult {
  const sourceUrl = url ?? "inline://text";

  if (!text || text.trim().length === 0) {
    return createEmptyEvidenceResult(sourceUrl, "Empty text input", ["empty_input"]);
  }

  // Wrap text in minimal HTML structure
  // Split by double newlines to create paragraphs
  const paragraphs = text
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(text.substring(0, 80))}</title>
</head>
<body>
  <main>
    ${paragraphs || `<p>${escapeHtml(text)}</p>`}
  </main>
</body>
</html>`;

  const result = extractEvidenceFromHtmlString(html, sourceUrl);

  // Add text-specific contamination flag if content is very short
  if (text.length < 100) {
    result.contamination = true;
    result.contaminationFlags = [...(result.contaminationFlags ?? []), "minimal_text_input"];
  }

  return result;
}

/**
 * Extract evidence from a Markdown string.
 * Converts Markdown to HTML, then runs standard extraction.
 * @param md Markdown content to analyze.
 * @param url Optional source URL (defaults to "inline://markdown").
 * @returns AceEvidenceResult with evidence extracted from converted HTML.
 */
export function extractEvidenceFromMarkdown(md: string, url?: string): AceEvidenceResult {
  const sourceUrl = url ?? "inline://markdown";

  if (!md || md.trim().length === 0) {
    return createEmptyEvidenceResult(sourceUrl, "Empty markdown input", ["empty_input"]);
  }

  const html = markdownToHtml(md, sourceUrl);
  return extractEvidenceFromHtmlString(html, sourceUrl);
}

/**
 * Extract evidence from a JSON object.
 * Analyzes the JSON structure and creates evidence from its keys and values.
 * @param json JSON object or string to analyze.
 * @param url Optional source URL (defaults to "inline://json").
 * @returns AceEvidenceResult with evidence extracted from the JSON structure.
 */
export function extractEvidenceFromJson(json: unknown, url?: string): AceEvidenceResult {
  const sourceUrl = url ?? "inline://json";

  let parsed: unknown;
  if (typeof json === "string") {
    try {
      parsed = JSON.parse(json);
    } catch {
      return createEmptyEvidenceResult(sourceUrl, "Invalid JSON string", ["invalid_json"]);
    }
  } else {
    parsed = json;
  }

  // Convert JSON to an HTML representation for extraction
  const html = jsonToHtml(parsed, sourceUrl);
  const result = extractEvidenceFromHtmlString(html, sourceUrl);

  // Mark as JSON source in diagnostics
  if (result.diagnostics) {
    result.diagnostics.fetchError = undefined;
  }

  // Add JSON-specific metadata
  const jsonStr = JSON.stringify(parsed);
  if (result.diagnostics) {
    result.diagnostics.htmlSize = jsonStr.length;
  }

  return result;
}

// ─── Internal Helpers ──────────────────────────────────────────────

/** Escape HTML special characters. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

/**
 * Convert Markdown to HTML.
 * Supports: headings, paragraphs, lists, code blocks, blockquotes, links, bold, italic.
 * @internal
 */
function markdownToHtml(md: string, title: string): string {
  const lines = md.split("\n");
  const htmlParts: string[] = [];
  let inCodeBlock = false;
  let inList = false;
  let listType: "ul" | "ol" = "ul";

  const titleMatch = md.match(/^#\s+(.+)$/m);
  const pageTitle = titleMatch?.[1] ?? title.substring(0, 80);

  for (const line of lines) {
    // Code block fences
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        htmlParts.push("</code></pre>");
        inCodeBlock = false;
      } else {
        htmlParts.push("<pre><code>");
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      htmlParts.push(escapeHtml(line));
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        htmlParts.push(`</${listType}>`);
        inList = false;
      }
      const level = headingMatch[1].length;
      htmlParts.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Ordered list items
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== "ol") {
        if (inList) htmlParts.push(`</${listType}>`);
        htmlParts.push("<ol>");
        inList = true;
        listType = "ol";
      }
      htmlParts.push(`<li>${inlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    // Unordered list items
    const ulMatch = line.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== "ul") {
        if (inList) htmlParts.push(`</${listType}>`);
        htmlParts.push("<ul>");
        inList = true;
        listType = "ul";
      }
      htmlParts.push(`<li>${inlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^>\s+(.+)$/);
    if (bqMatch) {
      if (inList) {
        htmlParts.push(`</${listType}>`);
        inList = false;
      }
      htmlParts.push(`<blockquote>${inlineMarkdown(bqMatch[1])}</blockquote>`);
      continue;
    }

    // Close list on non-list line
    if (inList && line.trim() === "") {
      htmlParts.push(`</${listType}>`);
      inList = false;
    }

    // Empty line
    if (line.trim() === "") {
      continue;
    }

    // Paragraph
    htmlParts.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  if (inList) htmlParts.push(`</${listType}>`);
  if (inCodeBlock) htmlParts.push("</code></pre>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(pageTitle)}</title>
</head>
<body>
  <main>
    ${htmlParts.join("\n")}
  </main>
</body>
</html>`;
}

/** Process inline Markdown (bold, italic, links, code). @internal */
function inlineMarkdown(text: string): string {
  return text
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Escape remaining HTML
    .replace(/&(?!(amp|lt|gt|quot|#039);)/g, "&amp;")
    .replace(/<(?!(\/?(a|strong|em|code)\b))/g, "&lt;");
}

/**
 * Convert a JSON object to an HTML representation for extraction.
 * Creates structured HTML with headings, definition lists, and tables.
 * @internal
 */
function jsonToHtml(json: unknown, title: string): string {
  const parts: string[] = [];

  const titleStr = typeof json === "object" && json !== null && !Array.isArray(json)
    ? (json as Record<string, unknown>)["title"] as string ?? title
    : title;

  parts.push(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escapeHtml(String(titleStr))}</title></head><body><main>`);

  if (Array.isArray(json)) {
    parts.push("<h1>JSON Array</h1>");
    parts.push(`<p>Array with ${json.length} items</p>`);
    // Render array as table if items are objects
    if (json.length > 0 && typeof json[0] === "object" && json[0] !== null) {
      parts.push(jsonArrayToTable(json as Record<string, unknown>[]));
    } else {
      parts.push(`<ul>${json.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul>`);
    }
  } else if (typeof json === "object" && json !== null) {
    parts.push("<h1>JSON Object</h1>");
    parts.push(jsonObjectToHtml(json as Record<string, unknown>));
  } else {
    parts.push(`<p>${escapeHtml(String(json))}</p>`);
  }

  parts.push("</main></body></html>");
  return parts.join("\n");
}

/** Convert a JSON array of objects to an HTML table. @internal */
function jsonArrayToTable(arr: Record<string, unknown>[]): string {
  if (arr.length === 0) return "";
  const keys = [...new Set(arr.flatMap((item) => Object.keys(item)))];
  const headerCells = keys.map((k) => `<th>${escapeHtml(k)}</th>`).join("");
  const rows = arr.slice(0, 50).map((item) => {
    const cells = keys.map((k) => {
      const val = item[k];
      const str = typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
      return `<td>${escapeHtml(str.substring(0, 200))}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table><thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** Convert a JSON object to structured HTML. @internal */
function jsonObjectToHtml(obj: Record<string, unknown>, depth = 1): string {
  const parts: string[] = [];
  const entries = Object.entries(obj);

  for (const [key, value] of entries) {
    if (value === null || value === undefined) {
      parts.push(`<p><strong>${escapeHtml(key)}:</strong> null</p>`);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      const headingTag = `h${Math.min(depth + 1, 6)}`;
      parts.push(`<${headingTag}>${escapeHtml(key)}</${headingTag}>`);
      parts.push(jsonObjectToHtml(value as Record<string, unknown>, depth + 1));
    } else if (Array.isArray(value)) {
      const headingTag = `h${Math.min(depth + 1, 6)}`;
      parts.push(`<${headingTag}>${escapeHtml(key)}</${headingTag}>`);
      if (value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
        parts.push(jsonArrayToTable(value as Record<string, unknown>[]));
      } else {
        parts.push(`<ul>${value.map((v) => `<li>${escapeHtml(String(v))}</li>`).join("")}</ul>`);
      }
    } else {
      parts.push(`<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(value))}</p>`);
    }
  }

  return parts.join("\n");
}

/**
 * URL Fetcher — Phase 2
 * Fetches rendered and raw HTML from URLs with full error handling.
 * Handles DNS errors, CORS blocks, HTTP errors, oversized HTML, encoding failures.
 *
 * Strategy: The primary fetch path is the ACE Analyzer Cloudflare Worker backend,
 * which fetches server-side with no CORS restrictions and no truncation.
 * If the backend is unavailable, falls back to a multi-proxy CORS proxy chain.
 *
 * IMPORTANT: Backend/proxy usage is the NORMAL path, not contamination.
 * Results carry only the proxy name for tracking — no contamination flags
 * from failed direct fetches are leaked into successful results.
 */

import { detectOversizedHtml, detectEncodingFailure } from "./domParser";
import { hasBackend, getBackendFetchUrl } from "@/lib/backend";

/** Maximum response size (10MB hard limit for client-side processing). */
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

/** Fetch timeout in milliseconds. */
const FETCH_TIMEOUT_MS = 30_000;

/** Standard headers to mimic a browser request. */
const BROWSER_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "ACE-Analyzer/1.2 (AI Comprehension Engine; +https://ace-analyzer.app)",
};

/**
 * CORS proxy definitions (fallback when backend is unavailable).
 * Each proxy wraps the target URL to bypass browser CORS restrictions.
 * Ordered by reliability — first working proxy wins.
 */
interface CorsProxy {
  name: string;
  buildUrl: (targetUrl: string) => string;
  headers?: Record<string, string>;
  /** Whether this proxy returns JSON-wrapped responses that need extraction. */
  jsonWrapped?: boolean;
}

const CORS_PROXIES: CorsProxy[] = [
  {
    name: "cors.sh",
    buildUrl: (url) => `https://proxy.cors.sh/${url}`,
  },
  {
    name: "allorigins-raw",
    buildUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  },
  {
    name: "codetabs",
    buildUrl: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
  },
  {
    name: "corsproxy.io",
    buildUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  },
  {
    name: "thingproxy",
    buildUrl: (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
  },
  {
    name: "allorigins-get",
    buildUrl: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    jsonWrapped: true,
  },
];

/** Result of a fetch operation. */
export interface FetchResult {
  html: string;
  status: number;
  statusText: string;
  url: string;
  finalUrl: string;
  contentType: string;
  contentLength: number;
  fetchError?: string;
  contaminationFlags: string[];
  proxyUsed?: string;
}

/** Backend fetch response body shape. */
interface BackendFetchResponse {
  html: string;
  status: number;
  statusText: string;
  url: string;
  finalUrl: string;
  contentType: string;
  contentLength: number;
  fetchError?: string;
  proxyUsed: string;
}

/**
 * Fetch raw HTML from a URL with full error handling.
 * Strategy:
 *   1. Try the ACE Analyzer backend (server-side fetch, no CORS, no truncation)
 *   2. Fall back to CORS proxies if backend is unavailable
 *   3. Return fetch_failure if all attempts fail
 * @param url The URL to fetch.
 * @returns FetchResult containing HTML and metadata.
 */
export async function fetchRawHtml(url: string): Promise<FetchResult> {
  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      html: "",
      status: 0,
      statusText: "Invalid URL",
      url,
      finalUrl: url,
      contentType: "",
      contentLength: 0,
      fetchError: `Invalid URL: ${url}`,
      contaminationFlags: ["invalid_url"],
    };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return {
      html: "",
      status: 0,
      statusText: "Unsupported protocol",
      url,
      finalUrl: url,
      contentType: "",
      contentLength: 0,
      fetchError: `Unsupported protocol: ${parsedUrl.protocol}`,
      contaminationFlags: ["unsupported_protocol"],
    };
  }

  // Step 1: Try the ACE Analyzer backend (primary path — no CORS, no truncation)
  if (hasBackend()) {
    const backendResult = await attemptBackendFetch(url);
    if (backendResult.html && backendResult.html.trim().length > 0) {
      return backendResult;
    }
    // Backend returned empty/error — fall through to proxy fallback
  }

  // Step 2: Try direct fetch (works for sites with CORS headers)
  const directResult = await attemptDirectFetch(url);
  if (directResult.html && directResult.html.trim().length > 0) {
    return directResult;
  }

  // Step 3: Fall back to CORS proxies
  const proxyResult = await attemptProxyFetch(url);
  if (proxyResult.html && proxyResult.html.trim().length > 0) {
    return proxyResult;
  }

  // Step 4: All attempts failed
  return {
    ...directResult,
    fetchError: proxyResult.fetchError ?? directResult.fetchError,
    contaminationFlags: ["fetch_failure"],
  };
}

/**
 * Attempt to fetch via the ACE Analyzer Cloudflare Worker backend.
 * The backend fetches server-side — no CORS restrictions, no truncation.
 * Returns the full HTML response.
 */
async function attemptBackendFetch(url: string): Promise<FetchResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(getBackendFetchUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return emptyResult(url, `Backend returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as BackendFetchResponse;

    if (!data.html || data.html.trim().length === 0) {
      return emptyResult(url, data.fetchError ?? "Backend returned empty HTML");
    }

    // Detect encoding/oversize issues (contamination, not fetch errors)
    const flags: string[] = [];
    if (detectEncodingFailure(data.html)) {
      flags.push("encoding_failure");
    }
    if (detectOversizedHtml(data.html)) {
      flags.push("oversized_html");
    }

    // Flag oversized but don't truncate — the full HTML is needed for analysis
    let html = data.html;
    let fetchError = data.fetchError;
    if (html.length > MAX_RESPONSE_SIZE) {
      // Only truncate if truly enormous (could crash the browser)
      html = html.substring(0, MAX_RESPONSE_SIZE);
      fetchError = `Oversized HTML: ${data.contentLength} bytes exceeds ${MAX_RESPONSE_SIZE} byte limit. Content truncated.`;
      if (!flags.includes("oversized_html")) flags.push("oversized_html");
    }

    return {
      html,
      status: data.status,
      statusText: data.statusText,
      url,
      finalUrl: data.finalUrl || url,
      contentType: data.contentType,
      contentLength: data.contentLength,
      fetchError,
      contaminationFlags: flags,
      proxyUsed: "ace-backend",
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return emptyResult(url, `Backend fetch error: ${errorMsg}`);
  }
}

/**
 * Attempt a direct fetch of the URL.
 * Uses cors mode — will succeed if the target server sends CORS headers.
 * CORS blocks are expected and NOT treated as contamination (proxy will handle).
 */
async function attemptDirectFetch(url: string): Promise<FetchResult> {
  const contaminationFlags: string[] = [];
  let fetchError: string | undefined;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: "follow",
      mode: "cors",
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const errorMsg = err instanceof Error ? err.message : String(err);

    // CORS blocks are expected for most sites — NOT contamination.
    if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
      fetchError = `Direct fetch blocked (likely CORS). Will try proxy fallback.`;
    } else if (errorMsg.includes("aborted") || errorMsg.includes("AbortError")) {
      contaminationFlags.push("timeout");
      fetchError = `Request timed out after ${FETCH_TIMEOUT_MS}ms`;
    } else {
      fetchError = `Direct fetch error: ${errorMsg}`;
    }

    return emptyResult(url, fetchError, contaminationFlags);
  }

  clearTimeout(timeoutId);

  return processResponse(response, url, contaminationFlags);
}

/**
 * Attempt to fetch via CORS proxies, trying each in order.
 * Proxy results carry only informational proxy tracking — no contamination flags
 * from the direct fetch are leaked into proxy results.
 */
async function attemptProxyFetch(url: string): Promise<FetchResult> {
  for (const proxy of CORS_PROXIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(proxy.buildUrl(url), {
        signal: controller.signal,
        headers: proxy.headers ?? { Accept: "text/html,application/xhtml+xml,*/*" },
        redirect: "follow",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        continue;
      }

      let html: string;
      try {
        html = await response.text();
      } catch {
        continue;
      }

      if (!html || html.trim().length === 0) {
        continue;
      }

      // Strip BOM if present
      if (html.charCodeAt(0) === 0xfeff) {
        html = html.substring(1);
      }

      // Handle JSON-wrapped proxy responses (e.g., allorigins /get endpoint)
      if (proxy.jsonWrapped) {
        try {
          const parsed = JSON.parse(html);
          if (parsed && typeof parsed.contents === "string") {
            html = parsed.contents;
          }
        } catch {
          // Not JSON — use as-is
        }
      }

      if (!html || html.trim().length === 0) {
        continue;
      }

      // Validate it looks like HTML (proxies sometimes return JSON errors)
      const trimmed = html.trimStart();
      if (!trimmed.startsWith("<") && !trimmed.startsWith("<!")) {
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          continue;
        }
        if (!trimmed.substring(0, 500).toLowerCase().includes("<html")) {
          continue;
        }
      }

      const contentType = response.headers.get("content-type") ?? "text/html";
      const contentLength = html.length;

      // Check for oversized HTML
      if (contentLength > MAX_RESPONSE_SIZE) {
        return {
          html: html.substring(0, MAX_RESPONSE_SIZE),
          status: response.status,
          statusText: response.statusText,
          url,
          finalUrl: url,
          contentType,
          contentLength,
          contaminationFlags: ["oversized_html"],
          fetchError: `Oversized HTML: ${contentLength} bytes exceeds ${MAX_RESPONSE_SIZE} byte limit. Content truncated.`,
          proxyUsed: proxy.name,
        };
      }

      // Detect encoding/oversize issues
      const flags: string[] = [];
      if (detectEncodingFailure(html)) {
        flags.push("encoding_failure");
      }
      if (detectOversizedHtml(html)) {
        flags.push("oversized_html");
      }

      return {
        html,
        status: response.status,
        statusText: response.statusText,
        url,
        finalUrl: url,
        contentType,
        contentLength,
        contaminationFlags: flags,
        proxyUsed: proxy.name,
      };
    } catch {
      continue;
    }
  }

  return emptyResult(
    url,
    `Direct fetch and all ${CORS_PROXIES.length} CORS proxy fallbacks failed.`,
    ["fetch_failure"],
  );
}

/**
 * Process a fetch response, handling HTTP errors, content type, and body reading.
 */
async function processResponse(
  response: Response,
  url: string,
  contaminationFlags: string[],
): Promise<FetchResult> {
  const status = response.status;
  const statusText = response.statusText;
  const finalUrl = response.url || url;
  const contentType = response.headers.get("content-type") ?? "";

  // Handle HTTP error status codes
  if (status === 403 || status === 451) {
    return {
      html: "",
      status,
      statusText,
      url,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: `HTTP ${status}: Access forbidden. The server blocked the request.`,
      contaminationFlags: [...contaminationFlags, "http_403", "access_denied"],
    };
  }

  if (status === 503 || status === 520 || status === 521 || status === 522 || status === 523) {
    return {
      html: "",
      status,
      statusText,
      url,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: `HTTP ${status}: Server unavailable.`,
      contaminationFlags: [...contaminationFlags, "http_503", "server_unavailable"],
    };
  }

  if (status === 429) {
    return {
      html: "",
      status,
      statusText,
      url,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: `HTTP 429: Rate limited.`,
      contaminationFlags: [...contaminationFlags, "http_429", "rate_limited"],
    };
  }

  if (status >= 400) {
    return {
      html: "",
      status,
      statusText,
      url,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: `HTTP ${status}: ${statusText}`,
      contaminationFlags: [...contaminationFlags, `http_${status}`],
    };
  }

  // Check content type — but be lenient (some sites send text/plain for HTML)
  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml") && !contentType.includes("text/plain")) {
    return {
      html: "",
      status,
      statusText,
      url,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: `Non-HTML content type: ${contentType}`,
      contaminationFlags: [...contaminationFlags, "non_html_content"],
    };
  }

  // Read response text
  let html: string;
  try {
    html = await response.text();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      html: "",
      status,
      statusText,
      url,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: `Failed to read response body: ${errorMsg}`,
      contaminationFlags: [...contaminationFlags, "read_failure"],
    };
  }

  // Strip BOM if present
  if (html.charCodeAt(0) === 0xfeff) {
    html = html.substring(1);
  }

  const contentLength = html.length;

  if (!html || html.trim().length === 0) {
    return {
      html: "",
      status,
      statusText,
      url,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: "Empty response body",
      contaminationFlags: [...contaminationFlags, "empty_response"],
    };
  }

  // Check for oversized HTML
  if (contentLength > MAX_RESPONSE_SIZE) {
    return {
      html: html.substring(0, MAX_RESPONSE_SIZE),
      status,
      statusText,
      url,
      finalUrl,
      contentType,
      contentLength,
      fetchError: `Oversized HTML: ${contentLength} bytes exceeds ${MAX_RESPONSE_SIZE} byte limit. Content truncated.`,
      contaminationFlags: [...contaminationFlags, "oversized_html"],
    };
  }

  if (detectEncodingFailure(html)) {
    contaminationFlags.push("encoding_failure");
  }

  if (detectOversizedHtml(html)) {
    contaminationFlags.push("oversized_html");
  }

  return {
    html,
    status,
    statusText,
    url,
    finalUrl,
    contentType,
    contentLength,
    contaminationFlags,
  };
}

/** Create an empty fetch result for error cases. */
function emptyResult(url: string, fetchError: string, flags: string[] = []): FetchResult {
  return {
    html: "",
    status: 0,
    statusText: "Fetch Error",
    url,
    finalUrl: url,
    contentType: "",
    contentLength: 0,
    fetchError,
    contaminationFlags: flags,
  };
}

/**
 * Fetch rendered HTML from a URL.
 * The backend fetches server-side — no CORS restrictions, no truncation.
 * @param url The URL to fetch.
 * @returns FetchResult containing rendered HTML and metadata.
 */
export async function fetchRenderedHtml(url: string): Promise<FetchResult> {
  return fetchRawHtml(url);
}

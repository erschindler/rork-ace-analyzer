// functions/index.ts — ACE Analyzer backend
//
// Server-side HTML fetcher that bypasses browser CORS restrictions.
// The Worker fetches the target URL server-side and returns the full,
// untruncated HTML to the client. This is the primary fetch path for
// the ACE Analyzer — CORS proxies are only used as fallback.

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB

const BROWSER_HEADERS: Record<string, string> = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (compatible; ACE-Analyzer/1.2; +https://ace-analyzer.app)",
};

interface FetchResponseBody {
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

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    if (url.pathname === "/ping") {
      return Response.json({ ok: true, now: new Date().toISOString() });
    }

    if (url.pathname === "/fetch") {
      return handleFetch(request, url);
    }

    return Response.json(
      { error: "Not found", path: url.pathname },
      { status: 404, headers: corsHeaders() },
    );
  },
};

async function handleFetch(request: Request, url: URL): Promise<Response> {
  // Accept both GET (query param) and POST (body) for the target URL
  let targetUrl: string | undefined;

  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { url?: string };
      targetUrl = body.url;
    } catch {
      return jsonError(400, "Invalid JSON body — expected { url: string }");
    }
  } else {
    targetUrl = url.searchParams.get("url") ?? undefined;
  }

  if (!targetUrl) {
    return jsonError(400, "Missing 'url' parameter");
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return jsonError(400, `Invalid URL: ${targetUrl}`);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return jsonError(400, `Unsupported protocol: ${parsedUrl.protocol}`);
  }

  // Fetch server-side — no CORS restrictions
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: "GET",
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const errorMsg = err instanceof Error ? err.message : String(err);
    const body: FetchResponseBody = {
      html: "",
      status: 0,
      statusText: "Fetch Error",
      url: targetUrl,
      finalUrl: targetUrl,
      contentType: "",
      contentLength: 0,
      fetchError: `Server-side fetch error: ${errorMsg}`,
      proxyUsed: "ace-backend",
    };
    return Response.json(body, { headers: corsHeaders() });
  }

  clearTimeout(timeoutId);

  const status = response.status;
  const statusText = response.statusText;
  const finalUrl = response.url || targetUrl;
  const contentType = response.headers.get("content-type") ?? "text/html";

  // Handle HTTP error status codes
  if (status === 403 || status === 451) {
    return jsonResponse({
      html: "",
      status,
      statusText,
      url: targetUrl,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: `HTTP ${status}: Access forbidden`,
      proxyUsed: "ace-backend",
    });
  }

  if (status === 429) {
    return jsonResponse({
      html: "",
      status,
      statusText,
      url: targetUrl,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: `HTTP 429: Rate limited`,
      proxyUsed: "ace-backend",
    });
  }

  if (status >= 400) {
    return jsonResponse({
      html: "",
      status,
      statusText,
      url: targetUrl,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: `HTTP ${status}: ${statusText}`,
      proxyUsed: "ace-backend",
    });
  }

  // Read response text — no truncation, get the full HTML
  let html: string;
  try {
    html = await response.text();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return jsonResponse({
      html: "",
      status,
      statusText,
      url: targetUrl,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: `Failed to read response body: ${errorMsg}`,
      proxyUsed: "ace-backend",
    });
  }

  // Strip BOM if present
  if (html.charCodeAt(0) === 0xfeff) {
    html = html.substring(1);
  }

  const contentLength = html.length;

  if (!html || html.trim().length === 0) {
    return jsonResponse({
      html: "",
      status,
      statusText,
      url: targetUrl,
      finalUrl,
      contentType,
      contentLength: 0,
      fetchError: "Empty response body",
      proxyUsed: "ace-backend",
    });
  }

  // Flag oversized but don't truncate — the client can handle it
  let fetchError: string | undefined;
  if (contentLength > MAX_RESPONSE_SIZE) {
    fetchError = `Oversized HTML: ${contentLength} bytes exceeds ${MAX_RESPONSE_SIZE} byte limit.`;
  }

  return jsonResponse({
    html,
    status,
    statusText,
    url: targetUrl,
    finalUrl,
    contentType,
    contentLength,
    fetchError,
    proxyUsed: "ace-backend",
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonError(status: number, message: string): Response {
  return Response.json(
    { error: message },
    { status, headers: corsHeaders() },
  );
}

function jsonResponse(body: FetchResponseBody): Response {
  return Response.json(body, {
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
    },
  });
}

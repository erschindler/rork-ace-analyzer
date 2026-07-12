/**
 * Backend URL helper for ACE Analyzer.
 * The Cloudflare Worker backend handles server-side HTML fetching,
 * bypassing browser CORS restrictions entirely.
 */

/** The deployed Cloudflare Worker backend URL. */
export const BACKEND_URL =
  import.meta.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL ??
  "https://ace-analyzer-backend.rork.app";

/**
 * Build the backend fetch URL for a given target URL.
 * Uses POST with JSON body to avoid URL length limits for long URLs.
 * @param targetUrl The URL to fetch through the backend.
 * @returns The backend endpoint URL.
 */
export function getBackendFetchUrl(): string {
  return `${BACKEND_URL}/fetch`;
}

/**
 * Check if the backend is available (URL is configured).
 */
export function hasBackend(): boolean {
  return BACKEND_URL.length > 0;
}

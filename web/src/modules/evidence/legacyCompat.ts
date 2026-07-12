/**
 * Legacy Compatibility — maintains Phase 1 function signature.
 * Converts File input to text, then delegates to the appropriate handler.
 */

import type { AceEvidenceResult } from "@/types";
import { extractEvidenceFromHtml, extractEvidenceFromText } from "./inputHandlers";

/**
 * Extract evidence from an uploaded file.
 * Delegates to HTML or text handler based on file type.
 * @param file File object (HTML, text, etc.).
 * @returns Promise resolving to an AceEvidenceResult.
 */
export async function extractEvidenceFromFile(file: File): Promise<AceEvidenceResult> {
  const text = await file.text();
  const url = `file://${file.name}`;

  const isHtml = file.name.endsWith(".html") || file.name.endsWith(".htm") || text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html");

  if (isHtml) {
    return extractEvidenceFromHtml(text, url);
  }

  return extractEvidenceFromText(text, url);
}

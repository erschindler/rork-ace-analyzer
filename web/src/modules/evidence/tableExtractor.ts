/**
 * Table Extractor — Phase 2
 * Extracts table (<table>) elements with headers and row data.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/**
 * Extract table evidence from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing table signals.
 */
export function extractTables(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  let totalRows = 0;
  let tablesWithHeaders = 0;

  const tables = doc.querySelectorAll("table");
  tables.forEach((table) => {
    const selector = generateSelector(table);

    // Extract headers
    const headerCells = table.querySelectorAll("thead th, thead td, tr:first-child th");
    const headers: string[] = [];
    headerCells.forEach((cell) => {
      const text = cell.textContent?.trim() ?? "";
      if (text) headers.push(truncateText(text, 100));
    });

    if (headers.length > 0) tablesWithHeaders++;

    // Extract rows
    const bodyRows = table.querySelectorAll("tbody tr, tr");
    const rowCount = bodyRows.length;
    totalRows += rowCount;

    // Sample first 5 rows
    const sampleRows: string[][] = [];
    const rowsToSample = Array.from(bodyRows).slice(0, 5);
    rowsToSample.forEach((row) => {
      const cells = row.querySelectorAll("td, th");
      const rowData: string[] = [];
      cells.forEach((cell) => {
        rowData.push(truncateText(cell.textContent?.trim() ?? "", 100));
      });
      if (rowData.length > 0) sampleRows.push(rowData);
    });

    signals.push({
      type: "table",
      value: truncateText(headers.join(" | "), 300),
      confidence: headers.length > 0 ? 0.9 : 0.7,
      selector,
      metadata: {
        rowCount,
        columnCount: headers.length || sampleRows[0]?.length || 0,
        hasHeaders: headers.length > 0,
        headers: headers.slice(0, 20),
        sampleRows,
        hasCaption: table.querySelector("caption") !== null,
      },
    });
  });

  const section: EvidenceSection = {
    category: "tables",
    label: "Table Data",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      totalTables: signals.length,
      totalRows,
      tablesWithHeaders,
    },
  };

  return [section];
}

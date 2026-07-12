/**
 * Semantic Table Extractor — Phase 2
 * Analyzes table semantics: key/value, comparison, pricing, specifications.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Patterns for classifying table content. */
const PRICING_PATTERNS = ["price", "cost", "$", "€", "£", "plan", "monthly", "annual", "free", "premium", "starter", "pro"];
const COMPARISON_PATTERNS = ["compare", "vs", "versus", "difference", "feature", "plan"];
const SPEC_PATTERNS = ["spec", "specification", "dimension", "weight", "size", "color", "material", "model"];

/**
 * Extract semantic meaning of tables from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing semantic table signals.
 */
export function extractSemanticTables(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const tables = doc.querySelectorAll("table");
  let pricingCount = 0;
  let comparisonCount = 0;
  let specCount = 0;
  let keyValueCount = 0;

  tables.forEach((table) => {
    // Extract headers
    const headerCells = table.querySelectorAll("thead th, thead td, tr:first-child th");
    const headers: string[] = [];
    headerCells.forEach((cell) => {
      const text = cell.textContent?.trim() ?? "";
      if (text) headers.push(text);
    });

    // Extract rows for analysis
    const rows = table.querySelectorAll("tbody tr, tr");
    const rowCount = rows.length;
    const colCount = headers.length || rows[0]?.querySelectorAll("td, th").length || 0;

    // Get full table text for classification
    const fullText = table.textContent?.toLowerCase() ?? "";
    const headerText = headers.join(" ").toLowerCase();

    // Classify table type
    let tableType = "general";
    let confidence = 0.65;

    if (PRICING_PATTERNS.some((p) => headerText.includes(p) || fullText.includes(p))) {
      tableType = "pricing";
      pricingCount++;
      confidence = 0.85;
    } else if (COMPARISON_PATTERNS.some((p) => headerText.includes(p)) && colCount > 2) {
      tableType = "comparison";
      comparisonCount++;
      confidence = 0.85;
    } else if (SPEC_PATTERNS.some((p) => headerText.includes(p) || fullText.includes(p))) {
      tableType = "specifications";
      specCount++;
      confidence = 0.8;
    } else if (colCount === 2 && rowCount > 3) {
      // Key-value pair detection
      tableType = "key_value";
      keyValueCount++;
      confidence = 0.75;
    }

    // Sample rows
    const sampleRows: string[][] = [];
    Array.from(rows).slice(0, 5).forEach((row) => {
      const cells = row.querySelectorAll("td, th");
      const rowData: string[] = [];
      cells.forEach((cell) => rowData.push(truncateText(cell.textContent?.trim() ?? "", 80)));
      if (rowData.length > 0) sampleRows.push(rowData);
    });

    signals.push({
      type: "semantic_table",
      value: truncateText(`[${tableType}] ${headers.join(" | ")}`, 300),
      confidence,
      selector: generateSelector(table),
      metadata: {
        tableType,
        rowCount,
        colCount,
        hasHeaders: headers.length > 0,
        headers: headers.slice(0, 15),
        sampleRows,
        hasCaption: table.querySelector("caption") !== null,
      },
    });
  });

  const section: EvidenceSection = {
    category: "semantic_tables",
    label: "Semantic Table Analysis",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      totalTables: signals.length,
      pricingTables: pricingCount,
      comparisonTables: comparisonCount,
      specTables: specCount,
      keyValueTables: keyValueCount,
      hasStructuredTables: pricingCount + comparisonCount + specCount + keyValueCount > 0,
    },
  };

  return [section];
}

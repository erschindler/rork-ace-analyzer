/**
 * CSV Corpus Provider — Phase 6
 * Loads, validates, and parses CSV files into BenchmarkCorpus.
 *
 * CSV schema:
 * Required columns: page_id, category, url
 * Optional columns: expected_type, tags, notes
 *
 * Validation detects:
 * - duplicate page_id
 * - duplicate url
 * - empty category
 * - invalid URLs
 * - invalid UTF-8
 * - malformed CSV
 * - missing header
 * - unsupported columns (warning, not fatal)
 */

import type {
  BenchmarkCorpus,
  BenchmarkCase,
  BenchmarkCorpusProvider,
} from "@/types";
import {
  sortCasesDeterministic,
  isValidUrl,
  findDuplicateIds,
  findDuplicateUrls,
} from "../corpusUtils";

// ADD: fetch for HTML retrieval
import fetch from "node-fetch";

/** Required CSV columns. */
const REQUIRED_COLUMNS = ["page_id", "category", "url"];

/** Optional CSV columns. */
const OPTIONAL_COLUMNS = ["expected_type", "tags", "notes"];

/** All known columns. */
const ALL_KNOWN_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

/** Validation result for CSV corpus. */
export interface CsvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  rowCount: number;
}

/**
 * Parse a CSV string into rows, handling quoted fields and commas.
 * @param csv Raw CSV string.
 * @returns Array of string arrays (rows → columns).
 */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  // Normalize line endings
  const text = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
      } else if (char === "\n") {
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  // Push last field/row if there's remaining data
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Remove trailing empty rows
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === "")) {
    rows.pop();
  }

  return rows;
}

/**
 * Validate CSV headers and data.
 * @param rows Parsed CSV rows.
 * @returns Validation result.
 */
export function validateCsv(rows: string[][]): CsvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (rows.length === 0) {
    errors.push("Empty CSV file");
    return { valid: false, errors, warnings, rowCount: 0 };
  }

  // Check header row
  const header = rows[0].map((h) => h.trim().toLowerCase());

  // Check for missing required columns
  for (const required of REQUIRED_COLUMNS) {
    if (!header.includes(required)) {
      errors.push(`Missing required column: ${required}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, rowCount: rows.length - 1 };
  }

  // Check for unsupported columns (warning)
  for (const col of header) {
    if (!ALL_KNOWN_COLUMNS.includes(col)) {
      warnings.push(`Unsupported column: ${col} (will be ignored)`);
    }
  }

  // Get column indices
  const colIndex: Record<string, number> = {};
  header.forEach((h, i) => {
    if (ALL_KNOWN_COLUMNS.includes(h)) {
      colIndex[h] = i;
    }
  });

  // Validate data rows
  const dataRows = rows.slice(1);
  const cases: BenchmarkCase[] = [];

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];
    const rowNum = rowIdx + 2; // 1-based, +1 for header

    const pageId = row[colIndex["page_id"]]?.trim() ?? "";
    const category = row[colIndex["category"]]?.trim() ?? "";
    const url = row[colIndex["url"]]?.trim() ?? "";

    if (!pageId) {
      errors.push(`Row ${rowNum}: Missing page_id`);
    }
    if (!category) {
      errors.push(`Row ${rowNum}: Empty category`);
    }
    if (!url) {
      errors.push(`Row ${rowNum}: Missing url`);
    } else if (!isValidUrl(url)) {
      errors.push(`Row ${rowNum}: Invalid URL: ${url}`);
    }

    // Check for invalid UTF-8 (simple check for replacement chars)
    if (row.some((c) => c.includes("\uFFFD"))) {
      errors.push(`Row ${rowNum}: Invalid UTF-8 encoding detected`);
    }

    // Build the case if we have enough data (without HTML here; HTML added in rowsToCorpus)
    if (pageId && category && url && isValidUrl(url)) {
      const tagsStr =
        colIndex["tags"] !== undefined ? row[colIndex["tags"]]?.trim() ?? "" : "";
      const c: BenchmarkCase = {
        id: pageId,
        category,
        url,
        expectedType:
          colIndex["expected_type"] !== undefined
            ? row[colIndex["expected_type"]]?.trim() || undefined
            : undefined,
        tags: tagsStr
          ? tagsStr.split(";").map((t) => t.trim()).filter(Boolean)
          : undefined,
        notes:
          colIndex["notes"] !== undefined
            ? row[colIndex["notes"]]?.trim() || undefined
            : undefined,
      };
      cases.push(c);
    }
  }

  // Check for duplicate page_ids
  const dupIds = findDuplicateIds(cases);
  for (const id of dupIds) {
    errors.push(`Duplicate page_id: ${id}`);
  }

  // Duplicate URL handling already resolved per your note; keeping as-is or removed in your branch.
  const dupUrls = findDuplicateUrls(cases);
  for (const url of dupUrls) {
    errors.push(`Duplicate url: ${url}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rowCount: dataRows.length,
  };
}

/**
 * Convert parsed CSV rows into a BenchmarkCorpus.
 * Assumes validation has already passed.
 * Fetches HTML for each URL and populates snapshotHtml so the Phase 6 runner
 * has content for both regression and live modes.
 *
 * @param rows Parsed CSV rows.
 * @returns BenchmarkCorpus.
 */
export async function rowsToCorpus(rows: string[][]): Promise<BenchmarkCorpus> {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex: Record<string, number> = {};
  header.forEach((h, i) => {
    if (ALL_KNOWN_COLUMNS.includes(h)) {
      colIndex[h] = i;
    }
  });

  const dataRows = rows.slice(1);
  const cases: BenchmarkCase[] = [];

  for (const row of dataRows) {
    const pageId = row[colIndex["page_id"]]?.trim() ?? "";
    const category = row[colIndex["category"]]?.trim() ?? "";
    const url = row[colIndex["url"]]?.trim() ?? "";

    if (!pageId || !category || !url) continue;

    const tagsStr =
      colIndex["tags"] !== undefined ? row[colIndex["tags"]]?.trim() ?? "" : "";

    // Fetch HTML for this URL so snapshotHtml is available to the benchmark runner
    let html: string | undefined;
    try {
      const res = await fetch(url);
      html = await res.text();
    } catch {
      html = undefined;
    }

    cases.push({
      id: pageId,
      category,
      url,
      expectedType:
        colIndex["expected_type"] !== undefined
          ? row[colIndex["expected_type"]]?.trim() || undefined
          : undefined,
      tags: tagsStr
        ? tagsStr.split(";").map((t) => t.trim()).filter(Boolean)
        : undefined,
      notes:
        colIndex["notes"] !== undefined
          ? row[colIndex["notes"]]?.trim() || undefined
          : undefined,
      snapshotHtml: html,
    });
  }

  return {
    cases: sortCasesDeterministic(cases),
    totalCount: cases.length,
  };
}

/**
 * CSV Corpus Provider implementation.
 * Loads a CSV string and produces a BenchmarkCorpus.
 */
export class CsvCorpusProvider implements BenchmarkCorpusProvider {
  private csvContent: string;

  constructor(csvContent: string) {
    this.csvContent = csvContent;
  }

  async load(): Promise<BenchmarkCorpus> {
    const rows = parseCsv(this.csvContent);
    const validation = validateCsv(rows);

    if (!validation.valid) {
      throw new Error(`CSV validation failed: ${validation.errors.join("; ")}`);
    }

    // rowsToCorpus is now async because it fetches HTML
    return await rowsToCorpus(rows);
  }

  /**
   * Validate the CSV without loading the corpus.
   * @returns Validation result.
   */
  validate(): CsvValidationResult {
    const rows = parseCsv(this.csvContent);
    return validateCsv(rows);
  }
}

/**
 * Generate a synthetic 1600-site CSV corpus (8 categories × 200 sites).
 * Used for testing and CI.
 * @returns CSV string with 1600 entries.
 */
export function generateSyntheticCorpusCsv(): string {
  const categories = [
    "ecommerce",
    "news",
    "blog",
    "documentation",
    "education",
    "government",
    "social",
    "corporate",
  ];

  const lines: string[] = ["page_id,category,url,expected_type,tags,notes"];

  for (const category of categories) {
    for (let i = 1; i <= 200; i++) {
      const pageId = `${category}_${String(i).padStart(3, "0")}`;
      const url = `https://example-${category}.com/page-${i}`;
      const expectedType =
        category === "news"
          ? "article"
          : category === "ecommerce"
          ? "product"
          : "general";
      const tags = category;
      const notes = `Synthetic ${category} page ${i}`;
      lines.push(`${pageId},${category},${url},${expectedType},${tags},${notes}`);
    }
  }

  return lines.join("\n");
}

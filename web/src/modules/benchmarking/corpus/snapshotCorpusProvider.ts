/**
 * Snapshot Corpus Provider — Phase 6
 * Loads stored HTML snapshots and maps them to BenchmarkCase entries.
 * Supports Regression Mode only — each case has snapshotHtml populated.
 */

import type {
  BenchmarkCorpus,
  BenchmarkCase,
  BenchmarkCorpusProvider,
} from "@/types";
import { sortCasesDeterministic } from "../corpusUtils";

/** A snapshot entry with HTML content and metadata. */
export interface SnapshotEntry {
  id: string;
  category: string;
  html: string;
  url?: string;
  expectedType?: string;
  tags?: string[];
  notes?: string;
}

/**
 * Snapshot Corpus Provider implementation.
 * Loads HTML snapshots from an in-memory array.
 */
export class SnapshotCorpusProvider implements BenchmarkCorpusProvider {
  private snapshots: SnapshotEntry[];

  constructor(snapshots: SnapshotEntry[]) {
    this.snapshots = snapshots;
  }

  async load(): Promise<BenchmarkCorpus> {
    const cases: BenchmarkCase[] = this.snapshots.map((s) => ({
      id: s.id,
      category: s.category,
      url: s.url,
      snapshotHtml: s.html,
      expectedType: s.expectedType,
      tags: s.tags,
      notes: s.notes,
    }));

    return {
      cases: sortCasesDeterministic(cases),
      totalCount: cases.length,
    };
  }
}

/**
 * Create a simple snapshot corpus from a map of id → html.
 * @param entries Map of id → { html, category, url? }.
 * @returns SnapshotCorpusProvider.
 */
export function createSnapshotProvider(
  entries: Array<{ id: string; category: string; html: string; url?: string }>,
): SnapshotCorpusProvider {
  return new SnapshotCorpusProvider(
    entries.map((e) => ({
      id: e.id,
      category: e.category,
      html: e.html,
      url: e.url,
    })),
  );
}

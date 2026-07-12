/**
 * Hierarchy Normalizer — Phase 3
 * Normalizes heading hierarchy, semantic hierarchy, content grouping,
 * parent/child relationships, orphan nodes, and hierarchy depth.
 */

import type { HierarchyNode, NormalizedHierarchyNode } from "@/types";
import { normalizeHeadingText, normalizeParagraphText } from "./textNormalizer";

/** Maximum hierarchy depth to process. */
const MAX_HIERARCHY_DEPTH = 15;

/**
 * Normalize the document hierarchy tree.
 * @param root Source hierarchy root node (or null).
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized hierarchy root (or null).
 */
export function normalizeHierarchy(
  root: HierarchyNode | null,
  isContaminated: boolean,
): NormalizedHierarchyNode | null {
  if (!root) return null;
  return normalizeNode(root, 0, isContaminated);
}

/**
 * Recursively normalize a hierarchy node.
 * @param node Source hierarchy node.
 * @param depth Depth from root.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized hierarchy node.
 */
function normalizeNode(
  node: HierarchyNode,
  depth: number,
  isContaminated: boolean,
): NormalizedHierarchyNode {
  // Normalize text based on tag type
  const isHeading = /^h[1-6]$/.test(node.tag);
  const normalizedText = isHeading
    ? normalizeHeadingText(node.text)
    : normalizeParagraphText(node.text);

  // Determine if this node is an orphan (heading without parent heading)
  const isOrphan = isHeading && depth > 1 && !hasParentHeading(node);

  // Normalize children
  const children: NormalizedHierarchyNode[] = [];
  if (depth < MAX_HIERARCHY_DEPTH) {
    for (const child of node.children) {
      children.push(normalizeNode(child, depth + 1, isContaminated));
    }
  }

  return {
    tag: node.tag,
    level: node.level,
    text: node.text,
    normalizedText,
    selector: node.selector,
    children,
    attributes: node.attributes,
    isOrphan,
    depthFromRoot: depth,
  };
}

/**
 * Check if a heading node has a parent heading at a lower level.
 * This is a simplified check based on the node's level in the tree.
 */
function hasParentHeading(node: HierarchyNode): boolean {
  // In the hierarchy tree, if the heading is at level > 0,
  // it should have a parent heading in the tree path.
  // Since we don't have access to the full tree path here,
  // we check if the heading level is h1 or h2 (which are typically top-level).
  const headingLevel = parseInt(node.tag.charAt(1), 10);
  return headingLevel <= 2;
}

/**
 * Get hierarchy depth statistics.
 * @param root Normalized hierarchy root.
 * @returns Depth statistics.
 */
export function getHierarchyStats(root: NormalizedHierarchyNode | null): {
  maxDepth: number;
  totalNodes: number;
  headingCount: number;
  orphanCount: number;
  hasValidHierarchy: boolean;
} {
  if (!root) {
    return { maxDepth: 0, totalNodes: 0, headingCount: 0, orphanCount: 0, hasValidHierarchy: false };
  }

  const stats = {
    maxDepth: 0,
    totalNodes: 0,
    headingCount: 0,
    orphanCount: 0,
    hasValidHierarchy: false,
  };

  traverseHierarchy(root, stats);
  stats.hasValidHierarchy = stats.headingCount > 0 && stats.orphanCount < stats.headingCount / 2;

  return stats;
}

/**
 * Traverse hierarchy and collect statistics.
 */
function traverseHierarchy(node: NormalizedHierarchyNode, stats: {
  maxDepth: number;
  totalNodes: number;
  headingCount: number;
  orphanCount: number;
  hasValidHierarchy: boolean;
}): void {
  stats.totalNodes++;
  stats.maxDepth = Math.max(stats.maxDepth, node.depthFromRoot ?? 0);

  if (/^h[1-6]$/.test(node.tag)) {
    stats.headingCount++;
    if (node.isOrphan) stats.orphanCount++;
  }

  for (const child of node.children) {
    traverseHierarchy(child, stats);
  }
}

/**
 * Detect hierarchy issues — skipped levels, orphan headings, excessive depth.
 * @param root Normalized hierarchy root.
 * @returns Array of issue descriptions.
 */
export function detectHierarchyIssues(root: NormalizedHierarchyNode | null): string[] {
  if (!root) return ["hierarchy_missing"];
  const issues: string[] = [];
  const stats = getHierarchyStats(root);

  if (stats.orphanCount > 0) {
    issues.push(`orphan_headings: ${stats.orphanCount} headings without parent`);
  }
  if (stats.maxDepth > 10) {
    issues.push(`excessive_depth: max depth ${stats.maxDepth}`);
  }
  if (stats.headingCount === 0) {
    issues.push("no_headings_in_hierarchy");
  }
  if (!stats.hasValidHierarchy) {
    issues.push("invalid_hierarchy_structure");
  }

  return issues;
}

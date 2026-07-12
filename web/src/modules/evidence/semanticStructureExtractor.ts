/**
 * Semantic Structure Extractor — Phase 2
 * Builds semantic relationships: section → subsection → content block.
 * Analyzes contextual grouping and structural hierarchy.
 *
 * ACE v1.2 fix: Now detects div-based sectioning patterns used by modern
 * site builders (Elementor, WordPress blocks, React components). Previously
 * only looked for native HTML5 section/article elements, which caused
 * SemanticStructure to report headingCount=0 on sites that use div-based
 * layouts with headings inside them.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Maximum depth to traverse. */
const MAX_DEPTH = 6;

/** Classes that indicate a div is acting as a semantic section. */
const SECTIONING_CLASS_PATTERNS = [
  "elementor-section",
  "elementor-widget",
  "elementor-column",
  "elementor-container",
  "wp-block",
  "section",
  "content-area",
  "content-block",
  "post-content",
  "entry-content",
  "page-content",
  "hero",
  "hero-section",
  "banner",
  "feature",
  "card",
  "tile",
  "module",
  "panel",
  "block-content",
  "content-section",
  "main-content",
  "primary-content",
  "post-block",
  "article-body",
  "story-body",
];

/**
 * Extract semantic structure relationships from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing semantic structure signals.
 */
export function extractSemanticStructure(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];

  // Find top-level structural containers — both HTML5 semantic elements
  // AND div elements with sectioning class patterns
  const containers = findStructuralContainers(doc);
  let relationshipCount = 0;

  containers.forEach((container) => {
    const tag = container.tagName.toLowerCase();
    const parent = container.parentElement;
    const parentTag = parent?.tagName.toLowerCase() ?? "unknown";
    const childSections = findChildSections(container);
    const text = container.textContent?.trim() ?? "";
    const heading = container.querySelector("h1, h2, h3, h4, h5, h6");
    const headingText = heading?.textContent?.trim() ?? "";

    signals.push({
      type: "semantic_relationship",
      value: truncateText(`${parentTag} → ${tag}: ${headingText || text}`, 300),
      confidence: 0.85,
      selector: generateSelector(container),
      metadata: {
        tag,
        parentTag,
        childCount: childSections.length,
        hasHeading: heading !== null,
        headingText: headingText || undefined,
        nestingDepth: getNestingDepth(container),
        isDivSection: tag === "div",
      },
    });
    relationshipCount++;
  });

  // Detect content groupings (div with role or class hints)
  const groupedContent = doc.querySelectorAll("[role='group'], fieldset, details");
  groupedContent.forEach((group) => {
    const label = group.querySelector("legend, summary, [aria-label]")?.textContent?.trim() ?? "";
    signals.push({
      type: "content_group",
      value: truncateText(label || group.tagName.toLowerCase(), 200),
      confidence: 0.75,
      selector: generateSelector(group),
      metadata: {
        tag: group.tagName.toLowerCase(),
        label,
        role: group.getAttribute("role") ?? undefined,
      },
    });
  });

  // Build section hierarchy map — include both semantic and div-based sections
  const topLevelSections = findTopLevelSections(doc);
  const hierarchyMap: string[] = [];
  topLevelSections.forEach((section) => {
    const heading = section.querySelector("h2, h3")?.textContent?.trim() ?? section.tagName.toLowerCase();
    const subSections = findChildSections(section);
    const sectionClass = (section.className && typeof section.className === "string")
      ? section.className.split(/\s+/).slice(0, 2).join(" ")
      : "";
    const label = sectionClass ? `${heading} (.${sectionClass})` : heading;
    hierarchyMap.push(`${label} (${subSections.length} children)`);
  });

  signals.push({
    type: "section_hierarchy",
    value: truncateText(hierarchyMap.join(" | "), 500),
    confidence: 0.8,
    selector: "main",
    metadata: {
      topLevelCount: topLevelSections.length,
      hierarchyMap,
    },
  });

  // Count headings found in the hierarchy
  const headingCount = countHeadingsInContainers(containers);

  const section: EvidenceSection = {
    category: "semanticStructure",
    label: "Semantic Structure",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      relationshipCount,
      topLevelSections: topLevelSections.length,
      groupedContentCount: groupedContent.length,
      hasStructuredSections: relationshipCount > 0,
      headingCount,
      containerCount: containers.length,
    },
  };

  return [section];
}

/**
 * Find all structural containers in the document — both HTML5 semantic
 * elements and div elements with sectioning class patterns.
 * @internal
 */
function findStructuralContainers(doc: Document): Element[] {
  const containers: Element[] = [];

  // HTML5 semantic elements
  const semanticSelectors = "main > section, main > article, article > section, section > section, main > aside, body > section, body > main, body > article";
  doc.querySelectorAll(semanticSelectors).forEach((el) => containers.push(el));

  // Div elements with sectioning class patterns
  doc.querySelectorAll("div").forEach((div) => {
    if (hasSectioningClass(div)) {
      // Only include if it has meaningful content (headings or substantial text)
      const hasHeading = div.querySelector("h1, h2, h3, h4, h5, h6") !== null;
      const text = div.textContent?.trim() ?? "";
      if (hasHeading || text.length > 50) {
        // Avoid duplicates with already-found semantic elements
        if (!containers.includes(div)) {
          containers.push(div);
        }
      }
    }
  });

  return containers;
}

/**
 * Find child sections within a container — both semantic and div-based.
 * @internal
 */
function findChildSections(container: Element): Element[] {
  const children: Element[] = [];
  const semanticChildren = container.querySelectorAll(":scope > section, :scope > article, :scope > aside");
  semanticChildren.forEach((el) => children.push(el));

  // Also check for div children with sectioning classes
  Array.from(container.children).forEach((child) => {
    if (child.tagName.toLowerCase() === "div" && hasSectioningClass(child)) {
      if (!children.includes(child)) {
        children.push(child);
      }
    }
  });

  return children;
}

/**
 * Find top-level sections in the document.
 * @internal
 */
function findTopLevelSections(doc: Document): Element[] {
  const sections: Element[] = [];

  // HTML5 semantic top-level sections
  doc.querySelectorAll("main > section, body > section, main > article, body > article").forEach((el) => sections.push(el));

  // Div-based top-level sections with sectioning classes
  const main = doc.querySelector("main") ?? doc.body;
  if (main) {
    Array.from(main.children).forEach((child) => {
      if (child.tagName.toLowerCase() === "div" && hasSectioningClass(child)) {
        if (!sections.includes(child)) {
          sections.push(child);
        }
      }
    });
  }

  return sections;
}

/**
 * Check if an element has a class that indicates it's a structural section.
 * @internal
 */
function hasSectioningClass(el: Element): boolean {
  const className = el.className;
  if (!className || typeof className !== "string") return false;
  const lowerClass = className.toLowerCase();
  return SECTIONING_CLASS_PATTERNS.some((pattern) => lowerClass.includes(pattern));
}

/**
 * Count headings found within the structural containers.
 * @internal
 */
function countHeadingsInContainers(containers: Element[]): number {
  const headings = new Set<Element>();
  for (const container of containers) {
    container.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => headings.add(h));
  }
  return headings.size;
}

/**
 * Calculate the nesting depth of an element within the document.
 * @internal
 */
function getNestingDepth(el: Element): number {
  let depth = 0;
  let current: Element | null = el.parentElement;
  while (current && current.tagName !== "HTML" && depth < MAX_DEPTH) {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

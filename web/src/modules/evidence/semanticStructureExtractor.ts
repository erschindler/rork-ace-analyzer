/**
 * Semantic Structure Extractor — Production Version for ACE v1.2
 *
 * Builds semantic relationships: section → subsection → content block.
 * Supports:
 * - Native HTML5 semantic elements
 * - Elementor legacy + modern Flexbox containers
 * - Gutenberg / WordPress block structures
 * - React / SPA component layouts
 * - Bootstrap / Tailwind sectioning patterns
 * - Div-based semantic sectioning
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Maximum depth to traverse. */
const MAX_DEPTH = 6;

/** Classes that indicate a div is acting as a semantic section. */
const SECTIONING_CLASS_PATTERNS = [
  // Elementor legacy
  "elementor-section",
  "elementor-top-section",
  "elementor-inner-section",
  "elementor-container",
  "elementor-column",
  "elementor-widget",
  "elementor-element",

  // Elementor modern Flexbox
  "e-con",
  "e-con-inner",
  "e-con-boxed",
  "e-con-full",

  // Gutenberg / WordPress blocks
  "wp-block",
  "wp-block-group",
  "wp-block-cover",
  "wp-block-columns",
  "wp-block-media-text",
  "entry-content",
  "post-content",
  "page-content",

  // React / SPA component patterns
  "content-area",
  "content-block",
  "content-section",
  "main-content",
  "primary-content",
  "module",
  "panel",
  "card",
  "tile",
  "feature",
  "hero",
  "hero-section",
  "banner",

  // Bootstrap / Tailwind
  "container",
  "row",
  "col-",
  "section",
  "grid",
  "flex",
  "flex-col",
  "flex-row",

  // Generic semantic hints
  "post-block",
  "article-body",
  "story-body",
];

/**
 * Extract semantic structure relationships from a Document.
 */
export function extractSemanticStructure(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];

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

  // Content groupings
  const groupedContent = doc.querySelectorAll("[role='group'], fieldset, details");
  groupedContent.forEach((group) => {
    const label =
      group.querySelector("legend, summary, [aria-label]")?.textContent?.trim() ?? "";

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

  // Section hierarchy
  const topLevelSections = findTopLevelSections(doc);
  const hierarchyMap: string[] = [];

  topLevelSections.forEach((section) => {
    const heading =
      section.querySelector("h1, h2, h3")?.textContent?.trim() ??
      section.tagName.toLowerCase();

    const subSections = findChildSections(section);

    const sectionClass =
      typeof section.className === "string"
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

  const headingCount = countHeadingsInContainers(containers);

  const section: EvidenceSection = {
    category: "semanticStructure",
    label: "Semantic Structure",
    signals,
    count: signals.length,
    confidence:
      signals.length > 0
        ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length
        : 0,
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
 * Find structural containers — semantic elements + div-based sections.
 */
function findStructuralContainers(doc: Document): Element[] {
  const containers: Element[] = [];

  // HTML5 semantic elements
  const semanticSelectors =
    "main > section, main > article, article > section, section > section, main > aside, body > section, body > main, body > article";
  doc.querySelectorAll(semanticSelectors).forEach((el) => containers.push(el));

  // Div-based sectioning
  doc.querySelectorAll("div").forEach((div) => {
    if (hasSectioningClass(div)) {
      const hasHeading = div.querySelector("h1, h2, h3, h4, h5, h6") !== null;
      const text = div.textContent?.trim() ?? "";

      if (hasHeading || text.length > 50) {
        if (!containers.includes(div)) containers.push(div);
      }
    }
  });

  return containers;
}

/**
 * Find child sections — semantic + div-based.
 */
function findChildSections(container: Element): Element[] {
  const children: Element[] = [];

  container
    .querySelectorAll(":scope > section, :scope > article, :scope > aside")
    .forEach((el) => children.push(el));

  Array.from(container.children).forEach((child) => {
    if (child.tagName.toLowerCase() === "div" && hasSectioningClass(child)) {
      if (!children.includes(child)) children.push(child);
    }
  });

  return children;
}

/**
 * Find top-level sections.
 */
function findTopLevelSections(doc: Document): Element[] {
  const sections: Element[] = [];

  doc
    .querySelectorAll("main > section, body > section, main > article, body > article")
    .forEach((el) => sections.push(el));

  const main = doc.querySelector("main") ?? doc.body;

  Array.from(main.children).forEach((child) => {
    if (child.tagName.toLowerCase() === "div" && hasSectioningClass(child)) {
      if (!sections.includes(child)) sections.push(child);
    }
  });

  return sections;
}

/**
 * Check if an element has a structural sectioning class.
 */
function hasSectioningClass(el: Element): boolean {
  const className = el.className;
  if (!className || typeof className !== "string") return false;

  const lower = className.toLowerCase();
  return SECTIONING_CLASS_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Count headings inside structural containers.
 */
function countHeadingsInContainers(containers: Element[]): number {
  const headings = new Set<Element>();
  containers.forEach((container) => {
    container
      .querySelectorAll("h1, h2, h3, h4, h5, h6")
      .forEach((h) => headings.add(h));
  });
  return headings.size;
}

/**
 * Calculate nesting depth.
 */
function getNestingDepth(el: Element): number {
  let depth = 0;
  let current = el.parentElement;

  while (current && current.tagName !== "HTML" && depth < MAX_DEPTH) {
    depth++;
    current = current.parentElement;
  }

  return depth;
}

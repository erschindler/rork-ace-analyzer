/**
 * Hierarchy Builder — Phase 2
 * Builds a semantic hierarchy tree of the document's content structure.
 *
 * ACE v1.2 fix: The hierarchy builder now uses a heading-anchored approach.
 * Instead of only traversing semantic tags (which misses headings inside
 * div-based layouts like Elementor), it:
 * 1. Finds all headings in the document
 * 2. Traces each heading's ancestor path to the body
 * 3. Builds the hierarchy from those ancestor paths
 *
 * This ensures ALL headings are captured in the hierarchy regardless of
 * the DOM structure, eliminating contradictions between the Structure
 * metric (which queries h1-h6 directly) and the SemanticStructure metric
 * (which uses the hierarchy).
 */

import type { HierarchyNode } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Tags that always represent structural/semantic hierarchy. */
const SEMANTIC_TAGS = new Set([
  "header", "nav", "main", "article", "section", "aside",
  "footer", "figure", "figcaption", "details", "summary", "address",
]);

/** Heading tags. */
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** Tags that are structural containers (always traversed). */
const CONTAINER_TAGS = new Set([
  ...Array.from(SEMANTIC_TAGS),
  ...Array.from(HEADING_TAGS),
  "div", "ul", "ol", "li", "table", "tbody", "thead", "tfoot", "tr",
  "form", "fieldset", "blockquote", "dl", "dt", "dd",
]);

/** Classes/attributes that indicate a div is a structural section. */
const SECTIONING_CLASS_PATTERNS = [
  "elementor-section", "elementor-widget", "elementor-column",
  "elementor-container", "wp-block", "section", "content",
  "main", "article", "post", "entry", "page-content",
  "hero", "banner", "footer", "header", "sidebar", "nav", "menu",
  "card", "tile", "block", "panel", "module", "container",
  "wrapper", "row", "col", "story", "feature", "offer",
];

/** Maximum nesting depth to prevent excessive recursion. */
const MAX_DEPTH = 15;

/** Tags to skip entirely (not useful for hierarchy). */
const SKIP_TAGS = new Set([
  "script", "style", "template", "noscript", "svg", "iframe",
  "span", "a", "img", "br", "hr", "input", "button", "label",
  "strong", "em", "b", "i", "u", "code", "pre", "small", "sub", "sup",
  "link", "meta", "title", "base", "head",
]);

/**
 * Build a semantic hierarchy tree from a Document.
 * Uses a heading-anchored approach to ensure all headings are captured.
 * @param doc Parsed Document.
 * @returns Root HierarchyNode or null if no structure found.
 */
export function buildHierarchy(doc: Document): HierarchyNode | null {
  const body = doc.body;
  if (!body) return null;

  // Find all headings in the document
  const headings = Array.from(body.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  if (headings.length === 0) {
    // No headings — still build a basic hierarchy from semantic elements
    return buildBasicHierarchy(body, 0);
  }

  // Collect all ancestor elements of headings (up to body)
  // These are the elements that form the hierarchy path
  const hierarchyElements = new Set<Element>();
  for (const heading of headings) {
    let current: Element | null = heading;
    while (current && current !== body && current.tagName !== "HTML") {
      hierarchyElements.add(current);
      current = current.parentElement;
    }
  }

  // Also include semantic elements that don't contain headings
  // (e.g., header, nav, footer that may not have headings inside)
  body.querySelectorAll("header, nav, footer, aside, main, article, section").forEach((el) => {
    hierarchyElements.add(el);
  });

  // Build the hierarchy tree starting from body, only including elements
  // that are in hierarchyElements or are semantic/container elements
  return buildNode(body, 0, hierarchyElements);
}

/**
 * Recursively build a hierarchy node from an element.
 * Only traverses into elements that are in the hierarchyElements set
 * or are container/semantic elements.
 * @internal
 */
function buildNode(el: Element, depth: number, hierarchyElements: Set<Element>): HierarchyNode {
  const tag = el.tagName.toLowerCase();
  const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE
    ? (el.textContent ?? "").trim()
    : "";

  const node: HierarchyNode = {
    tag,
    level: depth,
    text: truncateText(text, 200),
    selector: generateSelector(el),
    children: [],
  };

  // Collect attributes
  const interestingAttrs: Record<string, string> = {};
  if (el.id) interestingAttrs.id = el.id;
  if (el.className && typeof el.className === "string") {
    interestingAttrs.class = el.className.split(/\s+/).slice(0, 3).join(" ");
  }
  if (el.getAttribute("role")) interestingAttrs.role = el.getAttribute("role")!;
  if (el.getAttribute("aria-label")) interestingAttrs["aria-label"] = el.getAttribute("aria-label")!;
  if (Object.keys(interestingAttrs).length > 0) {
    node.attributes = interestingAttrs;
  }

  if (depth >= MAX_DEPTH) return node;

  // Recurse into child elements that are:
  // 1. Headings themselves (always included)
  // 2. In the hierarchyElements set (ancestors of headings)
  // 3. Semantic tags (header, nav, main, article, section, aside, footer)
  // 4. Divs with sectioning classes
  // 5. Any element that contains a heading (querySelector check)
  // 6. Elements with role attributes
  const childElements = Array.from(el.children).filter((child) => {
    const childTag = child.tagName.toLowerCase();
    if (SKIP_TAGS.has(childTag)) return false;
    if (HEADING_TAGS.has(childTag)) return true;
    if (hierarchyElements.has(child)) return true;
    if (SEMANTIC_TAGS.has(childTag)) return true;
    if (childTag === "div" && hasSectioningClass(child)) return true;
    if (child.getAttribute("role") !== null) return true;
    // Check if this child contains any heading — ensures we never miss headings
    if (child.querySelector("h1, h2, h3, h4, h5, h6")) return true;
    return false;
  });

  for (const child of childElements) {
    node.children.push(buildNode(child, depth + 1, hierarchyElements));
  }

  return node;
}

/**
 * Build a basic hierarchy when no headings are found.
 * Falls back to traversing semantic elements only.
 * @internal
 */
function buildBasicHierarchy(el: Element, depth: number): HierarchyNode {
  const tag = el.tagName.toLowerCase();
  const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE
    ? (el.textContent ?? "").trim()
    : "";

  const node: HierarchyNode = {
    tag,
    level: depth,
    text: truncateText(text, 200),
    selector: generateSelector(el),
    children: [],
  };

  const interestingAttrs: Record<string, string> = {};
  if (el.id) interestingAttrs.id = el.id;
  if (el.className && typeof el.className === "string") {
    interestingAttrs.class = el.className.split(/\s+/).slice(0, 3).join(" ");
  }
  if (el.getAttribute("role")) interestingAttrs.role = el.getAttribute("role")!;
  if (Object.keys(interestingAttrs).length > 0) {
    node.attributes = interestingAttrs;
  }

  if (depth >= MAX_DEPTH) return node;

  const childElements = Array.from(el.children).filter((child) => {
    const childTag = child.tagName.toLowerCase();
    if (SKIP_TAGS.has(childTag)) return false;
    if (HEADING_TAGS.has(childTag)) return true;
    if (SEMANTIC_TAGS.has(childTag)) return true;
    if (childTag === "div" && hasSectioningClass(child)) return true;
    if (child.getAttribute("role") !== null) return true;
    if (child.querySelector("h1, h2, h3, h4, h5, h6")) return true;
    return false;
  });

  for (const child of childElements) {
    node.children.push(buildBasicHierarchy(child, depth + 1));
  }

  return node;
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

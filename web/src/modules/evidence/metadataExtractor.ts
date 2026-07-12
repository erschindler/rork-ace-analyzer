/**
 * Metadata Extractor — Phase 2
 * Extracts page metadata from <head>: title, meta tags, Open Graph, Twitter Cards.
 * Deterministic, returns structured EvidenceSection.
 */

import type { EvidenceMetadata, EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/**
 * Extract metadata from a Document's <head>.
 * @param doc Parsed Document.
 * @returns Tuple of [EvidenceMetadata object, EvidenceSection[]].
 */
export function extractMetadata(doc: Document): { metadata: EvidenceMetadata; sections: EvidenceSection[] } {
  const signals: EvidenceSignal[] = [];
  const metadata: EvidenceMetadata = {};

  // Title
  const titleEl = doc.querySelector("title");
  if (titleEl?.textContent?.trim()) {
    const title = titleEl.textContent.trim();
    metadata.title = title;
    signals.push({
      type: "title",
      value: title,
      confidence: 1.0,
      selector: "title",
    });
  }

  // Meta tags
  const metaTags = doc.querySelectorAll("meta");
  metaTags.forEach((meta) => {
    const name = (meta.getAttribute("name") || meta.getAttribute("property") || "").toLowerCase();
    const content = meta.getAttribute("content")?.trim() ?? "";
    if (!name || !content) return;

    const selector = generateSelector(meta);
    const confidence = 0.95;

    // Standard meta tags
    const metaMap: Record<string, keyof EvidenceMetadata> = {
      description: "description",
      author: "author",
      keywords: "keywords",
      robots: "robots",
      generator: "generator",
      "content-type": "contentType",
      viewport: "viewport",
      charset: "charset",
      "theme-color": "themeColor",
    };

    if (metaMap[name]) {
      metadata[metaMap[name]] = content;
    }

    // Open Graph
    if (name.startsWith("og:")) {
      const ogMap: Record<string, keyof EvidenceMetadata> = {
        "og:title": "ogTitle",
        "og:description": "ogDescription",
        "og:image": "ogImage",
        "og:type": "ogType",
        "og:url": "ogUrl",
        "og:site_name": "ogSiteName",
      };
      if (ogMap[name]) {
        metadata[ogMap[name]] = content;
      }
    }

    // Twitter Card
    if (name.startsWith("twitter:")) {
      const twitterMap: Record<string, keyof EvidenceMetadata> = {
        "twitter:card": "twitterCard",
        "twitter:title": "twitterTitle",
        "twitter:description": "twitterDescription",
        "twitter:image": "twitterImage",
      };
      if (twitterMap[name]) {
        metadata[twitterMap[name]] = content;
      }
    }

    signals.push({
      type: name,
      value: truncateText(content, 300),
      confidence,
      selector,
      metadata: { name, content },
    });
  });

  // Charset
  const charsetEl = doc.querySelector("meta[charset]");
  if (charsetEl?.getAttribute("charset")) {
    metadata.charset = charsetEl.getAttribute("charset") ?? undefined;
  }

  // Canonical
  const canonicalEl = doc.querySelector('link[rel="canonical"]');
  if (canonicalEl?.getAttribute("href")) {
    const canonical = canonicalEl.getAttribute("href") ?? "";
    metadata.canonical = canonical;
    signals.push({
      type: "canonical",
      value: canonical,
      confidence: 1.0,
      selector: 'link[rel="canonical"]',
    });
  }

  // Language
  const htmlLang = doc.documentElement.getAttribute("lang");
  if (htmlLang) {
    metadata.language = htmlLang;
    signals.push({
      type: "language",
      value: htmlLang,
      confidence: 1.0,
      selector: "html[lang]",
    });
  }

  // Favicon
  const faviconEl = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
  if (faviconEl?.getAttribute("href")) {
    metadata.favicon = faviconEl.getAttribute("href") ?? "";
    signals.push({
      type: "favicon",
      value: metadata.favicon,
      confidence: 0.9,
      selector: generateSelector(faviconEl),
    });
  }

  const section: EvidenceSection = {
    category: "metadata",
    label: "Page Metadata",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length : 0,
    metadata: { metadataCount: signals.length },
  };

  return { metadata, sections: [section] };
}

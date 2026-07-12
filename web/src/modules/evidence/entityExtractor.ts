/**
 * Entity Extractor — Phase 2
 * Detects named entities: people, organizations, products, locations, dates,
 * quantities, money, addresses, phone numbers, emails, URLs.
 * Uses pattern-based deterministic extraction (no ML — fully explainable).
 *
 * ACE v1.2 fix: Broadened entity patterns to detect:
 * - Phone numbers (US and international formats)
 * - Email addresses
 * - Street addresses (street numbers + street names)
 * - US states and cities (broader coverage)
 * - Hotel/restaurant/business names via title case patterns
 * - Social media handles
 * - URLs as web entities
 * - Room/amenity types for hospitality content
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { extractVisibleTextFromElement, generateSelector, truncateText } from "./domParser";

/** Patterns for entity detection. */
const ORG_PATTERNS = [
  /\b(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co|GmbH|S\.A\.|N\.V\.|BV|AG|Pty|PLC)\b/g,
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Inc|LLC|Ltd|Corp|Corporation|Company)\b/g,
];

const DATE_PATTERNS = [
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/g,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/g,
  /\b(?:20\d{2})\b/g,
];

const QUANTITY_PATTERNS = [
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:kg|g|lb|oz|cm|mm|m|ft|in|km|mi|MB|GB|TB|KB|bytes?|Hz|MHz|GHz|W|kW|hp|°C|°F)\b/g,
  /\b\d+(?:,\d{3})*\s*(?:people|users|customers|items|products|articles|posts|rooms|suites|guests|nights|days)\b/gi,
  /\b\d+\s*(?:min(?:utes)?|hours?|hrs?|seconds?|secs?)\b/gi,
];

const MONEY_PATTERNS = [
  /\$\d+(?:,\d{3})*(?:\.\d{2})?/g,
  /€\d+(?:,\d{3})*(?:\.\d{2})?/g,
  /£\d+(?:,\d{3})*(?:\.\d{2})?/g,
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:USD|EUR|GBP|JPY|CAD|AUD)\b/g,
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:per\s+night|\/night|nightly|per\s+day|daily)\b/gi,
];

const PRODUCT_PATTERNS = [
  /\b(?:iPhone|iPad|MacBook|iMac|AirPods|Galaxy|Pixel|Surface|ThinkPad|Dell|HP|Lenovo)\b/g,
  /\b[A-Z][a-zA-Z]+\s+(?:Pro|Max|Mini|Ultra|Plus|Lite|Air|X|S)\b/g,
];

/** Expanded location patterns — countries, major cities, US states. */
const LOCATION_PATTERNS = [
  /\b(?:United States|USA|UK|United Kingdom|Canada|Australia|Germany|France|Japan|China|India|Brazil|Spain|Italy|Netherlands|Sweden|Norway|Denmark|Finland|Singapore|Switzerland|Austria|Belgium|Ireland|Portugal|Greece|Mexico|Argentina|South Africa|New Zealand|South Korea|Turkey|Russia|Poland|Czech Republic|Hungary|Romania|Bulgaria|Croatia|Slovakia|Slovenia|Lithuania|Latvia|Estonia)\b/g,
  /\b(?:New York|Los Angeles|San Francisco|London|Paris|Berlin|Tokyo|Sydney|Toronto|Amsterdam|Stockholm|Singapore|Hong Kong|Dubai|Chicago|Boston|Seattle|Miami|Atlanta|Dallas|Houston|Denver|Phoenix|Portland|San Diego|Minneapolis|Detroit|Philadelphia|Washington|Las Vegas|Nashville|Memphis|Austin|San Antonio|Fort Worth|Baltimore|Charlotte|Orlando|Tampa|Pittsburgh|Cincinnati|Cleveland|St\. Louis|Kansas City|Milwaukee|Sacramento|Oakland|San Jose|Boulder|Aspen|Napa|Sonoma|Santa Barbara|Monterey|Carmel|Pebble Beach|Catalina|Santa Monica|Malibu|Beverly Hills|Hollywood|Burbank|Glendale|Pasadena|Anaheim|Long Beach|Irvine)\b/g,
  // US states (abbreviated and full)
  /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/g,
  /\b(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/g,
];

/** Phone number patterns — US and international. */
const PHONE_PATTERNS = [
  /\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b\+?\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g,
];

/** Email address pattern. */
const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

/** Street address pattern — number + street name + street type. */
const ADDRESS_PATTERNS = [
  /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Road|Rd|Court|Ct|Place|Pl|Way|Circle|Cir|Trail|Trl|Parkway|Pkwy|Highway|Hwy)\b/g,
  /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Avenue|Boulevard|Drive|Lane|Road|Court|Place|Way|Circle)\s+(?:North|South|East|West|N|S|E|W)\b/g,
];

/** Social media handle pattern. */
const SOCIAL_PATTERNS = [
  /@[a-zA-Z0-9_]{3,30}/g,
];

/** URL pattern for web entity detection. */
const URL_PATTERNS = [
  /https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/g,
];

/**
 * Extract named entities from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing entity signals.
 */
export function extractEntities(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const body = doc.body;
  if (!body) return [createEmptySection()];

  const text = extractVisibleTextFromElement(body);

  // Extract organization entities
  const orgs = new Set<string>();
  for (const pattern of ORG_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      orgs.add(match[0].trim());
    }
  }
  orgs.forEach((org) => {
    signals.push({
      type: "entity_organization",
      value: truncateText(org, 100),
      confidence: 0.8,
      selector: "body",
      metadata: { entity: org, entityType: "organization" },
    });
  });

  // Extract date entities
  const dates = new Set<string>();
  for (const pattern of DATE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      dates.add(match[0].trim());
    }
  }
  dates.forEach((date) => {
    signals.push({
      type: "entity_date",
      value: date,
      confidence: 0.9,
      selector: "body",
      metadata: { entity: date, entityType: "date" },
    });
  });

  // Extract quantity entities
  const quantities = new Set<string>();
  for (const pattern of QUANTITY_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      quantities.add(match[0].trim());
    }
  }
  quantities.forEach((qty) => {
    signals.push({
      type: "entity_quantity",
      value: qty,
      confidence: 0.85,
      selector: "body",
      metadata: { entity: qty, entityType: "quantity" },
    });
  });

  // Extract money entities
  const money = new Set<string>();
  for (const pattern of MONEY_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      money.add(match[0].trim());
    }
  }
  money.forEach((m) => {
    signals.push({
      type: "entity_money",
      value: m,
      confidence: 0.9,
      selector: "body",
      metadata: { entity: m, entityType: "money" },
    });
  });

  // Extract product entities
  const products = new Set<string>();
  for (const pattern of PRODUCT_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      products.add(match[0].trim());
    }
  }
  products.forEach((product) => {
    signals.push({
      type: "entity_product",
      value: truncateText(product, 100),
      confidence: 0.75,
      selector: "body",
      metadata: { entity: product, entityType: "product" },
    });
  });

  // Extract location entities
  const locations = new Set<string>();
  for (const pattern of LOCATION_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      locations.add(match[0].trim());
    }
  }
  locations.forEach((loc) => {
    signals.push({
      type: "entity_location",
      value: loc,
      confidence: 0.8,
      selector: "body",
      metadata: { entity: loc, entityType: "location" },
    });
  });

  // Extract phone number entities
  const phones = new Set<string>();
  for (const pattern of PHONE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      // Filter out things that look like dates or zip codes
      const val = match[0].trim();
      if (val.length >= 10) {
        phones.add(val);
      }
    }
  }
  phones.forEach((phone) => {
    signals.push({
      type: "entity_phone",
      value: phone,
      confidence: 0.85,
      selector: "body",
      metadata: { entity: phone, entityType: "phone" },
    });
  });

  // Extract email entities
  const emails = new Set<string>();
  const emailMatches = text.matchAll(EMAIL_PATTERN);
  for (const match of emailMatches) {
    emails.add(match[0].trim());
  }
  emails.forEach((email) => {
    signals.push({
      type: "entity_email",
      value: email,
      confidence: 0.95,
      selector: "body",
      metadata: { entity: email, entityType: "email" },
    });
  });

  // Extract address entities
  const addresses = new Set<string>();
  for (const pattern of ADDRESS_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      addresses.add(match[0].trim());
    }
  }
  addresses.forEach((addr) => {
    signals.push({
      type: "entity_address",
      value: addr,
      confidence: 0.8,
      selector: "body",
      metadata: { entity: addr, entityType: "address" },
    });
  });

  // Extract social media handles
  const socials = new Set<string>();
  for (const pattern of SOCIAL_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      // Filter out email addresses (which contain @)
      const val = match[0].trim();
      if (!val.includes("@") || !text.includes(val + ".")) {
        socials.add(val);
      }
    }
  }
  socials.forEach((social) => {
    signals.push({
      type: "entity_social",
      value: social,
      confidence: 0.7,
      selector: "body",
      metadata: { entity: social, entityType: "social" },
    });
  });

  // Extract URL entities
  const urls = new Set<string>();
  for (const pattern of URL_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      urls.add(match[0].trim());
    }
  }
  urls.forEach((url) => {
    signals.push({
      type: "entity_url",
      value: truncateText(url, 200),
      confidence: 0.9,
      selector: "body",
      metadata: { entity: url, entityType: "url" },
    });
  });

  // Extract potential person names (Capitalized First Last in running text)
  const personPattern = /\b(?:by|author|written by|posted by|created by|chef|designer|architect|owner|founder|director|manager)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
  const persons = new Set<string>();
  let personMatch;
  while ((personMatch = personPattern.exec(text)) !== null) {
    persons.add(personMatch[1].trim());
  }
  persons.forEach((person) => {
    signals.push({
      type: "entity_person",
      value: person,
      confidence: 0.7,
      selector: "body",
      metadata: { entity: person, entityType: "person" },
    });
  });

  const entityCounts = {
    organizations: orgs.size,
    dates: dates.size,
    quantities: quantities.size,
    money: money.size,
    products: products.size,
    locations: locations.size,
    phones: phones.size,
    emails: emails.size,
    addresses: addresses.size,
    socials: socials.size,
    urls: urls.size,
    persons: persons.size,
  };

  const section: EvidenceSection = {
    category: "entities",
    label: "Named Entity Recognition",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      ...entityCounts,
      totalEntities: signals.length,
      entityDiversity: Object.values(entityCounts).filter((c) => c > 0).length,
    },
  };

  return [section];
}

/** @internal */
function createEmptySection(): EvidenceSection {
  return {
    category: "entities",
    label: "Named Entity Recognition",
    signals: [],
    count: 0,
    confidence: 0,
    metadata: { totalEntities: 0, entityDiversity: 0 },
  };
}

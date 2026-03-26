/**
 * CSP Utilities
 * - Console log violation parser (Chrome/Firefox/Safari)
 * - Domain extraction and normalization
 * - CSP builder/merger
 */

import { parseCsp, evaluateCsp, Severity, type Finding } from './cspEvaluator';

// ── Types ────────────────────────────────────────────────────────

export interface CspViolation {
  resourceType: 'script' | 'style' | 'image' | 'font' | 'connect' | 'frame' | 'media' | 'object' | 'other';
  resourceUrl: string;
  blockedDomain: string;
  directive: string;
  currentDirectiveValues: string[];
  fallbackNote?: string;
}

export interface DirectiveSuggestion {
  directive: string;
  domainsToAdd: string[];
  warnings: string[];
}

// ── Domain Extraction ────────────────────────────────────────────

/**
 * Extracts a clean domain (with optional wildcard) from a URL or string.
 * Removes path, query, fragment. Keeps port if non-standard.
 */
export function extractDomain(input: string): string {
  let cleaned = input.trim();

  // Remove surrounding quotes and trailing semicolons
  cleaned = cleaned.replace(/^['"]|['"]$/g, '').replace(/;$/, '');

  // Remove annotations like "(European data hosting only)"
  cleaned = cleaned.replace(/\s*\(.*?\)\s*$/, '').trim();

  // Strip any scheme (https://, http://, wss://, ws://, //) to get the host part
  const schemeFree = cleaned.replace(/^(?:https?|wss?):\/\//i, '').replace(/^\/\//, '');

  // Wildcard domain: *.example.com (with or without scheme prefix)
  if (/^\*\.[\w.-]+$/.test(schemeFree)) {
    // Remove path if present
    return schemeFree.replace(/\/.*$/, '').toLowerCase();
  }

  // Try to parse as URL (replace * with placeholder to avoid URL encoding)
  try {
    let urlStr = schemeFree.replace(/^\*/, 'wildcard_placeholder');
    urlStr = 'https://' + urlStr;
    const url = new URL(urlStr);
    let host = url.hostname.toLowerCase().replace('wildcard_placeholder', '*');

    // Include non-standard ports
    if (url.port && url.port !== '443' && url.port !== '80') {
      host += ':' + url.port;
    }

    return host;
  } catch {
    // If URL parsing fails, try to extract hostname-like pattern
    const match = schemeFree.match(/^([*\w][\w.-]*[\w])/i);
    if (match) return match[1].toLowerCase();
    return schemeFree.toLowerCase();
  }
}

/**
 * Checks if a domain value might cause CSP issues.
 */
export function checkDomainWarnings(domain: string): string[] {
  const warnings: string[] = [];

  if (domain === '*') {
    warnings.push('Wildcard (*) allows all sources - very dangerous for security');
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(domain)) {
    warnings.push('IP addresses are generally ignored by browsers in CSP');
  }
  if (domain.startsWith('http://')) {
    warnings.push('HTTP sources should use HTTPS for security');
  }
  if (domain.includes('*') && !domain.startsWith('*.')) {
    warnings.push('Wildcards should only be used as subdomain prefix (*.example.com)');
  }

  return warnings;
}

// ── Console Log Parser ───────────────────────────────────────────

const RESOURCE_TYPE_MAP: Record<string, CspViolation['resourceType']> = {
  script: 'script',
  style: 'style',
  stylesheet: 'style',
  image: 'image',
  img: 'image',
  font: 'font',
  connect: 'connect',
  xmlhttprequest: 'connect',
  fetch: 'connect',
  websocket: 'connect',
  frame: 'frame',
  iframe: 'frame',
  media: 'media',
  audio: 'media',
  video: 'media',
  object: 'object',
  embed: 'object',
};

const DIRECTIVE_FOR_TYPE: Record<CspViolation['resourceType'], string> = {
  script: 'script-src',
  style: 'style-src',
  image: 'img-src',
  font: 'font-src',
  connect: 'connect-src',
  frame: 'frame-src',
  media: 'media-src',
  object: 'object-src',
  other: 'default-src',
};

/**
 * Parses browser console output and extracts CSP violations.
 * Supports Chrome, Firefox, and Safari formats.
 */
export function parseConsoleViolations(consoleText: string): CspViolation[] {
  const violations: CspViolation[] = [];
  // Normalize smart/curly quotes to straight quotes (Firefox uses these)
  const normalized = consoleText
    .replace(/[\u201C\u201D]/g, '"')   // " " → "
    .replace(/[\u2018\u2019]/g, "'");  // ' ' → '
  const lines = normalized.split('\n');
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Chrome format:
    // Loading the [script|image|...] 'URL' violates the following Content Security Policy directive: "directive-name values..."
    // Refused to load the [script|image|...] 'URL' because it violates the following Content Security Policy directive: "directive-name values..."
    const chromeMatch = line.match(
      /(?:Loading|Refused to (?:load|execute|apply|connect to|frame)) the (\w+)\s+'([^']+)'\s+(?:violates|because it violates) the following Content Security Policy directive:\s*"([^"]+)"/i
    );

    if (chromeMatch) {
      const violation = parseChromeViolation(chromeMatch[1], chromeMatch[2], chromeMatch[3], line);
      if (violation) {
        const key = `${violation.directive}:${violation.blockedDomain}`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push(violation);
        }
      }
      continue;
    }

    // Firefox format (modern):
    // Content-Security-Policy: The page's settings blocked a script (script-src-elem) at https://example.com/script.js from being executed because it violates the following directive: "script-src 'self' ..."
    // Content-Security-Policy: The page's settings blocked the loading of a resource (img-src) at https://example.com/img.png because it violates the following directive: "img-src 'self' ..."
    const firefoxModernMatch = line.match(
      /Content[- ]Security[- ]Policy:.*?blocked.*?\(([^)]+)\)\s+at\s+(\S+).*?violates the following directive:\s*"([^"]+)"/i
    );

    if (firefoxModernMatch) {
      const hintDirective = firefoxModernMatch[1].toLowerCase();
      const url = firefoxModernMatch[2].replace(/['"]/g, '');
      const directiveStr = firefoxModernMatch[3].trim();
      const parts = directiveStr.split(/\s+/);
      const directive = parts[0].toLowerCase();
      const currentValues = parts.slice(1);
      const resourceType = directiveToResourceType(hintDirective || directive);
      const domain = extractDomain(url);

      const key = `${directive}:${domain}`;
      if (!seen.has(key)) {
        seen.add(key);
        violations.push({
          resourceType,
          resourceUrl: url,
          blockedDomain: domain,
          directive,
          currentDirectiveValues: currentValues,
        });
      }
      continue;
    }

    // Firefox format (legacy):
    // Content-Security-Policy: The page's settings blocked the loading of a resource at https://example.com ("script-src")
    const firefoxLegacyMatch = line.match(
      /Content[- ]Security[- ]Policy:.*blocked.*(?:at|of a resource at)\s+(\S+)\s*\("?([^")\s]+)"?\)/i
    );

    if (firefoxLegacyMatch) {
      const url = firefoxLegacyMatch[1].replace(/['"]/g, '');
      const directive = firefoxLegacyMatch[2].toLowerCase();
      const resourceType = directiveToResourceType(directive);
      const domain = extractDomain(url);

      const key = `${directive}:${domain}`;
      if (!seen.has(key)) {
        seen.add(key);
        violations.push({
          resourceType,
          resourceUrl: url,
          blockedDomain: domain,
          directive,
          currentDirectiveValues: [],
        });
      }
      continue;
    }

    // Safari format:
    // Refused to load https://example.com/script.js because it does not appear in the script-src directive of the Content Security Policy.
    const safariMatch = line.match(
      /Refused to (?:load|execute|apply|connect to|frame)\s+(\S+)\s+because it does not appear in the\s+(\S+)\s+directive/i
    );

    if (safariMatch) {
      const url = safariMatch[1].replace(/['"]/g, '');
      const directive = safariMatch[2].toLowerCase();
      const resourceType = directiveToResourceType(directive);
      const domain = extractDomain(url);

      const key = `${directive}:${domain}`;
      if (!seen.has(key)) {
        seen.add(key);
        violations.push({
          resourceType,
          resourceUrl: url,
          blockedDomain: domain,
          directive,
          currentDirectiveValues: [],
        });
      }
    }
  }

  return violations;
}

function parseChromeViolation(
  type: string,
  url: string,
  directiveStr: string,
  fullLine: string
): CspViolation | null {
  const typeLower = type.toLowerCase();
  const resourceType = RESOURCE_TYPE_MAP[typeLower] || guessTypeFromUrl(url) || 'other';

  // Parse the directive string: "script-src 'self' 'unsafe-inline' *.example.com"
  const parts = directiveStr.trim().split(/\s+/);
  const directive = parts[0].toLowerCase();
  const currentValues = parts.slice(1);

  const domain = extractDomain(url);

  // Check for fallback note
  let fallbackNote: string | undefined;
  const fallbackMatch = fullLine.match(/Note that '([^']+)' was not explicitly set, so '([^']+)' is used as a fallback/i);
  if (fallbackMatch) {
    fallbackNote = `'${fallbackMatch[1]}' was not set, '${fallbackMatch[2]}' used as fallback`;
  }

  return {
    resourceType,
    resourceUrl: url,
    blockedDomain: domain,
    directive,
    currentDirectiveValues: currentValues,
    fallbackNote,
  };
}

function directiveToResourceType(directive: string): CspViolation['resourceType'] {
  if (directive.startsWith('script')) return 'script';
  if (directive.startsWith('style')) return 'style';
  if (directive.startsWith('img')) return 'image';
  if (directive.startsWith('font')) return 'font';
  if (directive.startsWith('connect')) return 'connect';
  if (directive.startsWith('frame')) return 'frame';
  if (directive.startsWith('media')) return 'media';
  if (directive.startsWith('object')) return 'object';
  return 'other';
}

function guessTypeFromUrl(url: string): CspViolation['resourceType'] | null {
  const lower = url.toLowerCase();
  if (/\.(js|mjs)(\?|$)/.test(lower)) return 'script';
  if (/\.(css)(\?|$)/.test(lower)) return 'style';
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)(\?|$)/.test(lower)) return 'image';
  if (/\.(woff2?|ttf|otf|eot)(\?|$)/.test(lower)) return 'font';
  return null;
}

// ── Suggestion Generator ─────────────────────────────────────────

/**
 * Generates CSP directive suggestions from violations.
 */
export function generateSuggestions(violations: CspViolation[]): DirectiveSuggestion[] {
  const directiveMap = new Map<string, Set<string>>();
  const warningsMap = new Map<string, string[]>();

  for (const v of violations) {
    // Use the appropriate directive for the resource type
    const targetDirective = v.directive.startsWith('default-src')
      ? DIRECTIVE_FOR_TYPE[v.resourceType]
      : v.directive;

    if (!directiveMap.has(targetDirective)) {
      directiveMap.set(targetDirective, new Set());
      warningsMap.set(targetDirective, []);
    }

    directiveMap.get(targetDirective)!.add(v.blockedDomain);

    const domainWarnings = checkDomainWarnings(v.blockedDomain);
    warningsMap.get(targetDirective)!.push(...domainWarnings);
  }

  return Array.from(directiveMap.entries()).map(([directive, domains]) => ({
    directive,
    domainsToAdd: Array.from(domains).sort(),
    warnings: [...new Set(warningsMap.get(directive) || [])],
  }));
}

/**
 * Generates the full updated CSP string by merging current CSP with suggestions.
 * Returns the new tokens (directive:value) added so the UI can highlight them.
 */
export function buildUpdatedCsp(
  currentCspStr: string,
  suggestions: DirectiveSuggestion[]
): { csp: string; warnings: string[]; newTokens: Set<string> } {
  const parsed = parseCsp(currentCspStr);
  const allWarnings: string[] = [];
  const newTokens = new Set<string>();

  for (const suggestion of suggestions) {
    const { directive, domainsToAdd, warnings } = suggestion;
    allWarnings.push(...warnings);

    if (!parsed.directives[directive]) {
      parsed.directives[directive] = [...domainsToAdd];
      for (const d of domainsToAdd) newTokens.add(d);
    } else {
      for (const domain of domainsToAdd) {
        const existing = parsed.directives[directive]!;
        const coveredBy = findCoveringValue(domain, existing);
        if (!coveredBy) {
          existing.push(domain);
          newTokens.add(domain);
        }
      }
    }
  }

  const newCspStr = parsed.convertToString();
  const { findings } = evaluateCsp(newCspStr);
  const newIssues = findings.filter(
    (f) =>
      f.severity <= Severity.MEDIUM &&
      (f.directive === 'script-src' ||
        f.directive === 'default-src' ||
        f.directive === 'object-src')
  );

  for (const issue of newIssues) {
    if (issue.value) {
      allWarnings.push(`New entry may cause issue: ${issue.description}`);
    }
  }

  return { csp: newCspStr, warnings: [...new Set(allWarnings)], newTokens };
}

/**
 * Returns the existing value that covers the given domain, or null.
 */
function findCoveringValue(domain: string, existing: string[]): string | null {
  for (const e of existing) {
    if (e === domain) return e;
    // Check wildcard coverage: *.example.com covers sub.example.com
    if (e.startsWith('*.') && domain.endsWith(e.slice(1))) return e;
    if (e.startsWith('*.') && domain === e.slice(2)) return e;
  }
  return null;
}

// ── CSP Builder (Table → Merged CSP) ─────────────────────────────

export interface CspTableEntry {
  directive: string;
  values: string[];     // CSP values to add: domains, keywords ('unsafe-inline'), schemes (data:, blob:, wss://...)
  description: string;
}

// CSP directive pattern — matches script-src, img-src, connect-src, frame-ancestors, etc.
const CSP_DIRECTIVE_RE = /^(default|script|style|img|font|connect|media|object|frame|child|worker|base|form|manifest|prefetch|navigate)-(?:src|uri|action|ancestors|to)$/i;

// Domain-like pattern — must have a dot or be a wildcard, no spaces/special chars
// Matches: *.example.com, cdn.example.com, sub.cdn.example.com:8080, https://example.com/path
const DOMAIN_LIKE_RE = /^(?:https?:\/\/)?(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d+)?(?:\/\S*)?$/i;

/**
 * Split input text into segments by newlines and semicolons.
 * Handles CSP-snippet format (semicolons) and table format (newlines).
 */
function textToSegments(text: string): string[] {
  // Split by newlines first
  const lines = text.split('\n');
  const segments: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // If the line contains semicolons AND starts with or contains a CSP directive,
    // treat semicolons as segment separators (CSP-snippet format)
    const hasSemicolons = trimmed.includes(';');
    const tokens = trimmed.split(/\s+/);
    const startsWithDirective = CSP_DIRECTIVE_RE.test(tokens[0]?.replace(/[,;]$/g, '') || '');

    if (hasSemicolons && startsWithDirective) {
      // CSP-snippet: split by semicolons
      for (const part of trimmed.split(';')) {
        const p = part.trim();
        if (p) segments.push(p);
      }
    } else {
      segments.push(trimmed);
    }
  }

  return segments;
}

/**
 * Returns true for CSP keywords and scheme-sources that should be ignored
 * when collecting description parts (e.g., 'self', 'unsafe-inline', data:, blob:, wss:)
 */
function isCspKeywordOrScheme(token: string): boolean {
  const lower = token.toLowerCase().replace(/[,;]$/g, '');
  // Quoted keywords: 'self', 'unsafe-inline', 'unsafe-eval', 'none', 'strict-dynamic', etc.
  if (/^'[a-z][a-z-]*'$/.test(lower)) return true;
  // Scheme-sources: data:, blob:, https:, http:, wss:, ws:, etc.
  if (/^[a-z][a-z0-9+.-]*:$/.test(lower)) return true;
  return false;
}

/**
 * Checks if a string looks like a valid domain for CSP purposes.
 * Handles: *.example.com, cdn.example.com, https://*.example.com, wss://*.example.com
 */
function isValidDomain(token: string): boolean {
  const cleaned = token.replace(/^['"]|['"]$/g, '').replace(/[,;]$/g, '');
  // Strip scheme for validation (https://, wss://, etc.)
  const schemeFree = cleaned.replace(/^(?:https?|wss?):\/\//i, '').replace(/^\/\//, '');
  // Must have a dot (real domain) and no URL-encoded chars or spaces
  if (!schemeFree.includes('.') || /%[0-9a-f]{2}/i.test(schemeFree)) return false;
  // Wildcard domain
  if (/^\*\.[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?:\/\S*)?$/i.test(schemeFree)) return true;
  // Regular domain or URL
  if (DOMAIN_LIKE_RE.test(cleaned)) return true;
  // Domain with non-http scheme (wss://, ws://)
  if (/^(?:wss?):\/\//i.test(cleaned) && DOMAIN_LIKE_RE.test('https://' + schemeFree)) return true;
  return false;
}

/**
 * Parses domain ↔ directive mappings from various formats:
 *
 * 1. Table format (any column order, tab/space separated):
 *      *.example.com  script-src, connect-src  Description
 *
 * 2. CSP-snippet format (directives first, semicolons between):
 *      script-src 'unsafe-inline' https://*.example.com;
 *      connect-src https://*.example.com wss://*.example.com;
 *
 * Strategy: split by semicolons and newlines into segments,
 * then for each segment find CSP directives and valid domains.
 */
export function parseServiceTable(tableText: string): CspTableEntry[] {
  const entries: CspTableEntry[] = [];

  // Split into segments by both newlines and semicolons
  const segments = textToSegments(tableText);

  for (const segment of segments) {
    // Tokenize: split by tab, then flatten by comma/space
    const rawTokens = segment.split(/[\t]/).flatMap((seg) =>
      seg.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)
    );

    const directives: string[] = [];
    const cspValues: string[] = [];
    const descParts: string[] = [];

    for (const token of rawTokens) {
      const lower = token.toLowerCase().replace(/[,;]$/g, '');

      // Is it a CSP directive?
      if (CSP_DIRECTIVE_RE.test(lower)) {
        directives.push(lower);
        continue;
      }

      // Is it a valid domain? (strip scheme for matching, keep for extraction)
      const cleaned = token.replace(/^['"]|['"]$/g, '').replace(/[,;]$/g, '');
      if (isValidDomain(cleaned)) {
        const domain = extractDomain(cleaned);
        if (domain && domain.length >= 3 && domain.includes('.')) {
          // For wss:// / ws:// domains, preserve the scheme in the CSP value
          const hasWsScheme = /^wss?:\/\//i.test(cleaned);
          const cspValue = hasWsScheme ? cleaned.replace(/[,;/]$/g, '').replace(/\/+$/, '') : domain;
          if (!cspValues.includes(cspValue)) cspValues.push(cspValue);
          continue;
        }
      }

      // Is it a CSP keyword or scheme-source? ('unsafe-inline', data:, blob:, etc.)
      if (isCspKeywordOrScheme(lower)) {
        if (!cspValues.includes(lower)) cspValues.push(lower);
        continue;
      }

      // Everything else is description
      descParts.push(token);
    }

    // Create one entry per directive (with all values)
    if (directives.length > 0 && cspValues.length > 0) {
      for (const directive of directives) {
        entries.push({
          directive,
          values: [...cspValues],
          description: descParts.join(' '),
        });
      }
    }
  }

  return entries;
}

/**
 * Merges a service table into an existing CSP.
 */
export function mergeServiceIntoCsp(
  currentCspStr: string,
  entries: CspTableEntry[]
): { csp: string; warnings: string[]; addedCount: number; newTokens: Set<string> } {
  const parsed = parseCsp(currentCspStr);
  const warnings: string[] = [];
  const newTokens = new Set<string>();
  let addedCount = 0;

  for (const entry of entries) {
    for (const value of entry.values) {
      // Check domain-specific warnings (only for domain-like values)
      if (value.includes('.')) {
        const domainWarnings = checkDomainWarnings(value);
        warnings.push(...domainWarnings.map((w) => `${value}: ${w}`));
      }

      if (!parsed.directives[entry.directive]) {
        parsed.directives[entry.directive] = [value];
        newTokens.add(value);
        addedCount++;
      } else {
        const existing = parsed.directives[entry.directive]!;
        const coveredBy = existing.includes(value) ? value : findCoveringValue(value, existing);
        if (!coveredBy) {
          existing.push(value);
          newTokens.add(value);
          addedCount++;
        } else if (coveredBy !== value) {
          // Only show info when a wildcard covers a specific domain (not exact duplicates)
          warnings.push(`${value} already covered by ${coveredBy} in ${entry.directive} — skipped`);
        }
      }
    }
  }

  return {
    csp: parsed.convertToString(),
    warnings: [...new Set(warnings)],
    addedCount,
    newTokens,
  };
}

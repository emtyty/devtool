// ── URL component encode/decode ────────────────────────────────────────────────
// Uses encodeURIComponent / decodeURIComponent — encodes ALL special chars
// including & = ? / # @. Best for encoding individual query param values.

export function encodeComponent(input: string): string {
  if (!input) return '';
  try {
    return encodeURIComponent(input);
  } catch {
    return '⚠ Failed to encode';
  }
}

export function decodeComponent(input: string): string {
  if (!input) return '';
  try {
    return decodeURIComponent(input.trim());
  } catch {
    return '⚠ Invalid percent-encoded string';
  }
}

// ── Full URL encode/decode ─────────────────────────────────────────────────────
// Uses encodeURI / decodeURI — preserves structural URL chars: : / ? # [ ] @ ! $ & ' ( ) * + , ; =
// Best for encoding a full URL while keeping its structure intact.

export function encodeFullUrl(input: string): string {
  if (!input) return '';
  try {
    return encodeURI(input.trim());
  } catch {
    return '⚠ Failed to encode';
  }
}

export function decodeFullUrl(input: string): string {
  if (!input) return '';
  try {
    return decodeURI(input.trim());
  } catch {
    return '⚠ Invalid URL-encoded string';
  }
}

// ── Query string parsing ───────────────────────────────────────────────────────

export interface QueryParam {
  key: string;
  value: string;
  decodedKey: string;
  decodedValue: string;
}

/**
 * Parse a URL or a raw query string into key/value pairs.
 * Handles full URLs (extracts the search portion) and bare query strings
 * with or without a leading `?`.
 */
export function parseQueryString(input: string): QueryParam[] {
  if (!input.trim()) return [];

  let search = input.trim();

  // Strip full URL down to search portion
  try {
    const url = new URL(search);
    search = url.search;
  } catch {
    // Not a full URL — treat as raw query string
  }

  // Remove leading `?`
  if (search.startsWith('?')) search = search.slice(1);

  if (!search) return [];

  return search.split('&').map(pair => {
    const eqIdx = pair.indexOf('=');
    const rawKey = eqIdx === -1 ? pair : pair.slice(0, eqIdx);
    const rawValue = eqIdx === -1 ? '' : pair.slice(eqIdx + 1);

    let decodedKey = rawKey;
    let decodedValue = rawValue;
    try { decodedKey = decodeURIComponent(rawKey.replace(/\+/g, ' ')); } catch { /* leave as-is */ }
    try { decodedValue = decodeURIComponent(rawValue.replace(/\+/g, ' ')); } catch { /* leave as-is */ }

    return { key: rawKey, value: rawValue, decodedKey, decodedValue };
  });
}

/**
 * Build a percent-encoded query string from decoded key/value pairs.
 */
export function buildQueryString(params: Array<{ key: string; value: string }>): string {
  return params
    .filter(p => p.key.trim())
    .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
}

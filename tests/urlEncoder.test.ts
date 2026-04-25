import { describe, it, expect } from 'vitest';
import {
  encodeComponent,
  decodeComponent,
  encodeFullUrl,
  decodeFullUrl,
  parseQueryString,
  buildQueryString,
} from '../utils/urlEncoder';

// ── encodeComponent ────────────────────────────────────────────────────────────

describe('encodeComponent', () => {
  it('encodes spaces as %20', () => {
    expect(encodeComponent('hello world')).toBe('hello%20world');
  });

  it('encodes all special URL structural chars', () => {
    expect(encodeComponent('a&b=c?d/e#f@g')).toBe('a%26b%3Dc%3Fd%2Fe%23f%40g');
  });

  it('preserves unreserved chars (letters, digits, - _ . ~)', () => {
    expect(encodeComponent('abc-123_foo.bar~')).toBe('abc-123_foo.bar~');
  });

  it('encodes UTF-8 / multi-byte characters', () => {
    expect(encodeComponent('日本語')).toBe('%E6%97%A5%E6%9C%AC%E8%AA%9E');
  });

  it('encodes emoji', () => {
    expect(encodeComponent('😀')).toBe('%F0%9F%98%80');
  });

  it('returns empty string for empty input', () => {
    expect(encodeComponent('')).toBe('');
  });
});

// ── decodeComponent ────────────────────────────────────────────────────────────

describe('decodeComponent', () => {
  it('decodes %20 as space', () => {
    expect(decodeComponent('hello%20world')).toBe('hello world');
  });

  it('decodes all special chars encoded by encodeComponent', () => {
    expect(decodeComponent('a%26b%3Dc%3Fd%2Fe%23f%40g')).toBe('a&b=c?d/e#f@g');
  });

  it('decodes UTF-8 sequences', () => {
    expect(decodeComponent('%E6%97%A5%E6%9C%AC%E8%AA%9E')).toBe('日本語');
  });

  it('decodes emoji', () => {
    expect(decodeComponent('%F0%9F%98%80')).toBe('😀');
  });

  it('trims surrounding whitespace before decoding', () => {
    expect(decodeComponent('  hello%20world  ')).toBe('hello world');
  });

  it('returns an error string for invalid percent sequences', () => {
    expect(decodeComponent('%GG')).toMatch(/⚠/);
  });

  it('returns empty string for empty input', () => {
    expect(decodeComponent('')).toBe('');
  });

  it('is the inverse of encodeComponent for arbitrary text', () => {
    const original = 'foo bar & baz=qux / hello#world@test';
    expect(decodeComponent(encodeComponent(original))).toBe(original);
  });
});

// ── encodeFullUrl ──────────────────────────────────────────────────────────────

describe('encodeFullUrl', () => {
  it('preserves scheme, host, path, and query structural chars', () => {
    const url = 'https://example.com/path?q=1&lang=en#section';
    expect(encodeFullUrl(url)).toBe(url);
  });

  it('encodes spaces in the path', () => {
    expect(encodeFullUrl('https://example.com/hello world')).toBe('https://example.com/hello%20world');
  });

  it('encodes Unicode in query values but preserves delimiters', () => {
    const input = 'https://example.com/?q=日本語';
    expect(encodeFullUrl(input)).toBe('https://example.com/?q=%E6%97%A5%E6%9C%AC%E8%AA%9E');
  });

  it('returns empty string for empty input', () => {
    expect(encodeFullUrl('')).toBe('');
  });
});

// ── decodeFullUrl ──────────────────────────────────────────────────────────────

describe('decodeFullUrl', () => {
  it('decodes percent-encoded path segment', () => {
    expect(decodeFullUrl('https://example.com/hello%20world')).toBe('https://example.com/hello world');
  });

  it('decodes encoded query value while preserving structure', () => {
    expect(decodeFullUrl('https://example.com/?q=%E6%97%A5%E6%9C%AC%E8%AA%9E')).toBe(
      'https://example.com/?q=日本語'
    );
  });

  it('returns error string for a malformed sequence', () => {
    expect(decodeFullUrl('%uXXXX')).toMatch(/⚠/);
  });

  it('returns empty string for empty input', () => {
    expect(decodeFullUrl('')).toBe('');
  });

  it('is the inverse of encodeFullUrl for a full URL', () => {
    const url = 'https://example.com/search?q=hello world&lang=日本語';
    expect(decodeFullUrl(encodeFullUrl(url))).toBe(url);
  });
});

// ── parseQueryString ───────────────────────────────────────────────────────────

describe('parseQueryString', () => {
  it('parses a simple key=value pair', () => {
    const result = parseQueryString('foo=bar');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'foo', value: 'bar', decodedKey: 'foo', decodedValue: 'bar' });
  });

  it('parses multiple pairs', () => {
    const result = parseQueryString('a=1&b=2&c=3');
    expect(result).toHaveLength(3);
    expect(result.map(p => p.decodedKey)).toEqual(['a', 'b', 'c']);
    expect(result.map(p => p.decodedValue)).toEqual(['1', '2', '3']);
  });

  it('decodes percent-encoded values', () => {
    const result = parseQueryString('q=hello%20world');
    expect(result[0].decodedValue).toBe('hello world');
  });

  it('decodes + as space in values', () => {
    const result = parseQueryString('q=hello+world');
    expect(result[0].decodedValue).toBe('hello world');
  });

  it('handles a leading ?', () => {
    const result = parseQueryString('?foo=bar');
    expect(result).toHaveLength(1);
    expect(result[0].decodedKey).toBe('foo');
  });

  it('extracts query string from a full URL', () => {
    const result = parseQueryString('https://example.com/search?q=test&page=2');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ decodedKey: 'q', decodedValue: 'test' });
    expect(result[1]).toMatchObject({ decodedKey: 'page', decodedValue: '2' });
  });

  it('handles a key with no value', () => {
    const result = parseQueryString('flag');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ decodedKey: 'flag', decodedValue: '' });
  });

  it('handles empty value (key=)', () => {
    const result = parseQueryString('key=');
    expect(result[0].decodedValue).toBe('');
  });

  it('decodes Unicode query params', () => {
    const result = parseQueryString('lang=%E6%97%A5%E6%9C%AC%E8%AA%9E');
    expect(result[0].decodedValue).toBe('日本語');
  });

  it('returns empty array for empty input', () => {
    expect(parseQueryString('')).toEqual([]);
    expect(parseQueryString('   ')).toEqual([]);
  });

  it('returns empty array for a URL with no query string', () => {
    expect(parseQueryString('https://example.com/')).toEqual([]);
  });
});

// ── buildQueryString ───────────────────────────────────────────────────────────

describe('buildQueryString', () => {
  it('builds a simple key=value pair', () => {
    expect(buildQueryString([{ key: 'foo', value: 'bar' }])).toBe('foo=bar');
  });

  it('joins multiple pairs with &', () => {
    expect(buildQueryString([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ])).toBe('a=1&b=2');
  });

  it('percent-encodes keys and values', () => {
    expect(buildQueryString([{ key: 'my key', value: 'hello world' }])).toBe('my%20key=hello%20world');
  });

  it('encodes special chars in values', () => {
    expect(buildQueryString([{ key: 'q', value: 'a&b=c' }])).toBe('q=a%26b%3Dc');
  });

  it('skips rows with blank keys', () => {
    expect(buildQueryString([
      { key: '', value: 'orphan' },
      { key: 'x', value: '1' },
    ])).toBe('x=1');
  });

  it('returns empty string for no valid rows', () => {
    expect(buildQueryString([{ key: '', value: 'no-key' }])).toBe('');
    expect(buildQueryString([])).toBe('');
  });

  it('roundtrips with parseQueryString', () => {
    const original = [
      { key: 'q', value: 'hello world' },
      { key: 'lang', value: '日本語' },
    ];
    const qs = buildQueryString(original);
    const parsed = parseQueryString(qs);
    expect(parsed.map(p => ({ key: p.decodedKey, value: p.decodedValue }))).toEqual(original);
  });
});

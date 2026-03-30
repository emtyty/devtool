/**
 * Extracts values from a JSON structure by a dot-notation path.
 * Automatically traverses arrays at any depth.
 *
 * Example: path "hits.hits._source.keyword_productId" or "_source.keyword_productId"
 * will find all matching leaf values across nested arrays.
 */
export function extractByPath(data: unknown, path: string): unknown[] {
  const parts = path
    .split('.')
    .map(p => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];

  const results: unknown[] = [];

  function resolve(node: unknown, remaining: string[]): void {
    if (remaining.length === 0) {
      // Leaf reached — collect scalar values or array of scalars
      if (Array.isArray(node)) {
        node.forEach(v => results.push(v));
      } else {
        results.push(node);
      }
      return;
    }

    if (Array.isArray(node)) {
      // Traverse each array element with the same remaining path
      node.forEach(item => resolve(item, remaining));
      return;
    }

    if (node !== null && typeof node === 'object') {
      const key = remaining[0];
      const rest = remaining.slice(1);

      if (Object.prototype.hasOwnProperty.call(node, key)) {
        // Key found — follow the path
        resolve((node as Record<string, unknown>)[key], rest);
      } else {
        // Key not found at this level — search deeper in all child values
        Object.values(node as Record<string, unknown>).forEach(child =>
          resolve(child, remaining)
        );
      }
    }
  }

  resolve(data, parts);
  return results;
}

export function formatAsPlainText(values: unknown[]): string {
  return values.map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n');
}

export function formatAsJsonArray(values: unknown[]): string {
  return JSON.stringify(values, null, 2);
}

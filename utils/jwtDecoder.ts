/**
 * JWT Decoder — Pure logic, no React dependency.
 * Shared between web app (JwtDecode.tsx) and MCP server.
 */

export const KNOWN_CLAIMS: Record<string, string> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expires At',
  nbf: 'Not Before',
  iat: 'Issued At',
  jti: 'JWT ID',
};

export const TIME_CLAIMS = new Set(['exp', 'nbf', 'iat']);

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

export function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  // Works in both browser (atob) and Node.js (Buffer)
  if (typeof atob === 'function') {
    return atob(padded);
  }
  return Buffer.from(padded, 'base64').toString('binary');
}

export function formatTimestamp(value: number): string {
  try {
    const date = new Date(value * 1000);
    const offsetMin = -date.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offsetMin) % 60).padStart(2, '0');
    const gmt = `GMT${sign}${hh}:${mm}`;
    return `${date.toLocaleString()} ${gmt}`;
  } catch {
    return String(value);
  }
}

export function getTokenStatus(payload: Record<string, unknown>): { label: string; color: string } | null {
  const exp = payload['exp'];
  if (typeof exp !== 'number') return null;
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) {
    return { label: 'EXPIRED', color: 'text-red-400 bg-red-900/20 border-red-500/30' };
  }
  return { label: 'VALID', color: 'text-green-400 bg-green-900/20 border-green-500/30' };
}

export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid JWT: expected 3 parts, got ${parts.length}`);
  }
  const header = JSON.parse(base64UrlDecode(parts[0]));
  const payload = JSON.parse(base64UrlDecode(parts[1]));
  return { header, payload, signature: parts[2] };
}

/** Builds a payload string with timestamp claims annotated as comments. */
export function buildAnnotatedPayload(payload: Record<string, unknown>): string {
  const lines = JSON.stringify(payload, null, 2).split('\n');
  return lines.map(line => {
    const match = line.match(/^(\s*"(\w+)":\s*)(-?\d+)(,?)$/);
    if (match) {
      const [, prefix, key, numStr, comma] = match;
      if (TIME_CLAIMS.has(key)) {
        const human = formatTimestamp(Number(numStr));
        return `${prefix}${numStr}${comma} // ${human}`;
      }
    }
    return line;
  }).join('\n');
}

/**
 * Epoch Converter — Pure logic, no React dependency.
 * Shared between web app (EpochConverter.tsx) and MCP server.
 */

export function getUtcOffset(tz: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now);
    const offset = parts.find(p => p.type === 'timeZoneName')?.value || '';
    return offset.replace('GMT', 'UTC');
  } catch { return ''; }
}

export function fmtDate(d: Date, zone: string): string {
  try {
    return d.toLocaleString('en-US', {
      timeZone: zone,
      weekday: 'short', year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      timeZoneName: 'short',
    });
  } catch { return `⚠ Unknown timezone: ${zone}`; }
}

export function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const abs = Math.abs(diffMs);
  const suffix = diffMs > 0 ? 'ago' : 'from now';
  if (abs < 60_000) return `${Math.floor(abs / 1000)}s ${suffix}`;
  if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}m ${suffix}`;
  if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)}h ${suffix}`;
  if (abs < 31_536_000_000) return `${Math.floor(abs / 86_400_000)}d ${suffix}`;
  return `${(abs / 31_536_000_000).toFixed(1)}y ${suffix}`;
}

export function epochToDate(input: string, tz: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const num = Number(trimmed);
  if (isNaN(num)) return '⚠ Invalid number';

  const ms = trimmed.length <= 10 ? num * 1000 : num;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '⚠ Invalid timestamp';

  const unitNote = trimmed.length <= 10 ? '(detected: seconds)' : '(detected: milliseconds)';
  return [
    `Input:          ${trimmed} ${unitNote}`,
    `Milliseconds:   ${ms}`,
    `Seconds:        ${Math.floor(ms / 1000)}`,
    ``,
    `ISO 8601:       ${d.toISOString()}`,
    `UTC:            ${fmtDate(d, 'UTC')}`,
    `${tz}:${' '.repeat(Math.max(1, 16 - tz.length))}${fmtDate(d, tz)}`,
    ``,
    `Relative:       ${relativeTime(d)}`,
  ].join('\n');
}

export function dateToEpoch(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return '⚠ Could not parse date string';
  const ms = d.getTime();
  return [
    `Parsed:         ${d.toISOString()}`,
    `Epoch (s):      ${Math.floor(ms / 1000)}`,
    `Epoch (ms):     ${ms}`,
  ].join('\n');
}

export function getCurrentTimestamps(): string {
  const now = Date.now();
  return [
    `Now (s):        ${Math.floor(now / 1000)}`,
    `Now (ms):       ${now}`,
    `ISO 8601:       ${new Date(now).toISOString()}`,
  ].join('\n');
}

/**
 * Cron Parser — Pure logic, no React dependency.
 * Shared between web app (CronBuilder.tsx) and MCP server.
 */

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type FieldMode = 'every' | 'specific' | 'range' | 'interval';

export interface FieldState {
  mode: FieldMode;
  specific: number[];
  rangeStart: number;
  rangeEnd: number;
  interval: number;
}

export interface CronField {
  label: string;
  min: number;
  max: number;
  names?: string[];
}

export const CRON_FIELDS: CronField[] = [
  { label: 'Minute', min: 0, max: 59 },
  { label: 'Hour', min: 0, max: 23 },
  { label: 'Day of Month', min: 1, max: 31 },
  { label: 'Month', min: 1, max: 12, names: MONTH_NAMES },
  { label: 'Day of Week', min: 0, max: 6, names: DOW_NAMES },
];

export function parseFieldToken(token: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  if (token === '*') {
    for (let i = min; i <= max; i++) values.add(i);
    return values;
  }
  const parts = token.split(',');
  for (const part of parts) {
    const stepMatch = part.match(/^(\*|(\d+)-(\d+))\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[4], 10);
      let start = min;
      let end = max;
      if (stepMatch[2] !== undefined) {
        start = parseInt(stepMatch[2], 10);
        end = parseInt(stepMatch[3], 10);
      }
      for (let i = start; i <= end; i += step) values.add(i);
      continue;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const a = parseInt(rangeMatch[1], 10);
      const b = parseInt(rangeMatch[2], 10);
      for (let i = a; i <= b; i++) values.add(i);
      continue;
    }
    const num = parseInt(part, 10);
    if (!isNaN(num)) values.add(num);
  }
  return values;
}

export function parseCronExpression(expr: string): Set<number>[] | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  try {
    return parts.map((token, i) => parseFieldToken(token, CRON_FIELDS[i].min, CRON_FIELDS[i].max));
  } catch {
    return null;
  }
}

export function fieldStateToToken(state: FieldState, _field: CronField): string {
  switch (state.mode) {
    case 'every':
      return '*';
    case 'specific':
      return state.specific.length > 0 ? state.specific.sort((a, b) => a - b).join(',') : '*';
    case 'range':
      return `${state.rangeStart}-${state.rangeEnd}`;
    case 'interval':
      return `*/${state.interval}`;
  }
}

export function tokenToFieldState(token: string, field: CronField): FieldState {
  const def: FieldState = {
    mode: 'every',
    specific: [],
    rangeStart: field.min,
    rangeEnd: field.max,
    interval: 1,
  };
  if (token === '*') return def;
  const intervalMatch = token.match(/^\*\/(\d+)$/);
  if (intervalMatch) {
    return { ...def, mode: 'interval', interval: parseInt(intervalMatch[1], 10) };
  }
  const rangeMatch = token.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    return { ...def, mode: 'range', rangeStart: parseInt(rangeMatch[1], 10), rangeEnd: parseInt(rangeMatch[2], 10) };
  }
  const nums = token.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
  if (nums.length > 0) {
    return { ...def, mode: 'specific', specific: nums };
  }
  return def;
}

export function getNextRuns(expr: string, count: number): Date[] {
  const parsed = parseCronExpression(expr);
  if (!parsed) return [];
  const [minutes, hours, doms, months, dows] = parsed;
  const runs: Date[] = [];
  const now = new Date();
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);

  const maxIterations = 525960;
  for (let i = 0; i < maxIterations && runs.length < count; i++) {
    const mo = cursor.getMonth() + 1;
    const dom = cursor.getDate();
    const dow = cursor.getDay();
    const hr = cursor.getHours();
    const mn = cursor.getMinutes();

    if (months.has(mo) && doms.has(dom) && dows.has(dow) && hours.has(hr) && minutes.has(mn)) {
      runs.push(new Date(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return runs;
}

export function describeField(token: string, fieldIndex: number): string {
  if (token === '*') return '';

  const intervalMatch = token.match(/^\*\/(\d+)$/);
  if (intervalMatch) {
    const n = intervalMatch[1];
    switch (fieldIndex) {
      case 0: return `every ${n} minutes`;
      case 1: return `every ${n} hours`;
      case 2: return `every ${n} days`;
      case 3: return `every ${n} months`;
      case 4: return `every ${n} days of the week`;
    }
  }

  const rangeMatch = token.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1], 10);
    const b = parseInt(rangeMatch[2], 10);
    if (fieldIndex === 4) return `${DOW_NAMES[a]} through ${DOW_NAMES[b]}`;
    if (fieldIndex === 3) return `${MONTH_NAMES[a - 1]} through ${MONTH_NAMES[b - 1]}`;
    return `${a}-${b}`;
  }

  const nums = token.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
  if (fieldIndex === 4) return nums.map(n => DOW_NAMES[n] ?? n).join(', ');
  if (fieldIndex === 3) return nums.map(n => MONTH_NAMES[n - 1] ?? n).join(', ');
  return nums.join(', ');
}

export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 'Invalid cron expression';
  const [minTok, hrTok, domTok, moTok, dowTok] = parts;

  let timeDesc = '';
  if (minTok.startsWith('*/')) {
    timeDesc = describeField(minTok, 0);
  } else if (hrTok.startsWith('*/')) {
    const minVal = minTok === '0' ? '' : ` at minute ${minTok}`;
    timeDesc = `${describeField(hrTok, 1)}${minVal}`;
  } else if (hrTok === '*' && minTok === '*') {
    timeDesc = 'every minute';
  } else if (hrTok === '*') {
    timeDesc = `every hour at minute ${minTok}`;
  } else {
    const hours = hrTok.split(',').map(s => parseInt(s, 10));
    const mins = minTok.split(',').map(s => parseInt(s, 10));
    const times = hours.map(h => {
      return mins.map(m => {
        const period = h >= 12 ? 'PM' : 'AM';
        const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
      }).join(', ');
    }).join(' and ');
    timeDesc = `at ${times}`;
  }

  let dateDesc = '';
  if (dowTok !== '*') {
    if (dowTok === '1-5') {
      dateDesc = 'every weekday';
    } else if (dowTok === '0-6' || dowTok === '*') {
      dateDesc = '';
    } else {
      dateDesc = `on ${describeField(dowTok, 4)}`;
    }
  }
  if (domTok !== '*') {
    const domDesc = describeField(domTok, 2);
    dateDesc = `on day ${domDesc} of the month`;
  }
  if (moTok !== '*') {
    const moDesc = describeField(moTok, 3);
    dateDesc += ` in ${moDesc}`;
  }

  const result = [dateDesc, timeDesc].filter(Boolean).join(', ');
  return result.charAt(0).toUpperCase() + result.slice(1);
}

export function validateCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return `Expected 5 fields, got ${parts.length}`;
  const fieldNames = ['Minute', 'Hour', 'Day of Month', 'Month', 'Day of Week'];
  for (let i = 0; i < 5; i++) {
    const token = parts[i];
    const { min, max } = CRON_FIELDS[i];
    const segments = token.split(',');
    for (const seg of segments) {
      if (seg === '*') continue;
      if (/^\*\/\d+$/.test(seg)) {
        const step = parseInt(seg.split('/')[1], 10);
        if (step < 1) return `${fieldNames[i]}: step must be >= 1`;
        continue;
      }
      if (/^\d+-\d+$/.test(seg)) {
        const [a, b] = seg.split('-').map(Number);
        if (a < min || a > max || b < min || b > max) return `${fieldNames[i]}: range ${a}-${b} out of bounds (${min}-${max})`;
        if (a > b) return `${fieldNames[i]}: range start ${a} > end ${b}`;
        continue;
      }
      if (/^\d+-\d+\/\d+$/.test(seg)) continue;
      if (/^\d+$/.test(seg)) {
        const n = parseInt(seg, 10);
        if (n < min || n > max) return `${fieldNames[i]}: value ${n} out of bounds (${min}-${max})`;
        continue;
      }
      return `${fieldNames[i]}: invalid token "${seg}"`;
    }
  }
  return null;
}

// ── Excel-style AutoFill: continue a series from a single source cell ──
//
// A "stepper" maps a signed offset from the source (+1 = next cell below, -1 = cell above)
// to the value that belongs there. Detectors run in order; the first match wins.

export type FillMode = 'copy' | 'series';
export type FillDirection = 1 | -1;

export interface FillOptions {
  /** Read ambiguous slash dates (3/4/2024) as day/month instead of month/day */
  dayFirst?: boolean;
}

type Stepper = (offset: number) => string;

const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NAME_LISTS = [DAYS_FULL, DAYS_SHORT, MONTHS_FULL, MONTHS_SHORT];

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})([T ].*)?$/;
const ISO_MONTH_RE = /^(\d{4})-(\d{2})$/;
const SLASH_DATE_RE = /^(\d{1,2})([/.])(\d{1,2})\2(\d{4})$/;
const QUARTER_RE = /^(Q|Qtr|Quarter ?)([1-4])$/i;
const PLAIN_NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.(\d+))?$/;
const TRAILING_NUMBER_RE = /^(.*?)(\d+)(\D*)$/;
const ORDINAL_RE = /^(st|nd|rd|th)$/i;

const mod = (n: number, m: number) => ((n % m) + m) % m;
const pad = (n: number, width: number) => String(n).padStart(width, '0');
/** Digits keep their width only when written zero-padded ("007", "01"); otherwise they grow/shrink naturally */
const padWidth = (digits: string) => (digits.length > 1 && digits.startsWith('0') ? digits.length : 1);

/** Copy the casing style (UPPER / lower / as-listed) of `like` onto `word` */
function matchCase(word: string, like: string): string {
  if (like === like.toUpperCase() && like !== like.toLowerCase()) return word.toUpperCase();
  if (like === like.toLowerCase()) return word.toLowerCase();
  return word;
}

// ── Dates ────────────────────────────────────────────────────────

function isValidYmd(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function addDays(y: number, m: number, d: number, days: number): [number, number, number] {
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

/** 2024-01-31 → 2024-02-01 (any time part after the date is kept as-is) */
function isoDateStepper(value: string): Stepper | null {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isValidYmd(y, mo, d)) return null;
  const time = m[4] ?? '';
  return (offset) => {
    const [ny, nm, nd] = addDays(y, mo, d, offset);
    return `${pad(ny, 4)}-${pad(nm, 2)}-${pad(nd, 2)}${time}`;
  };
}

/** 2024-12 → 2025-01 */
function isoMonthStepper(value: string): Stepper | null {
  const m = ISO_MONTH_RE.exec(value);
  if (!m) return null;
  const [y, mo] = [Number(m[1]), Number(m[2])];
  if (mo < 1 || mo > 12) return null;
  return (offset) => {
    const total = y * 12 + (mo - 1) + offset;
    return `${pad(Math.floor(total / 12), 4)}-${pad(mod(total, 12) + 1, 2)}`;
  };
}

/** 1/31/2024 → 2/1/2024, 31.01.2024 → 01.02.2024 — keeps separator and zero padding */
function slashDateStepper(value: string, dayFirst: boolean): Stepper | null {
  const m = SLASH_DATE_RE.exec(value);
  if (!m) return null;
  const [, a, sep, b, yStr] = m;
  const [first, second, y] = [Number(a), Number(b), Number(yStr)];
  // Unambiguous when one part can't be a month; dotted dates are day-first; otherwise follow the locale
  const isDayFirst = first > 12 ? true : second > 12 ? false : sep === '.' ? true : dayFirst;
  const [d, mo] = isDayFirst ? [first, second] : [second, first];
  if (!isValidYmd(y, mo, d)) return null;
  // dd/mm style when any part is zero-padded or both are two digits; otherwise d/m
  const width = padWidth(a) > 1 || padWidth(b) > 1 || (a.length === 2 && b.length === 2) ? 2 : 1;
  return (offset) => {
    const [ny, nm, nd] = addDays(y, mo, d, offset);
    const [ds, ms] = [pad(nd, width), pad(nm, width)];
    return isDayFirst ? `${ds}${sep}${ms}${sep}${ny}` : `${ms}${sep}${ds}${sep}${ny}`;
  };
}

// ── Cyclic lists ─────────────────────────────────────────────────

/** Mon → Tue, January → February, wrapping around */
function nameListStepper(value: string): Stepper | null {
  const lower = value.toLowerCase();
  for (const list of NAME_LISTS) {
    const i = list.findIndex((w) => w.toLowerCase() === lower);
    if (i >= 0) return (offset) => matchCase(list[mod(i + offset, list.length)], value);
  }
  return null;
}

/** Q1 → Q2 → Q3 → Q4 → Q1 */
function quarterStepper(value: string): Stepper | null {
  const m = QUARTER_RE.exec(value);
  if (!m) return null;
  return (offset) => `${m[1]}${mod(Number(m[2]) - 1 + offset, 4) + 1}`;
}

// ── Numbers ──────────────────────────────────────────────────────

/** 5 → 6, 1.50 → 2.50 (keeps decimal places, exact for long integers) */
function numberStepper(value: string): Stepper | null {
  const m = PLAIN_NUMBER_RE.exec(value);
  if (!m) return null;
  const decimals = m[1]?.length ?? 0;
  if (decimals === 0) return (offset) => (BigInt(value) + BigInt(offset)).toString();
  const n = Number(value);
  return (offset) => (n + offset).toFixed(decimals);
}

function ordinalSuffix(n: bigint): string {
  const [n10, n100] = [n % 10n, n % 100n];
  if (n100 >= 11n && n100 <= 13n) return 'th';
  return n10 === 1n ? 'st' : n10 === 2n ? 'nd' : n10 === 3n ? 'rd' : 'th';
}

/** Item 1 → Item 2, A0001 → A0002, v1.9 → v1.10, 1st → 2nd — steps the last number in the text */
function textNumberStepper(value: string): Stepper | null {
  const m = TRAILING_NUMBER_RE.exec(value);
  if (!m) return null;
  const [, prefix, digits, suffix] = m;
  const start = BigInt(digits);
  const width = padWidth(digits);
  const isOrdinal = ORDINAL_RE.test(suffix);
  return (offset) => {
    let next = start + BigInt(offset);
    if (next < 0n) next = -next; // Excel mirrors past zero: Item 1 → Item 0 → Item 1
    const tail = isOrdinal ? matchCase(ordinalSuffix(next), suffix) : suffix;
    return `${prefix}${next.toString().padStart(width, '0')}${tail}`;
  };
}

// ── Public API ───────────────────────────────────────────────────

function getStepper(value: string, opts: FillOptions): Stepper | null {
  return (
    isoDateStepper(value) ??
    isoMonthStepper(value) ??
    slashDateStepper(value, opts.dayFirst ?? false) ??
    quarterStepper(value) ??
    nameListStepper(value) ??
    numberStepper(value) ??
    textNumberStepper(value)
  );
}

/** Whether the value has a pattern that can continue as a series */
export function canFillSeries(value: string, opts: FillOptions = {}): boolean {
  return getStepper(value, opts) !== null;
}

/**
 * Excel's choice for a single source cell: a plain number copies, anything else with a
 * pattern continues as a series. `toggled` (Ctrl/Alt held while dragging) flips it.
 */
export function resolveFillMode(value: string, toggled: boolean, opts: FillOptions = {}): FillMode {
  if (!canFillSeries(value, opts)) return 'copy';
  const mode: FillMode = PLAIN_NUMBER_RE.test(value) ? 'copy' : 'series';
  if (!toggled) return mode;
  return mode === 'copy' ? 'series' : 'copy';
}

/** Value for the cell `offset` steps from the source (negative = above) */
export function fillValueAt(value: string, offset: number, mode: FillMode, opts: FillOptions = {}): string {
  const stepper = mode === 'series' ? getStepper(value, opts) : null;
  return stepper ? stepper(offset) : value;
}

/** Values for `count` cells moving away from the source, nearest first */
export function buildFillValues(
  value: string,
  count: number,
  direction: FillDirection,
  mode: FillMode,
  opts: FillOptions = {}
): string[] {
  const stepper = mode === 'series' ? getStepper(value, opts) : null;
  return Array.from({ length: count }, (_, i) => (stepper ? stepper(direction * (i + 1)) : value));
}

/** Whether the locale writes dates day-before-month (used to read ambiguous slash dates) */
export function isDayFirstLocale(locale?: string): boolean {
  const parts = new Intl.DateTimeFormat(locale).formatToParts(new Date(Date.UTC(2000, 11, 31)));
  return parts.findIndex((p) => p.type === 'day') < parts.findIndex((p) => p.type === 'month');
}

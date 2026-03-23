/**
 * Color Math — Pure logic, no React dependency.
 * Shared between web app (ColorConverter.tsx) and MCP server.
 */

export interface RGBA { r: number; g: number; b: number; a: number }
export interface HSLA { h: number; s: number; l: number; a: number }
export interface OKLCH { L: number; C: number; H: number }

export interface ConvertedColors {
  hex: string;
  hex8: string;
  rgb: string;
  rgba: string;
  hsl: string;
  hsla: string;
  oklch: string;
  cssHex: string;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function rgbToOklch(r: number, g: number, b: number): OKLCH {
  const lr = linearize(r / 255);
  const lg = linearize(g / 255);
  const lb = linearize(b / 255);
  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_c = Math.cbrt(l_);
  const m_c = Math.cbrt(m_);
  const s_c = Math.cbrt(s_);
  const L = 0.2104542553 * l_c + 0.7936177850 * m_c - 0.0040720468 * s_c;
  const a = 1.9779984951 * l_c - 2.4285922050 * m_c + 0.4505937099 * s_c;
  const bVal = 0.0259040371 * l_c + 0.7827717662 * m_c - 0.8086757660 * s_c;
  const C = Math.sqrt(a * a + bVal * bVal);
  let H = (Math.atan2(bVal, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

export function oklchToRgb(L: number, C: number, H: number): { r: number; g: number; b: number } {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const l_c = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_c = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_c = L - 0.0894841775 * a - 1.2914855480 * b;
  const l_ = l_c * l_c * l_c;
  const m_ = m_c * m_c * m_c;
  const s_ = s_c * s_c * s_c;
  const lr =  4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_;
  const delinearize = (c: number) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return {
    r: clamp(Math.round(delinearize(lr) * 255), 0, 255),
    g: clamp(Math.round(delinearize(lg) * 255), 0, 255),
    b: clamp(Math.round(delinearize(lb) * 255), 0, 255),
  };
}

// ── Parsing ──────────────────────────────────────────────────────────────────

export function parseHex(s: string): RGBA | null {
  const m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (!m) return null;
  const hex = m[1];
  if (hex.length === 3) return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16), a: 1 };
  if (hex.length === 6) return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
  if (hex.length === 8) return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: parseInt(hex.slice(6, 8), 16) / 255 };
  return null;
}

export function parseRgb(s: string): RGBA | null {
  const m = s.match(/^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!m) return null;
  let a = 1;
  if (m[4] !== undefined) {
    a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  }
  return { r: clamp(parseInt(m[1]), 0, 255), g: clamp(parseInt(m[2]), 0, 255), b: clamp(parseInt(m[3]), 0, 255), a: clamp(a, 0, 1) };
}

export function parseHsl(s: string): RGBA | null {
  const m = s.match(/^hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!m) return null;
  const h = parseFloat(m[1]);
  const sat = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  let a = 1;
  if (m[4] !== undefined) {
    a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  }
  const { r, g, b } = hslToRgb(h, sat, l);
  return { r, g, b, a: clamp(a, 0, 1) };
}

export function parseOklch(s: string): RGBA | null {
  const m = s.match(/^oklch\(\s*([\d.]+%?)\s+([.\d]+)\s+([\d.]+)\s*\)$/i);
  if (!m) return null;
  let L = parseFloat(m[1]);
  if (m[1].endsWith('%')) L /= 100;
  const C = parseFloat(m[2]);
  const H = parseFloat(m[3]);
  const { r, g, b } = oklchToRgb(L, C, H);
  return { r, g, b, a: 1 };
}

/**
 * Parse a named CSS color using Canvas API (browser only).
 * In Node.js context, use parseNamedColorMap() instead.
 */
export function parseNamedColor(s: string): RGBA | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#000000';
    ctx.fillStyle = s;
    if (ctx.fillStyle === '#000000' && s.toLowerCase() !== 'black') return null;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  } catch {
    return null;
  }
}

export function parseColor(input: string): RGBA | null {
  const s = input.trim();
  if (!s) return null;
  return parseHex(s) ?? parseRgb(s) ?? parseHsl(s) ?? parseOklch(s) ?? parseNamedColor(s);
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function toHex6(r: number, g: number, b: number): string {
  const h = (c: number) => c.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function toHex8(r: number, g: number, b: number, a: number): string {
  const h = (c: number) => c.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}${h(Math.round(a * 255))}`;
}

export function round(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

export function convertAll(rgba: RGBA): ConvertedColors {
  const { r, g, b, a } = rgba;
  const hsl = rgbToHsl(r, g, b);
  const oklch = rgbToOklch(r, g, b);
  return {
    hex: toHex6(r, g, b),
    hex8: toHex8(r, g, b, a),
    rgb: `rgb(${r}, ${g}, ${b})`,
    rgba: `rgba(${r}, ${g}, ${b}, ${round(a, 2)})`,
    hsl: `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`,
    hsla: `hsla(${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%, ${round(a, 2)})`,
    oklch: `oklch(${round(oklch.L, 4)} ${round(oklch.C, 4)} ${round(oklch.H, 2)})`,
    cssHex: toHex6(r, g, b),
  };
}

// ── Contrast ─────────────────────────────────────────────────────────────────

export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function wcagGrade(ratio: number): { aa: boolean; aaLarge: boolean; aaa: boolean; aaaLarge: boolean } {
  return {
    aa: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaa: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}

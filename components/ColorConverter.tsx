import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Pipette, Copy, Check, Palette, Info, Zap, Eye } from 'lucide-react';
import ResizableSplit from './ResizableSplit';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface HSLA {
  h: number;
  s: number;
  l: number;
  a: number;
}

interface OKLCH {
  L: number;
  C: number;
  H: number;
}

interface ConvertedColors {
  hex: string;
  hex8: string;
  rgb: string;
  rgba: string;
  hsl: string;
  hsla: string;
  oklch: string;
  cssHex: string; // for swatch / color picker value
}

// ── Color Math ─────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
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

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
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

function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToOklch(r: number, g: number, b: number): OKLCH {
  // sRGB → linear sRGB
  const lr = linearize(r / 255);
  const lg = linearize(g / 255);
  const lb = linearize(b / 255);

  // linear sRGB → LMS (using OKLab M1 matrix)
  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  // Cube root
  const l_c = Math.cbrt(l_);
  const m_c = Math.cbrt(m_);
  const s_c = Math.cbrt(s_);

  // LMS → OKLab
  const L = 0.2104542553 * l_c + 0.7936177850 * m_c - 0.0040720468 * s_c;
  const a = 1.9779984951 * l_c - 2.4285922050 * m_c + 0.4505937099 * s_c;
  const bVal = 0.0259040371 * l_c + 0.7827717662 * m_c - 0.8086757660 * s_c;

  // OKLab → OKLCH
  const C = Math.sqrt(a * a + bVal * bVal);
  let H = (Math.atan2(bVal, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  return { L, C, H };
}

function oklchToRgb(L: number, C: number, H: number): { r: number; g: number; b: number } {
  // OKLCH → OKLab
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab → LMS (inverse of M2)
  const l_c = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_c = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_c = L - 0.0894841775 * a - 1.2914855480 * b;

  // Cube
  const l_ = l_c * l_c * l_c;
  const m_ = m_c * m_c * m_c;
  const s_ = s_c * s_c * s_c;

  // LMS → linear sRGB (inverse of M1)
  const lr =  4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_;

  // linear sRGB → sRGB
  const delinearize = (c: number) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

  return {
    r: clamp(Math.round(delinearize(lr) * 255), 0, 255),
    g: clamp(Math.round(delinearize(lg) * 255), 0, 255),
    b: clamp(Math.round(delinearize(lb) * 255), 0, 255),
  };
}

// ── Parsing ────────────────────────────────────────────────────────────────────

function parseHex(s: string): RGBA | null {
  const m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (!m) return null;
  const hex = m[1];
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
      a: 1,
    };
  }
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }
  if (hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: parseInt(hex.slice(6, 8), 16) / 255,
    };
  }
  return null;
}

function parseRgb(s: string): RGBA | null {
  const m = s.match(/^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!m) return null;
  let a = 1;
  if (m[4] !== undefined) {
    a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  }
  return {
    r: clamp(parseInt(m[1]), 0, 255),
    g: clamp(parseInt(m[2]), 0, 255),
    b: clamp(parseInt(m[3]), 0, 255),
    a: clamp(a, 0, 1),
  };
}

function parseHsl(s: string): RGBA | null {
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

function parseOklch(s: string): RGBA | null {
  const m = s.match(/^oklch\(\s*([\d.]+%?)\s+([.\d]+)\s+([\d.]+)\s*\)$/i);
  if (!m) return null;
  let L = parseFloat(m[1]);
  if (m[1].endsWith('%')) L /= 100;
  const C = parseFloat(m[2]);
  const H = parseFloat(m[3]);
  const { r, g, b } = oklchToRgb(L, C, H);
  return { r, g, b, a: 1 };
}

function parseNamedColor(s: string): RGBA | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#000000';
    ctx.fillStyle = s;
    // If fillStyle didn't change from the reset, it's invalid (unless it was black)
    if (ctx.fillStyle === '#000000' && s.toLowerCase() !== 'black') return null;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  } catch {
    return null;
  }
}

function parseColor(input: string): RGBA | null {
  const s = input.trim();
  if (!s) return null;
  return parseHex(s) ?? parseRgb(s) ?? parseHsl(s) ?? parseOklch(s) ?? parseNamedColor(s);
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function toHex6(r: number, g: number, b: number): string {
  const h = (c: number) => c.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function toHex8(r: number, g: number, b: number, a: number): string {
  const h = (c: number) => c.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}${h(Math.round(a * 255))}`;
}

function round(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function convertAll(rgba: RGBA): ConvertedColors {
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

// ── Contrast ───────────────────────────────────────────────────────────────────

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function wcagGrade(ratio: number): { aa: boolean; aaLarge: boolean; aaa: boolean; aaaLarge: boolean } {
  return {
    aa: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaa: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}

// ── Inline Copy Button ─────────────────────────────────────────────────────────

function InlineCopy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'DONE' : 'COPY'}
    </button>
  );
}

// ── Badge ──────────────────────────────────────────────────────────────────────

function Badge({ pass, label }: { pass: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${
        pass
          ? 'text-green-400 bg-green-900/20 border-green-500/30'
          : 'text-red-400 bg-red-900/20 border-red-500/30'
      }`}
    >
      {label} {pass ? 'PASS' : 'FAIL'}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ColorConverter({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');

  useEffect(() => { if (initialData) setInput(initialData); }, [initialData]);
  const [copied, setCopied] = useState(false);

  const rgba = useMemo(() => parseColor(input), [input]);
  const colors = useMemo(() => (rgba ? convertAll(rgba) : null), [rgba]);

  const contrast = useMemo(() => {
    if (!rgba) return null;
    const lum = relativeLuminance(rgba.r, rgba.g, rgba.b);
    const whiteLum = relativeLuminance(255, 255, 255);
    const blackLum = relativeLuminance(0, 0, 0);
    const vsWhite = contrastRatio(lum, whiteLum);
    const vsBlack = contrastRatio(lum, blackLum);
    return {
      vsWhite: { ratio: vsWhite, grade: wcagGrade(vsWhite) },
      vsBlack: { ratio: vsBlack, grade: wcagGrade(vsBlack) },
    };
  }, [rgba]);

  const handlePickerChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  }, []);

  const loadExample = useCallback(() => {
    setInput('#6366F1');
  }, []);

  const handleCopyAll = useCallback(() => {
    if (!colors) return;
    const lines = [
      `HEX:   ${colors.hex}`,
      `HEX8:  ${colors.hex8}`,
      `RGB:   ${colors.rgb}`,
      `RGBA:  ${colors.rgba}`,
      `HSL:   ${colors.hsl}`,
      `HSLA:  ${colors.hsla}`,
      `OKLCH: ${colors.oklch}`,
    ].join('\n');
    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [colors]);

  const FORMAT_ROWS: { label: string; key: keyof ConvertedColors }[] = [
    { label: 'HEX', key: 'hex' },
    { label: 'HEX (8-digit)', key: 'hex8' },
    { label: 'RGB', key: 'rgb' },
    { label: 'RGBA', key: 'rgba' },
    { label: 'HSL', key: 'hsl' },
    { label: 'HSLA', key: 'hsla' },
    { label: 'OKLCH', key: 'oklch' },
  ];

  // ── Left Panel ─────────────────────────────────────────────────────────────

  const leftPanel = (
    <div className="flex flex-col gap-4">
      {/* Color Input */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <Pipette size={14} className="text-slate-400" />
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Color Input</span>
        </div>
        <div className="p-6 space-y-4">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a color: #6366F1, rgb(99,102,241), hsl(239,84%,67%), blue..."
            spellCheck={false}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-mono text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors"
          />

          {/* Color Picker + Example */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="color"
                value={colors?.cssHex ?? '#000000'}
                onChange={handlePickerChange}
                className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
              />
              <span className="text-xs text-slate-500 font-medium">Pick color</span>
            </label>

            <button
              onClick={loadExample}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
            >
              <Zap size={12} />
              Example Data
            </button>
          </div>
        </div>
      </section>

      {/* Format Info */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <Info size={14} className="text-slate-400" />
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Supported Formats</span>
        </div>
        <div className="p-6">
          <ul className="text-xs text-slate-500 space-y-1.5 font-mono">
            <li><span className="text-slate-700 font-semibold">HEX</span> &mdash; #RGB, #RRGGBB, #RRGGBBAA</li>
            <li><span className="text-slate-700 font-semibold">RGB</span> &mdash; rgb(r, g, b), rgba(r, g, b, a)</li>
            <li><span className="text-slate-700 font-semibold">HSL</span> &mdash; hsl(h, s%, l%), hsla(h, s%, l%, a)</li>
            <li><span className="text-slate-700 font-semibold">OKLCH</span> &mdash; oklch(L C H)</li>
            <li><span className="text-slate-700 font-semibold">Named</span> &mdash; red, cornflowerblue, etc.</li>
          </ul>
        </div>
      </section>
    </div>
  );

  // ── Right Panel ────────────────────────────────────────────────────────────

  const rightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[400px]">
      {/* Header */}
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-slate-400" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Converted Colors</span>
        </div>
        <button
          onClick={handleCopyAll}
          disabled={!colors}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'COPIED' : 'COPY ALL'}
        </button>
      </div>

      <div className="flex-1 p-6 overflow-auto space-y-6">
        {/* Empty state */}
        {!colors && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <Palette size={32} strokeWidth={1} />
            <p className="text-xs font-bold uppercase tracking-widest">Enter a color to convert</p>
          </div>
        )}

        {colors && rgba && (
          <>
            {/* Color Swatch */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Preview</p>
              <div
                className="w-full h-24 rounded-xl border border-slate-700 shadow-inner"
                style={{ backgroundColor: colors.rgb }}
              />
            </div>

            {/* Format Rows */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">All Formats</p>
              <div className="space-y-1.5">
                {FORMAT_ROWS.map(({ label, key }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 shrink-0 w-20">
                        {label}
                      </span>
                      <span className="font-mono text-[13px] text-slate-200 truncate">
                        {colors[key]}
                      </span>
                    </div>
                    <InlineCopy text={colors[key]} />
                  </div>
                ))}
              </div>
            </div>

            {/* Contrast Checker */}
            {contrast && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Eye size={12} className="text-slate-400" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    WCAG Contrast Ratio
                  </p>
                </div>

                {/* vs White */}
                <div className="px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-700/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-white border border-slate-600" />
                      <span className="text-xs font-bold text-slate-300">vs White</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-slate-200">
                      {contrast.vsWhite.ratio.toFixed(2)}:1
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge pass={contrast.vsWhite.grade.aa} label="AA" />
                    <Badge pass={contrast.vsWhite.grade.aaLarge} label="AA Large" />
                    <Badge pass={contrast.vsWhite.grade.aaa} label="AAA" />
                    <Badge pass={contrast.vsWhite.grade.aaaLarge} label="AAA Large" />
                  </div>
                  {/* Inline preview */}
                  <div className="flex gap-2 mt-1">
                    <div
                      className="flex-1 px-3 py-2 rounded text-xs font-bold text-center"
                      style={{ backgroundColor: '#ffffff', color: colors.rgb }}
                    >
                      Sample Text
                    </div>
                    <div
                      className="flex-1 px-3 py-2 rounded text-xs font-bold text-center"
                      style={{ backgroundColor: colors.rgb, color: '#ffffff' }}
                    >
                      Sample Text
                    </div>
                  </div>
                </div>

                {/* vs Black */}
                <div className="px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-700/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-black border border-slate-600" />
                      <span className="text-xs font-bold text-slate-300">vs Black</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-slate-200">
                      {contrast.vsBlack.ratio.toFixed(2)}:1
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge pass={contrast.vsBlack.grade.aa} label="AA" />
                    <Badge pass={contrast.vsBlack.grade.aaLarge} label="AA Large" />
                    <Badge pass={contrast.vsBlack.grade.aaa} label="AAA" />
                    <Badge pass={contrast.vsBlack.grade.aaaLarge} label="AAA Large" />
                  </div>
                  {/* Inline preview */}
                  <div className="flex gap-2 mt-1">
                    <div
                      className="flex-1 px-3 py-2 rounded text-xs font-bold text-center"
                      style={{ backgroundColor: '#000000', color: colors.rgb }}
                    >
                      Sample Text
                    </div>
                    <div
                      className="flex-1 px-3 py-2 rounded text-xs font-bold text-center"
                      style={{ backgroundColor: colors.rgb, color: '#000000' }}
                    >
                      Sample Text
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );

  return <ResizableSplit left={leftPanel} right={rightPanel} storageKey="split:color" />;
}

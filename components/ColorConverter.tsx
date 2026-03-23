import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Pipette, Copy, Check, Palette, Info, Zap, Eye } from 'lucide-react';
import ResizableSplit from './ResizableSplit';
import {
  clamp, rgbToHsl, hslToRgb, rgbToOklch, oklchToRgb,
  parseHex, parseRgb, parseHsl, parseOklch, parseNamedColor, parseColor,
  toHex6, toHex8, round, convertAll,
  relativeLuminance, contrastRatio, wcagGrade,
  type RGBA, type HSLA, type OKLCH, type ConvertedColors,
} from '../utils/colorMath';

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

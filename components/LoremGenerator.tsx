import React, { useState, useCallback } from 'react';
import { RefreshCw, Copy, Check } from 'lucide-react';
import { generateText, type LoremLanguage } from '../utils/loremGenerator';

const LANGUAGES: { value: LoremLanguage; label: string }[] = [
  { value: 'english',    label: 'English' },
  { value: 'vietnamese', label: 'Vietnamese' },
  { value: 'spanish',    label: 'Spanish' },
  { value: 'french',     label: 'French' },
  { value: 'german',     label: 'German' },
  { value: 'japanese',   label: 'Japanese' },
  { value: 'chinese',    label: 'Chinese' },
];

export default function LoremGenerator() {
  const [language, setLanguage] = useState<LoremLanguage>('english');
  const [wordCount, setWordCount] = useState(100);
  const [paragraphCount, setParagraphCount] = useState(1);
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(() => {
    setOutput(generateText(language, wordCount, paragraphCount));
  }, [language, wordCount, paragraphCount]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const handleWordCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1, Math.min(10000, Number(e.target.value) || 1));
    setWordCount(val);
  };

  const handleParagraphCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1, Math.min(100, Number(e.target.value) || 1));
    setParagraphCount(val);
  };

  const wordCountInOutput = output ? output.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-slate-800 tracking-tight">Random Text Generator</h2>
        <p className="text-sm text-slate-500 mt-1">Generate random placeholder text in English or Vietnamese.</p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
        {/* Language */}
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-[0.1em] mb-2">
            Language
          </label>
          <div className="flex gap-2">
            {LANGUAGES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setLanguage(value)}
                aria-pressed={language === value}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                  language === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Word Count + Paragraph Count */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="word-count" className="block text-xs font-black text-slate-500 uppercase tracking-[0.1em] mb-2">
              Words
            </label>
            <input
              id="word-count"
              type="number"
              min={1}
              max={10000}
              value={wordCount}
              onChange={handleWordCountChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label htmlFor="paragraph-count" className="block text-xs font-black text-slate-500 uppercase tracking-[0.1em] mb-2">
              Paragraphs
            </label>
            <input
              id="paragraph-count"
              type="number"
              min={1}
              max={100}
              value={paragraphCount}
              onChange={handleParagraphCountChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Generate */}
        <button
          onClick={handleGenerate}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors cursor-pointer"
        >
          <RefreshCw size={15} />
          Generate
        </button>
      </div>

      {/* Output */}
      {output && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-xs font-black text-slate-400 uppercase tracking-[0.1em]">
              Output — {wordCountInOutput} words · {paragraphCount} {paragraphCount === 1 ? 'paragraph' : 'paragraphs'}
            </span>
            <button
              onClick={handleCopy}
              aria-label="Copy text"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
            >
              {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="p-4">
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-[var(--font-sans,inherit)] select-all">
              {output}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

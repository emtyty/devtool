import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Filter, ListFilter, Code2, Braces, FileText, AlertTriangle, Database, Key, Replace, Workflow } from 'lucide-react';
import { ImageFile } from './types';
import { extractMetadata, zeroperlWasmUrl } from './utils/exifParser';
import MetadataExplorer from './components/MetadataExplorer';
import MetadataSidebar from './components/MetadataSidebar';
import DropZone from './components/DropZone';
import PrivacyPage from './components/PrivacyPage';

const QueryPlanViewer = lazy(() => import('./components/QueryPlanViewer'));
const DataFormatter   = lazy(() => import('./components/DataFormatter'));
const ListCleaner     = lazy(() => import('./components/ListCleaner'));
const SqlFormatter    = lazy(() => import('./components/SqlFormatter'));
const JsonTools       = lazy(() => import('./components/JsonTools'));
const MarkdownPreview       = lazy(() => import('./components/MarkdownPreview'));
const StackTraceFormatter   = lazy(() => import('./components/StackTraceFormatter'));
const MockDataGenerator     = lazy(() => import('./components/MockDataGenerator'));
const JwtDecode             = lazy(() => import('./components/JwtDecode'));
const TextTools             = lazy(() => import('./components/TextTools'));
const DiagramGenerator      = lazy(() => import('./components/DiagramGenerator'));

type AppMode = 'privacy' | 'metadata' | 'queryplan' | 'dataformatter' | 'listcleaner' | 'sqlformatter' | 'jsontools' | 'markdown' | 'stacktrace' | 'mockdata' | 'jwtdecode' | 'texttools' | 'diagram';

const NAV_TABS: { id: AppMode; label: string; icon: React.ReactNode }[] = [
  { id: 'dataformatter', label: 'Data Formatter',  icon: <Filter size={16} /> },
  { id: 'listcleaner',   label: 'List Cleaner',    icon: <ListFilter size={16} /> },
  { id: 'sqlformatter',  label: 'SQL',             icon: <Code2 size={16} /> },
  { id: 'jsontools',     label: 'JSON',            icon: <Braces size={16} /> },
  { id: 'markdown',      label: 'Markdown',        icon: <FileText size={16} /> },
  { id: 'stacktrace',   label: 'Stack Trace',     icon: <AlertTriangle size={16} /> },
  { id: 'mockdata',      label: 'Mock Data',       icon: <Database size={16} /> },
  { id: 'jwtdecode',    label: 'JWT Decode',      icon: <Key size={16} /> },
  { id: 'texttools',    label: 'Text Tools',      icon: <Replace size={16} /> },
  { id: 'diagram',      label: 'Diagram Generator', icon: <Workflow size={16} /> },
  { id: 'metadata',      label: 'Binary Metadata', icon: <i className="fa-solid fa-fingerprint text-[16px]" /> },
  { id: 'queryplan',     label: 'Query Plan',      icon: <i className="fa-solid fa-diagram-project text-[16px]" /> },
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(() => {
    const saved = localStorage.getItem('devtoolkit:lastTab');
    const valid: AppMode[] = ['privacy','metadata','queryplan','dataformatter','listcleaner','sqlformatter','jsontools','markdown','stacktrace','mockdata','jwtdecode','texttools','diagram'];
    return valid.includes(saved as AppMode) ? (saved as AppMode) : 'dataformatter';
  });

  const switchMode = (next: AppMode) => {
    setMode(next);
    localStorage.setItem('devtoolkit:lastTab', next);
  };
  const [session, setSession] = useState<ImageFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(zeroperlWasmUrl).catch(console.error);
  }, []);

  const processFile = async (file: File) => {
    setError(null);
    setSession({ file, allMetadata: {}, isProcessing: true });

    try {
      const metadata = await extractMetadata(file);
      setSession(prev => prev ? { ...prev, allMetadata: metadata, isProcessing: false } : null);
      if (Object.keys(metadata).length === 0) {
        setError('Scan complete: No valid binary metadata detected.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown engine failure';
      setError(`Extraction Error: ${message}`);
      setSession(prev => prev ? { ...prev, isProcessing: false } : null);
    }
  };

  return (
    <div className="h-screen flex flex-col selection:bg-blue-500/30">
      <header className="no-print border-b border-slate-200 glass shrink-0 z-50 px-6 py-4">
        <button
          onClick={() => switchMode('dataformatter')}
          className="flex items-center gap-4 shrink-0 hover:opacity-80 transition-opacity"
          aria-label="Go to home"
        >
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <i className="fa-solid fa-code text-white text-xl"></i>
          </div>
          <div className="text-left">
            <h1 className="text-xl font-black tracking-tighter leading-none text-slate-800">DevToolKit</h1>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] mt-1">Local First Engine Data</p>
          </div>
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="no-print w-52 shrink-0 border-r border-slate-200 bg-white overflow-y-auto flex flex-col p-3 gap-0.5">
          {NAV_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => switchMode(tab.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold text-left whitespace-nowrap transition-all ${
                mode === tab.id ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </aside>

        <div className="flex-1 overflow-y-auto flex flex-col">
          <main className="flex-1 w-full px-6 py-8">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
        />

        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
        }>
          {mode === 'privacy'        ? <PrivacyPage /> :
           mode === 'queryplan'     ? <QueryPlanViewer /> :
           mode === 'dataformatter' ? <DataFormatter /> :
           mode === 'listcleaner'   ? <ListCleaner /> :
           mode === 'sqlformatter'  ? <SqlFormatter /> :
           mode === 'jsontools'     ? <JsonTools /> :
           mode === 'markdown'      ? <MarkdownPreview /> :
           mode === 'stacktrace'   ? <StackTraceFormatter /> :
           mode === 'mockdata'     ? <MockDataGenerator /> :
           mode === 'jwtdecode'   ? <JwtDecode /> :
           mode === 'texttools'   ? <TextTools /> :
           mode === 'diagram'    ? <DiagramGenerator /> :
           !session ? (
            <DropZone onFile={processFile} error={error} />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
              <div className="xl:col-span-8 space-y-8">
                {session.isProcessing ? (
                  <div className="bg-white border border-slate-200 rounded-[2.5rem] p-12 flex flex-col items-center justify-center shadow-sm">
                    <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-600">Consulting Forensic Core</p>
                  </div>
                ) : (
                  <MetadataExplorer data={session.allMetadata} />
                )}
              </div>

              <MetadataSidebar
                file={session.file}
                metadata={session.allMetadata}
                onReupload={() => fileInputRef.current?.click()}
              />
            </div>
          )}
        </Suspense>
          </main>

          <footer className="no-print border-t border-slate-200 bg-slate-50">
            <div className="w-full px-6 py-8">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-8">
                <FooterTech icon="fa-solid fa-fingerprint" name="ExifTool" desc="Binary metadata extraction via @uswriting/exiftool + WebAssembly" />
                <FooterTech icon="fa-solid fa-diagram-project" name="SQL Plan Viewer" desc="html-query-plan renderer + Gemini AI analysis via @google/genai" />
                <FooterTech icon="fa-solid fa-filter" name="Data Formatter" desc="SQL IN clause, VALUES, UNION, CSV generator with sql-formatter" />
                <FooterTech icon="fa-solid fa-list-check" name="List Cleaner" desc="Dedup, sort, trim, natural sort for plain text lists" />
                <FooterTech icon="fa-solid fa-braces" name="JSON Tools" desc="Format, minify, auto-repair (jsonrepair), diff & tree view" />
                <FooterTech icon="fa-solid fa-file-lines" name="Markdown" desc="Live preview with react-markdown + remark-gfm (GFM tables, tasks)" />
                <FooterTech icon="fa-solid fa-triangle-exclamation" name="Stack Trace" desc="Parse, highlight and filter stack traces for JS, Java, Python, .NET, Go, Ruby" />
                <FooterTech icon="fa-solid fa-database" name="Mock Data" desc="Generate fake test data (JSON/CSV/SQL) via @faker-js/faker with 60+ field types" />
                <FooterTech icon="fa-solid fa-code" name="SQL Tool" desc="Format, minify and beautify SQL queries with sql-formatter — supports MySQL, PostgreSQL, and more" />
                <FooterTech icon="fa-solid fa-right-left" name="Text Tools" desc="Log Insights pattern builder (CloudWatch) and Jira release note formatter with configurable base URL" />
                <FooterTech icon="fa-solid fa-diagram-project" name="Diagram Generator" desc="Generate sequence diagrams and system flowcharts from plain English descriptions using Mermaid.js" />
              </div>
              <div className="border-t border-slate-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.4em]">Powered by Coding4Pizza With Love</p>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                  {['React 19', 'TypeScript', 'Vite', 'Tailwind CSS', 'Lucide Icons'].map(t => (
                    <span key={t} className="text-[10px] text-slate-400 font-semibold">{t}</span>
                  ))}
                  <button
                    onClick={() => switchMode('privacy')}
                    className="text-[10px] text-blue-400 hover:text-blue-600 font-bold transition-colors"
                  >
                    Privacy Policy
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default App;

function FooterTech({ icon, name, desc }: { icon: string; name: string; desc: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <i className={`${icon} text-blue-500 text-xs`}></i>
        <span className="text-xs font-black text-slate-600">{name}</span>
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}

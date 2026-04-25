import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Filter, ListFilter, Code2, Braces, FileText, AlertTriangle, Database, Key, Replace, Workflow, Clock, Palette, Timer, ScrollText, Wand2, Sun, Moon, GitCompare, Hash, Cpu, FileOutput, Sheet, Waves, Shield, Star, GripVertical, Menu, X, ListTree, Scissors, Settings, BookOpen, FilePlus2, FileDiff, Search } from 'lucide-react';
import { ImageFile } from './types';
import { extractMetadata, zeroperlWasmUrl } from './utils/exifParser';
import MetadataExplorer from './components/MetadataExplorer';
import MetadataSidebar from './components/MetadataSidebar';
import DropZone from './components/DropZone';
import PrivacyPage from './components/PrivacyPage';

const SmartDetect         = lazy(() => import('./components/SmartDetect'));
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
const EpochConverter        = lazy(() => import('./components/EpochConverter'));
const ColorConverter        = lazy(() => import('./components/ColorConverter'));
const CronBuilder           = lazy(() => import('./components/CronBuilder'));
const LogAnalyzer           = lazy(() => import('./components/LogAnalyzer'));
const TextDiff              = lazy(() => import('./components/TextDiff'));
const UuidGenerator         = lazy(() => import('./components/UuidGenerator'));
const McpPage               = lazy(() => import('./components/McpPage'));
const FileConverter         = lazy(() => import('./components/FileConverter'));
const TableLens                = lazy(() => import('./components/TableLens'));
const NetworkWaterfallAnalyzer = lazy(() => import('./components/NetworkWaterfallAnalyzer'));
const CspTools                 = lazy(() => import('./components/CspTools'));
const JsonExtractor            = lazy(() => import('./components/JsonExtractor'));
const PdfEditor                = lazy(() => import('./components/PdfEditor'));
const PdfMaker                 = lazy(() => import('./components/PdfMaker'));
const SettingsPage             = lazy(() => import('./components/SettingsPage'));
const DbSchemaVisualizer       = lazy(() => import('./components/DbSchemaVisualizer'));
const GitDiffViewer            = lazy(() => import('./components/GitDiffViewer'));
const LoremGenerator           = lazy(() => import('./components/LoremGenerator'));

type AppMode = 'smartdetect' | 'privacy' | 'mcp' | 'metadata' | 'queryplan' | 'dataformatter' | 'listcleaner' | 'sqlformatter' | 'jsontools' | 'markdown' | 'stacktrace' | 'mockdata' | 'jwtdecode' | 'texttools' | 'diagram' | 'epoch' | 'color' | 'cron' | 'logs' | 'textdiff' | 'uuidgen' | 'fileconverter' | 'tablelens' | 'networkwaterfall' | 'csptools' | 'jsonextractor' | 'pdfeditor' | 'pdfmaker' | 'settings' | 'dbschema' | 'gitdiff' | 'loremgen';

// ── URL routing ──────────────────────────────────────────────────
const MODE_TO_SLUG: Record<AppMode, string> = {
  smartdetect:   '',
  privacy:       'privacy',
  mcp:           'mcp-server',
  metadata:      'binary-metadata',
  queryplan:     'query-plan',
  dataformatter: 'data-formatter',
  listcleaner:   'list-cleaner',
  sqlformatter:  'sql-formatter',
  jsontools:     'json',
  markdown:      'markdown',
  stacktrace:    'stack-trace',
  mockdata:      'mock-data',
  jwtdecode:     'jwt-decoder',
  texttools:     'text-tools',
  diagram:       'diagram',
  epoch:         'epoch-converter',
  color:         'color-converter',
  cron:          'cron-builder',
  logs:          'log-analyzer',
  textdiff:      'text-diff',
  uuidgen:       'uuid-generator',
  fileconverter:    'file-converter',
  tablelens:        'table-lens',
  networkwaterfall: 'network-waterfall',
  csptools:         'csp-tools',
  jsonextractor:    'json-extractor',
  pdfeditor:        'pdf-editor',
  pdfmaker:         'pdf-maker',
  settings:         'settings',
  dbschema:         'db-schema',
  gitdiff:          'git-diff',
  loremgen:         'lorem-generator',
};

const SLUG_TO_MODE: Record<string, AppMode> = Object.fromEntries(
  Object.entries(MODE_TO_SLUG).map(([mode, slug]) => [slug, mode as AppMode])
);

function getModeFromPath(): AppMode {
  const slug = window.location.pathname.replace(/^\//, '');
  if (!slug) return 'smartdetect';
  const mode = SLUG_TO_MODE[slug];
  if (!mode) {
    window.history.replaceState({}, '', '/');
    return 'smartdetect';
  }
  return mode;
}

// ── Sidebar navigation (grouped) ─────────────────────────────────
type NavItem = { id: AppMode; label: string; icon: React.ReactNode };
type NavSection = { title?: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { id: 'smartdetect',   label: 'Smart Detector',    icon: <Wand2 size={16} /> },
    ],
  },
  {
    title: 'Format & Parse',
    items: [
      { id: 'dataformatter', label: 'Data Formatter',    icon: <Filter size={16} /> },
      { id: 'listcleaner',   label: 'List Cleaner',      icon: <ListFilter size={16} /> },
      { id: 'sqlformatter',  label: 'SQL Formatter',     icon: <Code2 size={16} /> },
      { id: 'jsontools',     label: 'JSON Tools',        icon: <Braces size={16} /> },
      { id: 'jsonextractor', label: 'JSON Extractor',   icon: <ListTree size={16} /> },
      { id: 'markdown',      label: 'Markdown',          icon: <FileText size={16} /> },
      { id: 'stacktrace',    label: 'Stack Trace',       icon: <AlertTriangle size={16} /> },
      { id: 'dbschema',      label: 'DB Schema',         icon: <Database size={16} /> },
    ],
  },
  {
    title: 'Generate & Convert',
    items: [
      { id: 'mockdata',      label: 'Mock Data',         icon: <Database size={16} /> },
      { id: 'loremgen',      label: 'Lorem Generator',   icon: <FileText size={16} /> },
      { id: 'uuidgen',       label: 'UUID / ULID',       icon: <Hash size={16} /> },
      { id: 'epoch',         label: 'Epoch Converter',   icon: <Clock size={16} /> },
      { id: 'color',         label: 'Color Converter',   icon: <Palette size={16} /> },
      { id: 'cron',          label: 'Cron Builder',      icon: <Timer size={16} /> },
      { id: 'diagram',       label: 'Diagram',           icon: <Workflow size={16} /> },
      { id: 'fileconverter', label: 'File Converter',    icon: <FileOutput size={16} /> },
      { id: 'tablelens',     label: 'Table Lens',        icon: <Sheet size={16} /> },
      { id: 'pdfmaker',      label: 'PDF Maker',         icon: <FilePlus2 size={16} /> },
      { id: 'pdfeditor',     label: 'PDF Editor',        icon: <Scissors size={16} /> },
    ],
  },
  {
    title: 'Decode & Analyze',
    items: [
      { id: 'jwtdecode',     label: 'JWT Decode',        icon: <Key size={16} /> },
      { id: 'texttools',     label: 'Text Tools',        icon: <Replace size={16} /> },
      { id: 'textdiff',      label: 'Text Compare',      icon: <GitCompare size={16} /> },
      { id: 'gitdiff',       label: 'Git Diff Viewer',   icon: <FileDiff size={16} /> },
      { id: 'logs',             label: 'Log Analyzer',      icon: <ScrollText size={16} /> },
      { id: 'networkwaterfall', label: 'Network Waterfall', icon: <Waves size={16} /> },
      { id: 'metadata',         label: 'Binary Metadata',   icon: <i className="fa-solid fa-fingerprint text-[16px]" /> },
      { id: 'queryplan',        label: 'Query Plan',        icon: <i className="fa-solid fa-diagram-project text-[16px]" /> },
      { id: 'csptools',         label: 'CSP Tools',         icon: <Shield size={16} /> },
    ],
  },
  {
    items: [
      { id: 'mcp',           label: 'MCP Server',        icon: <Cpu size={16} /> },
    ],
  },
];

// ── Always-accessible modes (never redirected even if "hidden") ───
const ALWAYS_ACCESSIBLE = new Set<AppMode>(['smartdetect', 'privacy', 'settings']);

// ── Hidden tools ──────────────────────────────────────────────────
const HIDDEN_TOOLS_KEY = 'devtoolkit:hidden-tools';

function useHiddenTools() {
  const [hiddenTools, setHiddenTools] = useState<AppMode[]>(() => {
    try {
      const stored = localStorage.getItem(HIDDEN_TOOLS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const persist = (next: AppMode[]) => {
    localStorage.setItem(HIDDEN_TOOLS_KEY, JSON.stringify(next));
    return next;
  };

  const toggle = useCallback((id: AppMode) => {
    setHiddenTools(prev => persist(prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id]));
  }, []);

  const hideGroup = useCallback((ids: AppMode[]) => {
    setHiddenTools(prev => persist([...new Set([...prev, ...ids])]));
  }, []);

  const showGroup = useCallback((ids: AppMode[]) => {
    setHiddenTools(prev => persist(prev.filter(h => !ids.includes(h))));
  }, []);

  const resetAll = useCallback(() => {
    localStorage.removeItem(HIDDEN_TOOLS_KEY);
    setHiddenTools([]);
  }, []);

  return { hiddenTools, toggle, hideGroup, showGroup, resetAll };
}

// ── Favorites ─────────────────────────────────────────────────────
const NAV_ITEM_MAP: Partial<Record<AppMode, NavItem>> = Object.fromEntries(
  NAV_SECTIONS.flatMap(s => s.items).map(item => [item.id, item])
);

const FAVORITES_KEY = 'devtoolkit:favorites';
const MAX_FAVORITES = 5;

function useFavorites() {
  const [favorites, setFavorites] = useState<AppMode[]>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const toggleFavorite = useCallback((id: AppMode) => {
    setFavorites(prev => {
      const next = prev.includes(id)
        ? prev.filter(f => f !== id)
        : prev.length >= MAX_FAVORITES ? prev : [...prev, id];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setFavorites(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { favorites, toggleFavorite, reorder };
}

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(getModeFromPath);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [pendingData, setPendingData] = useState<string | null>(null);

  // ── Auto-hide header on scroll (mobile) ──
  const [barsHidden, setBarsHidden] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const switchMode = useCallback((next: AppMode) => {
    setPendingData(null);
    setMode(next);
    setSidebarOpen(false);
    setSearchQuery('');
    scrollRef.current?.scrollTo(0, 0);
    setBarsHidden(false);
    const slug = MODE_TO_SLUG[next];
    window.history.pushState({}, '', slug ? `/${slug}` : '/');
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const onPopState = () => setMode(getModeFromPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Keyboard shortcuts: Escape closes search/sidebar, Cmd+K or / focuses search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchQuery) { setSearchQuery(''); searchRef.current?.blur(); return; }
        if (sidebarOpen) setSidebarOpen(false);
        return;
      }
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !inInput)) {
        e.preventDefault();
        if (!sidebarOpen) setSidebarOpen(true);
        // Defer focus so sidebar is visible first
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen, searchQuery]);

  // Smart Detect → detected tool with data
  const handleSmartDetect = useCallback((tool: string, data: string) => {
    setPendingData(data);
    switchMode(tool as AppMode);
  }, [switchMode]);

  // Smart Detect → detected file (binary)
  const handleSmartDetectFile = useCallback((tool: string, file: File) => {
    if (tool === 'metadata') {
      processFile(file);
    }
    switchMode(tool as AppMode);
  }, [switchMode]);

  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggleTheme = useCallback(() => {
    setDark(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('devtoolkit:theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  const [session, setSession] = useState<ImageFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);
  const { favorites, toggleFavorite, reorder } = useFavorites();
  const { hiddenTools, toggle: toggleHidden, hideGroup, showGroup, resetAll: resetHiddenTools } = useHiddenTools();

  // Redirect to home if current mode is hidden (handles direct URL access too)
  useEffect(() => {
    if (!ALWAYS_ACCESSIBLE.has(mode) && hiddenTools.includes(mode)) {
      setMode('smartdetect');
      window.history.replaceState({}, '', '/');
    }
  }, [mode, hiddenTools]);

  // Auto-remove favorites that become hidden (with a short delay for smoothness)
  useEffect(() => {
    const favInHidden = favorites.filter(f => hiddenTools.includes(f));
    if (favInHidden.length === 0) return;
    const timer = setTimeout(() => {
      favInHidden.forEach(id => toggleFavorite(id));
    }, 500);
    return () => clearTimeout(timer);
  }, [hiddenTools]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search ────────────────────────────────────────────────────────
  const ALL_NAV_TOOLS = useMemo(() => NAV_SECTIONS.flatMap(s => s.items), []);

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return ALL_NAV_TOOLS.filter(item => !hiddenTools.includes(item.id) && item.label.toLowerCase().includes(q));
  }, [searchQuery, ALL_NAV_TOOLS, hiddenTools]);

  const lastScrollY = useRef(0);
  const scrollDelta = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const THRESHOLD = 40;
    const onScroll = () => {
      const y = el.scrollTop;
      const delta = y - lastScrollY.current;
      // Ignore tiny movements (< 2px) — prevents bounce/flicker at edges
      if (Math.abs(delta) < 2) return;
      // Near top — always show
      if (y < 60) { setBarsHidden(false); scrollDelta.current = 0; lastScrollY.current = y; return; }
      // Near bottom — freeze state (prevents iOS bounce flicker)
      const nearBottom = el.scrollHeight - el.clientHeight - y < 30;
      if (nearBottom) { lastScrollY.current = y; return; }
      // Accumulate scroll delta in same direction, reset on direction change
      if ((delta > 0 && scrollDelta.current < 0) || (delta < 0 && scrollDelta.current > 0)) scrollDelta.current = 0;
      scrollDelta.current += delta;
      if (scrollDelta.current > THRESHOLD) setBarsHidden(true);
      else if (scrollDelta.current < -THRESHOLD) setBarsHidden(false);
      lastScrollY.current = y;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    // Best-effort preload; if it fails, the metadata tool will fetch on demand
    fetch(zeroperlWasmUrl).catch(() => {});
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
    <div className="h-dvh flex flex-col selection:bg-blue-500/30 pt-[env(safe-area-inset-top)]">
      <header className={`no-print border-b border-slate-200 glass z-50 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between fixed lg:static top-[env(safe-area-inset-top)] left-0 right-0 lg:shrink-0 transition-transform duration-300 ${barsHidden && !sidebarOpen ? '-translate-y-[calc(100%+env(safe-area-inset-top))] lg:translate-y-0' : 'translate-y-0'}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? <X size={20} className="text-slate-600 dark:text-slate-300" /> : <Menu size={20} className="text-slate-600 dark:text-slate-300" />}
          </button>
          <button
            onClick={() => switchMode('smartdetect')}
            className="flex items-center gap-4 shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
            aria-label="Go to home"
          >
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <i className="fa-solid fa-code text-white text-xl"></i>
            </div>
            <div className="text-left min-w-0">
              <h1 className="text-xl font-black tracking-tighter leading-none text-slate-800">DevToolKit</h1>
              <p className="hidden sm:block text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] mt-1">Local First Engine Data</p>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://coding4pizza.com/docs/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Documentation"
            title="Docs"
          >
            <BookOpen size={18} />
          </a>
          <a
            href="https://github.com/emtyty/devtool"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            aria-label="GitHub repository"
            title="GitHub"
          >
            <i className="fa-brands fa-github text-lg"></i>
          </a>
          <button
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={dark}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            <span className="theme-toggle-knob">
              <Sun size={12} className="theme-toggle-icon theme-toggle-sun" />
              <Moon size={12} className="theme-toggle-icon theme-toggle-moon" />
            </span>
          </button>
        </div>
      </header>

      <div className={`flex flex-1 overflow-hidden transition-[padding] duration-300 lg:pt-0 ${barsHidden && !sidebarOpen ? 'pt-0' : 'pt-[57px]'}`}>
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed top-[env(safe-area-inset-top)] bottom-0 left-0 right-0 bg-black/40 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside className={`no-print w-64 lg:w-52 shrink-0 border-r border-slate-200 bg-white flex flex-col fixed lg:static top-[env(safe-area-inset-top)] bottom-0 left-0 z-40 pt-[57px] lg:pt-0 pb-[env(safe-area-inset-bottom)] lg:pb-0 shadow-2xl lg:shadow-none transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>

          {/* Scrollable nav area */}
          <div className="flex-1 overflow-y-auto p-3 pb-0 gap-0.5 flex flex-col">

          {/* ── Search box ── */}
          <div className="pb-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search tools… (⌘K)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Search tools"
                className="w-full pl-7 pr-6 py-1.5 text-[13px] bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {searchQuery.trim() ? (
            /* ── Search results ── */
            filteredTools.length === 0 ? (
              <div className="px-3 py-6 text-[12px] text-slate-400 dark:text-slate-600 text-center">No tools found</div>
            ) : (
              filteredTools.map(tab => {
                const isFav = favorites.includes(tab.id);
                const isMaxed = favorites.length >= MAX_FAVORITES && !isFav;
                const starClass = isFav
                  ? 'pl-2 py-2 text-amber-400 cursor-pointer shrink-0'
                  : isMaxed
                  ? 'pl-2 py-2 text-slate-200 dark:text-slate-700 cursor-not-allowed shrink-0'
                  : 'pl-2 py-2 text-slate-300 dark:text-slate-600 hover:text-amber-400 cursor-pointer shrink-0';
                return (
                  <div
                    key={tab.id}
                    className={`group flex items-center rounded-lg transition-all ${
                      mode === tab.id ? 'bg-blue-50 dark:bg-blue-500/15' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <button
                      onClick={() => { if (!isMaxed) toggleFavorite(tab.id); }}
                      title={isMaxed ? 'Max 5 favorites reached' : isFav ? 'Remove from favorites' : 'Add to favorites'}
                      aria-label={isMaxed ? 'Max 5 favorites reached' : isFav ? 'Remove from favorites' : 'Add to favorites'}
                      className={`transition-all ${starClass}`}
                    >
                      <Star size={13} className={isFav ? 'fill-amber-400' : ''} />
                    </button>
                    <button
                      onClick={() => switchMode(tab.id)}
                      className={`flex items-center gap-2.5 flex-1 px-1.5 py-2.5 lg:py-2 text-sm lg:text-[13px] font-bold text-left whitespace-nowrap cursor-pointer transition-colors ${
                        mode === tab.id
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  </div>
                );
              })
            )
          ) : (
            <>
              {/* ── Favorites section ── */}
              {favorites.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.15em]">
                    Favorites
                  </div>
                  {favorites.map((favId, index) => {
                    const item = NAV_ITEM_MAP[favId];
                    if (!item) return null;
                    return (
                      <div
                        key={favId}
                        draggable
                        onDragStart={() => { dragIndex.current = index; }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragIndex.current !== null && dragIndex.current !== index) {
                            reorder(dragIndex.current, index);
                          }
                          dragIndex.current = null;
                        }}
                        className={`group flex items-center rounded-lg transition-all ${
                          mode === favId
                            ? 'bg-blue-50 dark:bg-blue-500/15'
                            : 'hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <span className="pl-1.5 py-2 text-slate-300 dark:text-slate-700 cursor-grab active:cursor-grabbing shrink-0">
                          <GripVertical size={12} />
                        </span>
                        <button
                          onClick={() => switchMode(favId)}
                          className={`flex items-center gap-2.5 flex-1 px-1.5 py-2.5 lg:py-2 text-sm lg:text-[13px] font-bold text-left whitespace-nowrap cursor-pointer transition-colors ${
                            mode === favId
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                        >
                          {item.icon}
                          {item.label}
                        </button>
                        <button
                          onClick={() => toggleFavorite(favId)}
                          title="Remove from favorites"
                          aria-label="Remove from favorites"
                          className="pr-2 py-2 text-amber-400 lg:opacity-0 lg:group-hover:opacity-100 hover:text-amber-300 transition-all cursor-pointer shrink-0"
                        >
                          <Star size={13} className="fill-amber-400" />
                        </button>
                      </div>
                    );
                  })}
                  <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
                </>
              )}

              {/* ── Regular nav sections ── */}
              {NAV_SECTIONS.map((section, si) => {
                const visibleItems = section.items.filter(tab => !hiddenTools.includes(tab.id));
                if (visibleItems.length === 0) return null;
                return (
                  <React.Fragment key={si}>
                    {si > 0 && <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />}
                    {section.title && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.15em]">
                        {section.title}
                      </div>
                    )}
                    {visibleItems.map(tab => {
                      const isFav = favorites.includes(tab.id);
                      const isMaxed = favorites.length >= MAX_FAVORITES && !isFav;
                      const starClass = isFav
                        ? 'pl-2 py-2 text-amber-400 lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer shrink-0'
                        : isMaxed
                        ? 'pl-2 py-2 text-slate-200 dark:text-slate-700 lg:opacity-0 lg:group-hover:opacity-100 cursor-not-allowed shrink-0'
                        : 'pl-2 py-2 text-slate-300 dark:text-slate-600 lg:opacity-0 lg:group-hover:opacity-100 hover:text-amber-400 cursor-pointer shrink-0';
                      return (
                        <div
                          key={tab.id}
                          className={`group flex items-center rounded-lg transition-all ${
                            mode === tab.id
                              ? 'bg-blue-50 dark:bg-blue-500/15'
                              : 'hover:bg-slate-50 dark:hover:bg-white/5'
                          }`}
                        >
                          <button
                            onClick={() => { if (!isMaxed) toggleFavorite(tab.id); }}
                            title={isMaxed ? 'Max 5 favorites reached' : isFav ? 'Remove from favorites' : 'Add to favorites'}
                            aria-label={isMaxed ? 'Max 5 favorites reached' : isFav ? 'Remove from favorites' : 'Add to favorites'}
                            className={`transition-all ${starClass}`}
                          >
                            <Star size={13} className={isFav ? 'fill-amber-400' : ''} />
                          </button>
                          <button
                            onClick={() => switchMode(tab.id)}
                            className={`flex items-center gap-2.5 flex-1 px-1.5 py-2.5 lg:py-2 text-sm lg:text-[13px] font-bold text-left whitespace-nowrap cursor-pointer transition-colors ${
                              mode === tab.id
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                          >
                            {tab.icon}
                            {tab.label}
                          </button>
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </>
          )}

          </div>

          {/* ── Settings (pinned bottom) ── */}
          <div className="shrink-0 p-3 pt-0">
          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <div className={`flex items-center rounded-lg transition-all ${
            mode === 'settings' ? 'bg-blue-50 dark:bg-blue-500/15' : 'hover:bg-slate-50 dark:hover:bg-white/5'
          }`}>
            <button
              onClick={() => switchMode('settings')}
              className={`flex items-center gap-2.5 flex-1 px-3 py-2.5 lg:py-2 text-sm lg:text-[13px] font-bold text-left cursor-pointer transition-colors ${
                mode === 'settings'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Settings size={16} />
              Settings
              {hiddenTools.length > 0 && (
                <span className="ml-auto text-[10px] font-black bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 rounded px-1.5 py-0.5">
                  {hiddenTools.length}
                </span>
              )}
            </button>
          </div>
          </div>
          </div>
        </aside>

        <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col dark:bg-[#0a1120]">
          <main className="flex-1 w-full px-4 lg:px-6 py-6 lg:py-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
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
          {mode === 'smartdetect'   ? <SmartDetect onDetect={handleSmartDetect} onDetectFile={handleSmartDetectFile} onNavigate={switchMode} /> :
           mode === 'privacy'        ? <PrivacyPage /> :
           mode === 'mcp'            ? <McpPage /> :
           mode === 'queryplan'     ? <QueryPlanViewer initialData={pendingData} /> :
           mode === 'dataformatter' ? <DataFormatter initialData={pendingData} /> :
           mode === 'listcleaner'   ? <ListCleaner initialData={pendingData} /> :
           mode === 'sqlformatter'  ? <SqlFormatter initialData={pendingData} /> :
           mode === 'jsontools'     ? <JsonTools initialData={pendingData} /> :
           mode === 'markdown'      ? <MarkdownPreview initialData={pendingData} /> :
           mode === 'stacktrace'   ? <StackTraceFormatter initialData={pendingData} /> :
           mode === 'mockdata'     ? <MockDataGenerator /> :
           mode === 'jwtdecode'   ? <JwtDecode initialData={pendingData} /> :
           mode === 'texttools'   ? <TextTools initialData={pendingData} /> :
           mode === 'epoch'      ? <EpochConverter initialData={pendingData} /> :
           mode === 'color'     ? <ColorConverter initialData={pendingData} /> :
           mode === 'cron'      ? <CronBuilder initialData={pendingData} /> :
           mode === 'logs'      ? <LogAnalyzer initialData={pendingData} /> :
           mode === 'textdiff'  ? <TextDiff initialData={pendingData} /> :
           mode === 'uuidgen'   ? <UuidGenerator /> :
           mode === 'diagram'    ? <DiagramGenerator initialData={pendingData} /> :
           mode === 'fileconverter' ? <FileConverter /> :
           mode === 'tablelens'        ? <TableLens /> :
           mode === 'networkwaterfall' ? <NetworkWaterfallAnalyzer /> :
           mode === 'csptools'         ? <CspTools initialData={pendingData} /> :
           mode === 'jsonextractor'    ? <JsonExtractor /> :
           mode === 'pdfeditor'        ? <PdfEditor /> :
           mode === 'pdfmaker'         ? <PdfMaker /> :
           mode === 'dbschema'         ? <DbSchemaVisualizer initialData={pendingData} /> :
           mode === 'gitdiff'          ? <GitDiffViewer initialData={pendingData} /> :
           mode === 'loremgen'         ? <LoremGenerator /> :
           mode === 'settings'         ? <SettingsPage
             sections={NAV_SECTIONS.slice(1)}
             hiddenTools={hiddenTools}
             onToggle={(id: string) => toggleHidden(id as AppMode)}
             onHideGroup={(ids: string[]) => hideGroup(ids as AppMode[])}
             onShowGroup={(ids: string[]) => showGroup(ids as AppMode[])}
             onResetAll={resetHiddenTools}
           /> :
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

          <footer className="no-print border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0d1424]">
            <div className="w-full px-3 lg:px-6 py-4 lg:py-8 space-y-4 lg:space-y-6">

              {/* Tools grid — hidden on mobile, visible on lg+ */}
              <div className="hidden lg:block">
                <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-4">All Tools</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2">
                  {[
                    ...FOOTER_TOOLS.filter(t => favorites.includes(t.id) && !hiddenTools.includes(t.id)),
                    ...FOOTER_TOOLS.filter(t => !favorites.includes(t.id) && !hiddenTools.includes(t.id)),
                  ].map(t => {
                    const isFav = favorites.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => switchMode(t.id)}
                        title={t.desc}
                        className="flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group cursor-pointer"
                      >
                        <span className="text-blue-500 dark:text-blue-400 text-[11px] shrink-0 w-4 text-center">{t.icon}</span>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors truncate">{t.name}</span>
                        {isFav && <Star size={9} className="shrink-0 fill-amber-400 text-amber-400 ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* MCP callout */}
              <button
                onClick={() => switchMode('mcp')}
                className="w-full flex items-center justify-between gap-4 bg-gradient-to-r from-blue-600/5 to-violet-600/5 dark:from-blue-500/10 dark:to-violet-500/10 border border-blue-200/50 dark:border-blue-500/20 rounded-xl px-5 py-3 hover:from-blue-600/10 hover:to-violet-600/10 dark:hover:from-blue-500/15 dark:hover:to-violet-500/15 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center shrink-0">
                    <Cpu size={14} className="text-white" />
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-black text-slate-700 dark:text-slate-200">devtoolkit-mcp</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-2">25 tools as an MCP server for AI workflows</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-blue-500 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 whitespace-nowrap transition-colors">
                  Learn more →
                </span>
              </button>

              {/* Bottom bar */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 lg:pt-5 flex flex-col sm:flex-row items-center sm:justify-between gap-2">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-[0.2em] sm:tracking-[0.4em]">Coding4Pizza</p>
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="hidden sm:flex items-center gap-x-4">
                    {['React 19', 'TypeScript', 'Vite', 'Tailwind CSS'].map(t => (
                      <span key={t} className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{t}</span>
                    ))}
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                  </div>
                  <a
                    href="https://www.npmjs.com/package/devtoolkit-mcp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-bold transition-colors"
                  >
                    npm
                  </a>
                  <a
                    href="https://github.com/emtyty/devtool"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-bold transition-colors"
                  >
                    GitHub
                  </a>
                  <a
                    href="https://coding4pizza.com/docs/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-bold transition-colors"
                  >
                    Docs
                  </a>
                  <button
                    onClick={() => switchMode('privacy')}
                    className="text-[10px] text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-bold transition-colors cursor-pointer"
                  >
                    Privacy
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

const FOOTER_TOOLS: { id: AppMode; name: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'dataformatter', name: 'Data Formatter',    icon: <Filter size={11} />,        desc: 'SQL IN clause, VALUES, UNION, CSV generator with sql-formatter' },
  { id: 'listcleaner',   name: 'List Cleaner',      icon: <ListFilter size={11} />,    desc: 'Dedup, sort, trim, natural sort for plain text lists' },
  { id: 'sqlformatter',  name: 'SQL Formatter',     icon: <Code2 size={11} />,         desc: 'Format & minify SQL — MySQL, PostgreSQL, and 18+ dialects' },
  { id: 'jsontools',     name: 'JSON Tools',        icon: <Braces size={11} />,        desc: 'Format, minify, auto-repair (jsonrepair), diff, tree view & TS interface gen' },
  { id: 'markdown',      name: 'Markdown',          icon: <FileText size={11} />,      desc: 'Live preview with react-markdown + remark-gfm (GFM tables, tasks)' },
  { id: 'stacktrace',    name: 'Stack Trace',       icon: <AlertTriangle size={11} />, desc: 'Parse & highlight stack traces for JS, Java, Python, .NET, Go, Ruby' },
  { id: 'mockdata',      name: 'Mock Data',         icon: <Database size={11} />,      desc: 'Generate fake data (JSON/CSV/SQL) via @faker-js/faker with 63+ field types' },
  { id: 'loremgen',      name: 'Lorem Generator',   icon: <FileText size={11} />,      desc: 'Generate random placeholder text in English or Vietnamese' },
  { id: 'uuidgen',       name: 'UUID / ULID',       icon: <Hash size={11} />,          desc: 'Bulk-generate UUID v1/v4/v7 and ULIDs with multiple output formats' },
  { id: 'jwtdecode',     name: 'JWT Decode',        icon: <Key size={11} />,           desc: 'Decode JWT tokens — header, payload, signature & expiration status' },
  { id: 'texttools',     name: 'Text Tools',        icon: <Replace size={11} />,       desc: 'CloudWatch Log Insights pattern builder & Jira release note formatter' },
  { id: 'epoch',         name: 'Epoch Converter',   icon: <Clock size={11} />,         desc: 'Convert between Unix epoch timestamps and human-readable dates' },
  { id: 'color',         name: 'Color Converter',   icon: <Palette size={11} />,       desc: 'HEX, RGB, HSL, OKLCH conversion with visual picker & WCAG contrast checker' },
  { id: 'cron',          name: 'Cron Builder',      icon: <Timer size={11} />,         desc: 'Visual cron expression builder with human-readable descriptions & next 10 runs' },
  { id: 'logs',          name: 'Log Analyzer',      icon: <ScrollText size={11} />,    desc: 'Parse, filter & analyze logs with auto-format detection & timeline view' },
  { id: 'textdiff',      name: 'Text Compare',      icon: <GitCompare size={11} />,    desc: 'Side-by-side text diff comparison with line-by-line highlighting' },
  { id: 'diagram',       name: 'Diagram',           icon: <Workflow size={11} />,      desc: 'Generate sequence diagrams & flowcharts from plain English using Mermaid.js' },
  { id: 'fileconverter', name: 'File Converter',   icon: <FileOutput size={11} />,   desc: 'Convert images (PNG/JPG/WebP/BMP), data (JSON/CSV/XML/YAML), Markdown → HTML, File ↔ Base64' },
  { id: 'tablelens',     name: 'Table Lens',       icon: <Sheet size={11} />,         desc: 'Import CSV/XLSX — filter, inline edit, batch edit, find distinct values, export changes' },
  { id: 'networkwaterfall', name: 'Network Waterfall', icon: <Waves size={11} />,  desc: 'HAR file analyzer — waterfall timeline, rule engine, console log correlation' },
  { id: 'csptools',         name: 'CSP Tools',         icon: <Shield size={11} />, desc: 'Analyze, debug & build Content Security Policies — CSP evaluator, console log parser, domain merger' },
  { id: 'metadata',         name: 'Binary Metadata',   icon: <i className="fa-solid fa-fingerprint text-[11px]" />, desc: 'EXIF/XMP/IPTC metadata extraction via @uswriting/exiftool + WebAssembly' },
  { id: 'queryplan',     name: 'Query Plan',        icon: <i className="fa-solid fa-diagram-project text-[11px]" />,   desc: 'SQL Server execution plan viewer + Gemini AI analysis via @google/genai' },
  { id: 'jsonextractor', name: 'JSON Extractor',    icon: <ListTree size={11} />,      desc: 'Extract a list of values from JSON by dot-notation path — auto-traverses nested arrays' },
  { id: 'pdfeditor',    name: 'PDF Editor',        icon: <Scissors size={11} />,      desc: 'Sort or delete PDF pages and export a new PDF — runs entirely in your browser' },
  { id: 'pdfmaker',      name: 'PDF Maker',         icon: <FilePlus2 size={11} />,     desc: 'Combine images / PDFs / DOCX / XLSX / MD / HTML / TXT / CSV into a single PDF via pdf-lib' },
  { id: 'dbschema',      name: 'DB Schema',         icon: <Database size={11} />,      desc: 'Visualize SQL DDL / Prisma / dbdiagram.io as an ER diagram (Mermaid) with PK / FK / UK annotations' },
  { id: 'gitdiff',       name: 'Git Diff Viewer',   icon: <FileDiff size={11} />,      desc: 'Parse git diff / patch files — side-by-side + unified view, word-level inline diff, syntax highlighting' },
  { id: 'smartdetect',   name: 'Smart Detector',    icon: <Wand2 size={11} />,         desc: 'Auto-detect content type (JSON, SQL, JWT, cron, etc.) and route to the right tool' },
];

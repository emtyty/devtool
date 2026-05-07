// Centralized mermaid initialization and theming.
//
// Single source of truth for the visual style of every mermaid-rendered
// diagram in the app. Replaces the two independent `mermaid.initialize({...})`
// calls that lived in MarkdownPreview and DiagramGenerator.
//
// Theme matches DevToolKit's slate palette and Inter typography, with an
// optional `look: 'handDrawn'` mode for Excalidraw-style sketch output.
// Dark mode is supported by re-initializing on theme toggle.

import mermaid from 'mermaid';

export type MermaidLook = 'classic' | 'handDrawn';

export interface MermaidThemeOptions {
  /** Apply dark-mode color palette. Default: false. */
  dark?: boolean;
  /** Visual style. 'classic' = clean Miro-ish; 'handDrawn' = Excalidraw-style. */
  look?: MermaidLook;
}

const FONT_FAMILY =
  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

const LIGHT_VARS = {
  background: '#ffffff',
  primaryColor: '#f1f5f9', // slate-100 (node fill)
  primaryTextColor: '#1e293b', // slate-800
  primaryBorderColor: '#cbd5e1', // slate-300
  secondaryColor: '#e2e8f0', // slate-200
  secondaryTextColor: '#334155', // slate-700
  secondaryBorderColor: '#94a3b8', // slate-400
  tertiaryColor: '#f8fafc', // slate-50
  tertiaryTextColor: '#475569', // slate-600
  tertiaryBorderColor: '#cbd5e1',
  lineColor: '#94a3b8',
  textColor: '#1e293b',
  mainBkg: '#ffffff',
  nodeBorder: '#cbd5e1',
  clusterBkg: '#f8fafc',
  clusterBorder: '#cbd5e1',
  titleColor: '#1e293b',
  edgeLabelBackground: '#ffffff',
  // Sequence diagram
  actorBkg: '#f1f5f9',
  actorBorder: '#cbd5e1',
  actorTextColor: '#1e293b',
  actorLineColor: '#94a3b8',
  signalColor: '#475569',
  signalTextColor: '#1e293b',
  noteBkgColor: '#fef3c7', // amber-100
  noteTextColor: '#78350f',
  noteBorderColor: '#fcd34d',
};

const DARK_VARS = {
  background: '#0f172a', // slate-900
  primaryColor: '#1e293b', // slate-800
  primaryTextColor: '#e2e8f0', // slate-200
  primaryBorderColor: '#475569', // slate-600
  secondaryColor: '#334155', // slate-700
  secondaryTextColor: '#cbd5e1',
  secondaryBorderColor: '#64748b',
  tertiaryColor: '#1e293b',
  tertiaryTextColor: '#94a3b8',
  tertiaryBorderColor: '#475569',
  lineColor: '#64748b',
  textColor: '#e2e8f0',
  mainBkg: '#1e293b',
  nodeBorder: '#475569',
  clusterBkg: '#0f172a',
  clusterBorder: '#475569',
  titleColor: '#e2e8f0',
  edgeLabelBackground: '#0f172a',
  // Sequence diagram
  actorBkg: '#1e293b',
  actorBorder: '#475569',
  actorTextColor: '#e2e8f0',
  actorLineColor: '#64748b',
  signalColor: '#cbd5e1',
  signalTextColor: '#e2e8f0',
  noteBkgColor: '#451a03',
  noteTextColor: '#fcd34d',
  noteBorderColor: '#92400e',
};

const SHARED_CSS = `
  /* Soft shadow on shape primitives for a modern flat look */
  .node rect, .node polygon, .node circle, .node ellipse, .node path {
    filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.08));
  }
  /* Edge labels render with the theme background */
  .edgeLabel { font-weight: 500; }
  .nodeLabel { font-weight: 500; letter-spacing: 0.01em; }
`;

// Module-level subscription so MermaidBlock instances can re-render whenever
// the theme is re-initialized. Avoids prop-drilling through ReactMarkdown.
type ThemeListener = () => void;
const themeListeners = new Set<ThemeListener>();

/** Subscribe to theme changes. Returns an unsubscribe function. */
export function onMermaidThemeChange(listener: ThemeListener): () => void {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

function notifyThemeChange(): void {
  themeListeners.forEach((l) => {
    try {
      l();
    } catch {
      // Listener errors should not block other listeners
    }
  });
}

/** Initialize (or re-initialize) mermaid with our centralized theme. */
export function initMermaid(options: MermaidThemeOptions = {}): void {
  const dark = options.dark ?? false;
  const look = options.look ?? 'classic';

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    look,
    themeVariables: {
      ...(dark ? DARK_VARS : LIGHT_VARS),
      fontFamily: FONT_FAMILY,
      fontSize: '14px',
    },
    themeCSS: SHARED_CSS,
    sequence: {
      mirrorActors: false,
      messageAlign: 'center',
      noteFontWeight: '500',
      messageFontWeight: '500',
    },
    flowchart: {
      curve: 'basis',
      padding: 20,
      htmlLabels: true,
    },
    c4: { diagramMarginY: 20 },
    quadrantChart: {
      titleFontSize: 16,
      quadrantLabelFontSize: 14,
      pointLabelFontSize: 11,
      xAxisLabelFontSize: 12,
      yAxisLabelFontSize: 12,
      quadrantTextTopPadding: 6,
      pointRadius: 4,
    },
  });

  notifyThemeChange();
}

/** Reads the current dark-mode flag from the `<html>` `.dark` class. */
export function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

/**
 * Observes class changes on the `<html>` element and invokes the callback
 * whenever the `.dark` class toggles. Returns a disposer.
 */
export function watchDarkMode(callback: (dark: boolean) => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  let last = isDarkMode();
  const observer = new MutationObserver(() => {
    const next = isDarkMode();
    if (next !== last) {
      last = next;
      callback(next);
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}

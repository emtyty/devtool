// Color tokens + per-node-kind styling for the native ReactFlow renderers.
//
// Each NodeKind maps to a 4-color palette (border / header bg / accent /
// text) for both light and dark themes. Renderers and the SVG export
// pipeline read from this file so the live diagram and the exported SVG
// use identical colors.

import type { NodeKind } from '../../../utils/diagrams/types';

export interface KindStyle {
  border: string;
  headerBg: string;
  accent: string;
  bodyBg: string;
  text: string;
  iconColor: string;
}

interface ThemePalette {
  canvasBg: string;
  edgeColor: string;
  edgeLabel: string;
  edgeLabelBg: string;
  subgraphBg: string;
  subgraphBorder: string;
  subgraphLabel: string;
  nodeShadow: string;
  byKind: Record<NodeKind, KindStyle>;
}

// Light palette
const LIGHT: ThemePalette = {
  canvasBg: '#f8fafc', // slate-50
  edgeColor: '#94a3b8', // slate-400
  edgeLabel: '#475569', // slate-600
  edgeLabelBg: '#ffffff',
  subgraphBg: 'rgba(241, 245, 249, 0.5)', // slate-100/50
  subgraphBorder: '#cbd5e1', // slate-300
  subgraphLabel: '#475569',
  nodeShadow: 'rgba(15, 23, 42, 0.08)',
  byKind: {
    service: {
      border: '#86efac',
      headerBg: '#ecfdf5',
      accent: '#10b981',
      bodyBg: '#ffffff',
      text: '#064e3b',
      iconColor: '#10b981',
    },
    database: {
      border: '#fcd34d',
      headerBg: '#fffbeb',
      accent: '#f59e0b',
      bodyBg: '#ffffff',
      text: '#78350f',
      iconColor: '#f59e0b',
    },
    queue: {
      border: '#fda4af',
      headerBg: '#fff1f2',
      accent: '#f43f5e',
      bodyBg: '#ffffff',
      text: '#881337',
      iconColor: '#f43f5e',
    },
    storage: {
      border: '#67e8f9',
      headerBg: '#ecfeff',
      accent: '#06b6d4',
      bodyBg: '#ffffff',
      text: '#164e63',
      iconColor: '#06b6d4',
    },
    user: {
      border: '#93c5fd',
      headerBg: '#eff6ff',
      accent: '#3b82f6',
      bodyBg: '#ffffff',
      text: '#1e3a8a',
      iconColor: '#3b82f6',
    },
    client: {
      border: '#c4b5fd',
      headerBg: '#f5f3ff',
      accent: '#8b5cf6',
      bodyBg: '#ffffff',
      text: '#4c1d95',
      iconColor: '#8b5cf6',
    },
    external: {
      border: '#cbd5e1',
      headerBg: '#f1f5f9',
      accent: '#64748b',
      bodyBg: '#ffffff',
      text: '#334155',
      iconColor: '#64748b',
    },
    process: {
      border: '#bfdbfe',
      headerBg: '#eff6ff',
      accent: '#60a5fa',
      bodyBg: '#ffffff',
      text: '#1e3a8a',
      iconColor: '#60a5fa',
    },
    decision: {
      border: '#c4b5fd',
      headerBg: '#f5f3ff',
      accent: '#8b5cf6',
      bodyBg: '#faf5ff',
      text: '#4c1d95',
      iconColor: '#8b5cf6',
    },
    start: {
      border: '#86efac',
      headerBg: '#ecfdf5',
      accent: '#10b981',
      bodyBg: '#ffffff',
      text: '#064e3b',
      iconColor: '#10b981',
    },
    end: {
      border: '#fda4af',
      headerBg: '#fff1f2',
      accent: '#f43f5e',
      bodyBg: '#ffffff',
      text: '#881337',
      iconColor: '#f43f5e',
    },
    icon: {
      border: '#cbd5e1',
      headerBg: '#ffffff',
      accent: '#64748b',
      bodyBg: '#ffffff',
      text: '#1e293b',
      iconColor: '#64748b',
    },
    plain: {
      border: '#cbd5e1',
      headerBg: '#f8fafc',
      accent: '#64748b',
      bodyBg: '#ffffff',
      text: '#1e293b',
      iconColor: '#64748b',
    },
  },
};

// Dark palette — slightly muted backgrounds, brighter borders/accents
const DARK: ThemePalette = {
  canvasBg: '#0f172a',
  edgeColor: '#64748b',
  edgeLabel: '#cbd5e1',
  edgeLabelBg: '#1e293b',
  subgraphBg: 'rgba(30, 41, 59, 0.5)',
  subgraphBorder: '#475569',
  subgraphLabel: '#94a3b8',
  nodeShadow: 'rgba(0, 0, 0, 0.30)',
  byKind: {
    service: {
      border: '#10b981',
      headerBg: 'rgba(16, 185, 129, 0.12)',
      accent: '#34d399',
      bodyBg: '#1e293b',
      text: '#a7f3d0',
      iconColor: '#34d399',
    },
    database: {
      border: '#f59e0b',
      headerBg: 'rgba(245, 158, 11, 0.12)',
      accent: '#fbbf24',
      bodyBg: '#1e293b',
      text: '#fde68a',
      iconColor: '#fbbf24',
    },
    queue: {
      border: '#f43f5e',
      headerBg: 'rgba(244, 63, 94, 0.12)',
      accent: '#fb7185',
      bodyBg: '#1e293b',
      text: '#fecdd3',
      iconColor: '#fb7185',
    },
    storage: {
      border: '#06b6d4',
      headerBg: 'rgba(6, 182, 212, 0.12)',
      accent: '#22d3ee',
      bodyBg: '#1e293b',
      text: '#a5f3fc',
      iconColor: '#22d3ee',
    },
    user: {
      border: '#3b82f6',
      headerBg: 'rgba(59, 130, 246, 0.12)',
      accent: '#60a5fa',
      bodyBg: '#1e293b',
      text: '#bfdbfe',
      iconColor: '#60a5fa',
    },
    client: {
      border: '#8b5cf6',
      headerBg: 'rgba(139, 92, 246, 0.12)',
      accent: '#a78bfa',
      bodyBg: '#1e293b',
      text: '#ddd6fe',
      iconColor: '#a78bfa',
    },
    external: {
      border: '#64748b',
      headerBg: 'rgba(100, 116, 139, 0.12)',
      accent: '#94a3b8',
      bodyBg: '#1e293b',
      text: '#cbd5e1',
      iconColor: '#94a3b8',
    },
    process: {
      border: '#60a5fa',
      headerBg: 'rgba(96, 165, 250, 0.12)',
      accent: '#93c5fd',
      bodyBg: '#1e293b',
      text: '#bfdbfe',
      iconColor: '#93c5fd',
    },
    decision: {
      border: '#8b5cf6',
      headerBg: 'rgba(139, 92, 246, 0.12)',
      accent: '#a78bfa',
      bodyBg: '#1e293b',
      text: '#ddd6fe',
      iconColor: '#a78bfa',
    },
    start: {
      border: '#10b981',
      headerBg: 'rgba(16, 185, 129, 0.12)',
      accent: '#34d399',
      bodyBg: '#1e293b',
      text: '#a7f3d0',
      iconColor: '#34d399',
    },
    end: {
      border: '#f43f5e',
      headerBg: 'rgba(244, 63, 94, 0.12)',
      accent: '#fb7185',
      bodyBg: '#1e293b',
      text: '#fecdd3',
      iconColor: '#fb7185',
    },
    icon: {
      border: '#475569',
      headerBg: '#1e293b',
      accent: '#94a3b8',
      bodyBg: '#1e293b',
      text: '#e2e8f0',
      iconColor: '#94a3b8',
    },
    plain: {
      border: '#475569',
      headerBg: '#1e293b',
      accent: '#94a3b8',
      bodyBg: '#1e293b',
      text: '#e2e8f0',
      iconColor: '#94a3b8',
    },
  },
};

export function getDiagramTheme(dark: boolean): ThemePalette {
  return dark ? DARK : LIGHT;
}

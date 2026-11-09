/**
 * AssetSchool Design Tokens & Theme Constants
 */

export const ASSETSCHOOL_BRAND = {
  name: 'AssetSchool',
  tagline: 'Gestión, Supervisión y Control Inteligente de Aulas',
  version: '1.0.0-phase1',
  colors: {
    primary: '#0284c7', // Sky-600
    primaryDark: '#0369a1', // Sky-700
    primaryLight: '#38bdf8', // Sky-400
    slateBgDark: '#0f172a', // Slate-900
    slateCardDark: '#1e293b', // Slate-800
    borderDark: '#334155', // Slate-700
    online: '#10b981', // Emerald-500
    busy: '#f59e0b', // Amber-500
    locked: '#ef4444', // Red-500
    offline: '#64748b', // Slate-500
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
};

export type ThemeMode = 'light' | 'dark' | 'system';

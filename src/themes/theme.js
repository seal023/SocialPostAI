// ============================================================
// Theme system — 4 visual styles + legacy themes
// All theme definitions are self-contained in this file
// No external dependencies
// ============================================================

// ── Empty decorations for legacy themes ──
const EMPTY_DECORATIONS = {
  statusBarStyle: 'dark-content',
  cardBorderWidth: 0,
  cardBorderColor: 'transparent',
  buttonGlow: false,
  buttonTextShadow: false,
  buttonBounce: false,
  showCornerBrackets: false,
  showGrid: false,
  showScanLines: false,
  showBubbles: false,
  showWavyTop: false,
};

// ============================================================
// ALL themes — legacy + 4 style themes
// Each theme has ALL required fields
// ============================================================

const ALL_THEMES = {
  // ── Legacy: Pink (default) ──
  pink: {
    name: 'pink',
    label: 'Pink',
    description: '粉色',
    emoji: '🌸',
    isDark: false,
    primary: '#FF6B6B',
    primaryEnd: '#FF8E53',
    primaryLight: 'rgba(255, 107, 107, 0.10)',
    primaryAlpha20: 'rgba(255, 107, 107, 0.20)',
    primaryAlpha30: 'rgba(255, 107, 107, 0.30)',
    gradient: ['#FF6B6B', '#FF8E53'],
    background: '#F8F6F9',
    card: '#FFFFFF',
    cardAlt: '#FFFFFF',
    title: '#2D2D3F',
    subtitle: '#6B6B7A',
    body: '#4A4A5A',
    placeholder: '#B0B0B8',
    border: '#EAE8F0',
    borderLight: '#F3F4F6',
    textPrimary: '#2D2D3F',
    textSecondary: '#6B6B7A',
    textTertiary: '#B0B0B8',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    star: '#FCD34D',
    overlay: 'rgba(0,0,0,0.4)',
    shadow: 'rgba(0,0,0,0.06)',
    borderRadius: { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 999 },
    shadows: {
      card: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
      float: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 12, elevation: 5 },
    },
    decorations: EMPTY_DECORATIONS,
  },

  // ── Legacy: Deep Blue ──
  deepBlue: {
    name: 'deepBlue',
    label: 'Deep Blue',
    description: '深蓝',
    emoji: '💎',
    isDark: false,
    primary: '#4A6CF7',
    primaryEnd: '#6B8CFF',
    primaryLight: 'rgba(74, 108, 247, 0.10)',
    primaryAlpha20: 'rgba(74, 108, 247, 0.20)',
    primaryAlpha30: 'rgba(74, 108, 247, 0.30)',
    gradient: ['#4A6CF7', '#6B8CFF'],
    background: '#F0F4FF',
    card: '#FFFFFF',
    cardAlt: '#FFFFFF',
    title: '#1A1A3E',
    subtitle: '#5A6B8A',
    body: '#3D4A6A',
    placeholder: '#A0B0C8',
    border: '#DCE4F0',
    borderLight: '#E8EEF8',
    textPrimary: '#1A1A3E',
    textSecondary: '#5A6B8A',
    textTertiary: '#A0B0C8',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    star: '#FCD34D',
    overlay: 'rgba(0,0,0,0.4)',
    shadow: 'rgba(0,0,0,0.06)',
    borderRadius: { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 999 },
    shadows: {
      card: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
      float: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 12, elevation: 5 },
    },
    decorations: EMPTY_DECORATIONS,
  },

  // ── Legacy: Purple ──
  purple: {
    name: 'purple',
    label: 'Purple',
    description: '紫色',
    emoji: '🔮',
    isDark: false,
    primary: '#8B5CF6',
    primaryEnd: '#A78BFA',
    primaryLight: 'rgba(139, 92, 246, 0.10)',
    primaryAlpha20: 'rgba(139, 92, 246, 0.20)',
    primaryAlpha30: 'rgba(139, 92, 246, 0.30)',
    gradient: ['#8B5CF6', '#A78BFA'],
    background: '#F5F0FF',
    card: '#FFFFFF',
    cardAlt: '#FFFFFF',
    title: '#2D1B4E',
    subtitle: '#6B5A8A',
    body: '#4A3A6A',
    placeholder: '#A090C0',
    border: '#E0D8F0',
    borderLight: '#EDE6F8',
    textPrimary: '#2D1B4E',
    textSecondary: '#6B5A8A',
    textTertiary: '#A090C0',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    star: '#FCD34D',
    overlay: 'rgba(0,0,0,0.4)',
    shadow: 'rgba(0,0,0,0.06)',
    borderRadius: { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 999 },
    shadows: {
      card: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
      float: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 12, elevation: 5 },
    },
    decorations: EMPTY_DECORATIONS,
  },

  // ── Style 1: Sci-Fi — Space ship control panel ──
  sciFi: {
    name: 'sciFi',
    label: 'Sci-Fi',
    description: '科幻',
    emoji: '🚀',
    isDark: true,
    primary: '#00D4FF',
    primaryEnd: '#7B2FFF',
    primaryLight: 'rgba(0, 212, 255, 0.12)',
    primaryAlpha20: 'rgba(0, 212, 255, 0.20)',
    primaryAlpha30: 'rgba(0, 212, 255, 0.30)',
    gradient: ['#00D4FF', '#7B2FFF'],
    background: '#0A0E1A',
    card: '#12162B',
    cardAlt: '#1A1F38',
    title: '#E8F0FF',
    subtitle: '#8899BB',
    body: '#8899BB',
    placeholder: '#556688',
    border: '#1E2848',
    borderLight: '#151A30',
    textPrimary: '#E8F0FF',
    textSecondary: '#8899BB',
    textTertiary: '#556688',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    star: '#FCD34D',
    overlay: 'rgba(0,0,0,0.6)',
    shadow: 'rgba(0, 212, 255, 0.15)',
    borderRadius: { sm: 4, md: 6, lg: 10, xl: 14, xxl: 18, full: 999 },
    shadows: {
      card: { shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 },
      float: { shadowColor: '#7B2FFF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 8 },
    },
    decorations: {
      showGrid: true,
      gridColor: 'rgba(0, 212, 255, 0.06)',
      gridSpacing: 40,
      showScanLines: true,
      scanLineColor: 'rgba(0, 212, 255, 0.03)',
      scanLineSpacing: 4,
      showCornerBrackets: true,
      cornerColor: '#00D4FF',
      cornerLength: 12,
      cornerWidth: 2,
      statusBarStyle: 'light-content',
      cardBorderWidth: 1,
      cardBorderColor: 'rgba(0, 212, 255, 0.20)',
      buttonGlow: true,
      buttonTextShadow: true,
      buttonBounce: false,
      showBubbles: false,
      showWavyTop: false,
    },
  },

  // ── Style 2: Dreamy — Soft gradient, frosted glass ──
  dreamy: {
    name: 'dreamy',
    label: 'Dreamy',
    description: '梦幻',
    emoji: '✨',
    isDark: false,
    primary: '#C084FC',
    primaryEnd: '#F9A8D4',
    primaryLight: 'rgba(192, 132, 252, 0.12)',
    primaryAlpha20: 'rgba(192, 132, 252, 0.20)',
    primaryAlpha30: 'rgba(192, 132, 252, 0.30)',
    gradient: ['#C084FC', '#F9A8D4'],
    background: '#FFF5F9',
    card: 'rgba(255, 255, 255, 0.75)',
    cardAlt: 'rgba(255, 245, 255, 0.6)',
    title: '#3B1F5E',
    subtitle: '#8B6AAE',
    body: '#8B6AAE',
    placeholder: '#B89FD4',
    border: '#F0D8FF',
    borderLight: '#F8F0FF',
    textPrimary: '#3B1F5E',
    textSecondary: '#8B6AAE',
    textTertiary: '#B89FD4',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    star: '#FCD34D',
    overlay: 'rgba(0,0,0,0.4)',
    shadow: 'rgba(192, 132, 252, 0.08)',
    borderRadius: { sm: 10, md: 14, lg: 18, xl: 22, xxl: 28, full: 999 },
    shadows: {
      card: { shadowColor: '#C084FC', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
      float: { shadowColor: '#F9A8D4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 5 },
    },
    decorations: {
      statusBarStyle: 'dark-content',
      cardBorderWidth: 0,
      cardBorderColor: 'transparent',
      buttonGlow: false,
      buttonTextShadow: false,
      buttonBounce: false,
      showCornerBrackets: false,
      showGrid: false,
      showScanLines: false,
      showBubbles: false,
      showWavyTop: false,
    },
  },

  // ── Style 3: Cartoon — Animation movie style ──
  cartoon: {
    name: 'cartoon',
    label: 'Cartoon',
    description: '卡通',
    emoji: '🎨',
    isDark: false,
    primary: '#FB923C',
    primaryEnd: '#F472B6',
    primaryLight: 'rgba(251, 146, 60, 0.12)',
    primaryAlpha20: 'rgba(251, 146, 60, 0.20)',
    primaryAlpha30: 'rgba(251, 146, 60, 0.30)',
    gradient: ['#FB923C', '#F472B6'],
    background: '#FEFCE8',
    card: '#FFFFFF',
    cardAlt: '#FFF7ED',
    title: '#431407',
    subtitle: '#9A6B47',
    body: '#9A6B47',
    placeholder: '#C4A07A',
    border: '#FDE8CD',
    borderLight: '#FEF3E2',
    textPrimary: '#431407',
    textSecondary: '#9A6B47',
    textTertiary: '#C4A07A',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    star: '#FCD34D',
    overlay: 'rgba(0,0,0,0.4)',
    shadow: 'rgba(251, 146, 60, 0.18)',
    borderRadius: { sm: 14, md: 18, lg: 22, xl: 28, xxl: 32, full: 999 },
    shadows: {
      card: { shadowColor: '#FB923C', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 0.18, shadowRadius: 0, elevation: 4 },
      float: { shadowColor: '#F472B6', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.22, shadowRadius: 0, elevation: 6 },
    },
    decorations: {
      showWavyTop: true,
      wavyColor: '#FB923C',
      wavyColor2: '#4ADE80',
      showBubbles: true,
      bubbleColors: ['#FB923C', '#4ADE80', '#F472B6', '#FBBF24', '#60A5FA'],
      bubbleCount: 12,
      showCornerBrackets: false,
      statusBarStyle: 'dark-content',
      cardBorderWidth: 2.5,
      cardBorderColor: '#FB923C',
      buttonGlow: false,
      buttonTextShadow: false,
      buttonBounce: true,
      showGrid: false,
      showScanLines: false,
    },
  },

  // ── Style 4: Minimalist — White, minimal lines, high whitespace ──
  minimal: {
    name: 'minimal',
    label: 'Minimalist',
    description: '简洁',
    emoji: '📄',
    isDark: false,
    primary: '#2563EB',
    primaryEnd: '#3B82F6',
    primaryLight: 'rgba(37, 99, 235, 0.08)',
    primaryAlpha20: 'rgba(37, 99, 235, 0.20)',
    primaryAlpha30: 'rgba(37, 99, 235, 0.30)',
    gradient: ['#2563EB', '#3B82F6'],
    background: '#FFFFFF',
    card: '#F8FAFC',
    cardAlt: '#F1F5F9',
    title: '#0F172A',
    subtitle: '#475569',
    body: '#475569',
    placeholder: '#94A3B8',
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textTertiary: '#94A3B8',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    star: '#FCD34D',
    overlay: 'rgba(0,0,0,0.4)',
    shadow: 'rgba(0,0,0,0.04)',
    borderRadius: { sm: 6, md: 8, lg: 12, xl: 16, xxl: 20, full: 999 },
    shadows: {
      card: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
      float: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
    },
    decorations: {
      statusBarStyle: 'dark-content',
      cardBorderWidth: 0,
      cardBorderColor: 'transparent',
      buttonGlow: false,
      buttonTextShadow: false,
      buttonBounce: false,
      showCornerBrackets: false,
      showGrid: false,
      showScanLines: false,
      showBubbles: false,
      showWavyTop: false,
    },
  },
};

// ============================================================
// COLORS object — backward compatible with legacy code
// ============================================================

export const COLORS = {
  BASE: {
    background: '#F8F6F9',
    card: '#FFFFFF',
    title: '#2D2D3F',
    subtitle: '#6B6B7A',
    body: '#4A4A5A',
    placeholder: '#B0B0B8',
    border: '#EAE8F0',
    borderLight: '#F3F4F6',
    shadow: 'rgba(0,0,0,0.06)',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    star: '#FCD34D',
    overlay: 'rgba(0,0,0,0.4)',
  },
  THEMES: {
    pink: ALL_THEMES.pink,
    deepBlue: ALL_THEMES.deepBlue,
    purple: ALL_THEMES.purple,
    sciFi: ALL_THEMES.sciFi,
    dreamy: ALL_THEMES.dreamy,
    cartoon: ALL_THEMES.cartoon,
    minimal: ALL_THEMES.minimal,
  },
  SPACING: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
  RADIUS: { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 999 },
  FONT_SIZE: { xs: 11, sm: 13, md: 15, lg: 16, xl: 18, xxl: 24, huge: 28 },
  SHADOWS: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    float: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.10,
      shadowRadius: 12,
      elevation: 5,
    },
  },
};

// ============================================================
// Style theme options for selector UI
// ============================================================

export const STYLE_THEME_OPTIONS = [
  {
    name: 'sciFi',
    label: 'Sci-Fi',
    description: '科幻',
    emoji: '🚀',
    previewColors: ['#0A0E1A', '#00D4FF', '#7B2FFF', '#FF00E5'],
  },
  {
    name: 'dreamy',
    label: 'Dreamy',
    description: '梦幻',
    emoji: '✨',
    previewColors: ['#FFF5F9', '#C084FC', '#F9A8D4', '#93C5FD'],
  },
  {
    name: 'cartoon',
    label: 'Cartoon',
    description: '卡通',
    emoji: '🎨',
    previewColors: ['#FEFCE8', '#FB923C', '#4ADE80', '#F472B6'],
  },
  {
    name: 'minimal',
    label: 'Minimalist',
    description: '简洁',
    emoji: '📄',
    previewColors: ['#FFFFFF', '#2563EB', '#94A3B8', '#F1F5F9'],
  },
];

// ── Module-level state for style theme ──
let _currentStyleThemeName = 'pink';

export function setStyleTheme(themeName) {
  if (ALL_THEMES[themeName]) {
    _currentStyleThemeName = themeName;
  }
}

export function getCurrentStyleThemeName() {
  return _currentStyleThemeName;
}

// ============================================================
// getTheme — BULLETPROOF, always returns a valid object
// ============================================================

export function getTheme(themeName = 'pink') {
  const theme = ALL_THEMES[themeName] || ALL_THEMES.pink;
  return theme;
}

// ============================================================
// getGradientColors
// ============================================================

export function getGradientColors(themeName = 'pink') {
  const theme = ALL_THEMES[themeName] || ALL_THEMES.pink;
  return theme.gradient;
}

// ============================================================
// Convenience re-exports
// ============================================================

export const SPACING = COLORS.SPACING;
export const RADIUS = COLORS.RADIUS;
export const FONT_SIZE = COLORS.FONT_SIZE;
export const SHADOWS = COLORS.SHADOWS;

export default COLORS;

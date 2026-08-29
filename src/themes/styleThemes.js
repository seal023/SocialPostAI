// ============================================================
// Style Themes — 4 visual style definitions
// Each style defines: colors, border radius, shadows, isDark flag
// Plus: decoration config for StyleDecorator component
// Sci-Fi / Dreamy / Cartoon / Minimalist
// ============================================================

const styleThemes = {
  // ── 1. Sci-Fi: Space ship control panel ──
  sciFi: {
    name: 'sciFi',
    label: 'Sci-Fi',
    description: '科幻',
    emoji: '🚀',
    isDark: true,
    previewColors: ['#0A0E1A', '#00D4FF', '#7B2FFF', '#FF00E5'],

    // Colors
    primary: '#00D4FF',
    primaryEnd: '#7B2FFF',
    primaryLight: 'rgba(0, 212, 255, 0.12)',
    primaryAlpha20: 'rgba(0, 212, 255, 0.20)',
    primaryAlpha30: 'rgba(0, 212, 255, 0.30)',
    gradient: ['#00D4FF', '#7B2FFF'],
    background: '#0A0E1A',
    card: '#12162B',
    cardAlt: '#1A1F38',
    textPrimary: '#E8F0FF',
    textSecondary: '#8899BB',
    textTertiary: '#556688',
    border: '#1E2848',
    borderLight: '#151A30',

    // Border radius — compact / sharp
    borderRadius: { sm: 4, md: 6, lg: 10, xl: 14, xxl: 18, full: 999 },

    // Shadows — neon glow effect
    shadows: {
      card: {
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 4,
      },
      float: {
        shadowColor: '#7B2FFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 8,
      },
    },

    // ── Decoration config ──
    decorations: {
      // Grid lines on background
      showGrid: true,
      gridColor: 'rgba(0, 212, 255, 0.06)',
      gridSpacing: 40,
      // Scan lines (horizontal)
      showScanLines: true,
      scanLineColor: 'rgba(0, 212, 255, 0.03)',
      scanLineSpacing: 4,
      // Glowing corner brackets on cards
      showCornerBrackets: true,
      cornerColor: '#00D4FF',
      cornerLength: 12,
      cornerWidth: 2,
      // Top status bar style
      statusBarStyle: 'light-content',
      // Card border glow
      cardBorderWidth: 1,
      cardBorderColor: 'rgba(0, 212, 255, 0.20)',
      // Button style
      buttonGlow: true,
      buttonTextShadow: true,
    },
  },

  // ── 2. Dreamy: Soft gradient, frosted glass, pastel purple/pink/blue ──
  dreamy: {
    name: 'dreamy',
    label: 'Dreamy',
    description: '梦幻',
    emoji: '✨',
    isDark: false,
    previewColors: ['#FFF5F9', '#C084FC', '#F9A8D4', '#93C5FD'],

    primary: '#C084FC',
    primaryEnd: '#F9A8D4',
    primaryLight: 'rgba(192, 132, 252, 0.12)',
    primaryAlpha20: 'rgba(192, 132, 252, 0.20)',
    primaryAlpha30: 'rgba(192, 132, 252, 0.30)',
    gradient: ['#C084FC', '#F9A8D4'],
    background: '#FFF5F9',
    card: 'rgba(255, 255, 255, 0.75)',
    cardAlt: 'rgba(255, 245, 255, 0.6)',
    textPrimary: '#3B1F5E',
    textSecondary: '#8B6AAE',
    textTertiary: '#B89FD4',
    border: '#F0D8FF',
    borderLight: '#F8F0FF',

    borderRadius: { sm: 10, md: 14, lg: 18, xl: 22, xxl: 28, full: 999 },

    shadows: {
      card: {
        shadowColor: '#C084FC',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
      },
      float: {
        shadowColor: '#F9A8D4',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 5,
      },
    },

    decorations: {
      showGrid: false,
      showScanLines: false,
      showCornerBrackets: false,
      statusBarStyle: 'dark-content',
      cardBorderWidth: 0,
      cardBorderColor: 'transparent',
      buttonGlow: false,
      buttonTextShadow: false,
    },
  },

  // ── 3. Cartoon: Animation movie style (Zootopia-inspired) ──
  cartoon: {
    name: 'cartoon',
    label: 'Cartoon',
    description: '卡通',
    emoji: '🎨',
    isDark: false,
    previewColors: ['#FEFCE8', '#FB923C', '#4ADE80', '#F472B6'],

    primary: '#FB923C',
    primaryEnd: '#F472B6',
    primaryLight: 'rgba(251, 146, 60, 0.12)',
    primaryAlpha20: 'rgba(251, 146, 60, 0.20)',
    primaryAlpha30: 'rgba(251, 146, 60, 0.30)',
    gradient: ['#FB923C', '#F472B6'],
    background: '#FEFCE8',
    card: '#FFFFFF',
    cardAlt: '#FFF7ED',
    textPrimary: '#431407',
    textSecondary: '#9A6B47',
    textTertiary: '#C4A07A',
    border: '#FDE8CD',
    borderLight: '#FEF3E2',

    borderRadius: { sm: 14, md: 18, lg: 22, xl: 28, xxl: 32, full: 999 },

    shadows: {
      card: {
        shadowColor: '#FB923C',
        shadowOffset: { width: 3, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 0,
        elevation: 4,
      },
      float: {
        shadowColor: '#F472B6',
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 0,
        elevation: 6,
      },
    },

    // ── Decoration config ──
    decorations: {
      // Wavy top decoration
      showWavyTop: true,
      wavyColor: '#FB923C',
      wavyColor2: '#4ADE80',
      // Floating bubble dots
      showBubbles: true,
      bubbleColors: ['#FB923C', '#4ADE80', '#F472B6', '#FBBF24', '#60A5FA'],
      bubbleCount: 12,
      // Playful card decorations
      showCornerBrackets: false,
      // Status bar
      statusBarStyle: 'dark-content',
      // Card border — thick colorful
      cardBorderWidth: 2.5,
      cardBorderColor: '#FB923C',
      // Button style — bouncy
      buttonGlow: false,
      buttonTextShadow: false,
      buttonBounce: true,
    },
  },

  // ── 4. Minimalist: White background, minimal lines, high whitespace ──
  minimal: {
    name: 'minimal',
    label: 'Minimalist',
    description: '简洁',
    emoji: '📄',
    isDark: false,
    previewColors: ['#FFFFFF', '#2563EB', '#94A3B8', '#F1F5F9'],

    primary: '#2563EB',
    primaryEnd: '#3B82F6',
    primaryLight: 'rgba(37, 99, 235, 0.08)',
    primaryAlpha20: 'rgba(37, 99, 235, 0.20)',
    primaryAlpha30: 'rgba(37, 99, 235, 0.30)',
    gradient: ['#2563EB', '#3B82F6'],
    background: '#FFFFFF',
    card: '#F8FAFC',
    cardAlt: '#F1F5F9',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textTertiary: '#94A3B8',
    border: '#E2E8F0',
    borderLight: '#F1F5F9',

    borderRadius: { sm: 6, md: 8, lg: 12, xl: 16, xxl: 20, full: 999 },

    shadows: {
      card: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
      },
      float: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
      },
    },

    decorations: {
      showGrid: false,
      showScanLines: false,
      showCornerBrackets: false,
      statusBarStyle: 'dark-content',
      cardBorderWidth: 0,
      cardBorderColor: 'transparent',
      buttonGlow: false,
      buttonTextShadow: false,
    },
  },
};

// Style theme options for selector UI
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

// ── Current theme name (module-level state) ──

let _currentStyleThemeName = 'minimal';

/**
 * Set the current style theme by name
 * @param {string} themeName - 'sciFi' | 'dreamy' | 'cartoon' | 'minimal'
 */
export function setStyleTheme(themeName) {
  if (styleThemes[themeName]) {
    _currentStyleThemeName = themeName;
  }
}

/**
 * Get the current style theme name
 * @returns {string}
 */
export function getCurrentStyleThemeName() {
  return _currentStyleThemeName;
}

/**
 * Get a resolved theme object by style name
 * Merges the style's colors/radius/shadows into a flat object
 * compatible with the existing getTheme() API
 * @param {string} styleName
 * @returns {object}
 */
export function getStyleTheme(styleName) {
  const s = styleThemes[styleName] || styleThemes.minimal;
  return {
    // Colors
    primary: s.primary,
    primaryEnd: s.primaryEnd,
    primaryLight: s.primaryLight,
    primaryAlpha20: s.primaryAlpha20,
    primaryAlpha30: s.primaryAlpha30,
    gradient: s.gradient,
    background: s.background,
    card: s.card,
    cardAlt: s.cardAlt,
    textPrimary: s.textPrimary,
    textSecondary: s.textSecondary,
    textTertiary: s.textTertiary,
    border: s.border,
    borderLight: s.borderLight,
    isDark: s.isDark,

    // Radius
    borderRadius: s.borderRadius,

    // Shadows
    shadows: s.shadows,

    // Decorations
    decorations: s.decorations,

    // Meta
    name: s.name,
    label: s.label,
    description: s.description,
    emoji: s.emoji,
  };
}

export default styleThemes;

// ============================================================
// StyleDecorator — Renders style-specific background decorations
// Sci-Fi: grid lines + scan lines + corner brackets
// Cartoon: wavy top + floating bubbles + colorful borders
// Dreamy/Minimal: no extra decorations (clean)
// Pure RN, no native dependencies
// ============================================================

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Background decoration layer — renders behind content
 * @param {object} decorations - decoration config from styleThemes
 * @param {string} background - background color
 */
export function BackgroundDecorator({ decorations = {}, background }) {
  const { showGrid, showScanLines, showBubbles } = decorations;

  // ── Sci-Fi: Grid + Scan lines ──
  if (showGrid || showScanLines) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]} pointerEvents="none">
        {/* Vertical grid lines */}
        {showGrid &&
          Array.from({ length: 12 }).map((_, i) => (
            <View
              key={`vg${i}`}
              style={{
                position: 'absolute',
                left: i * decorations.gridSpacing,
                top: 0,
                bottom: 0,
                width: 1,
                backgroundColor: decorations.gridColor,
              }}
            />
          ))}
        {/* Horizontal grid lines */}
        {showGrid &&
          Array.from({ length: 25 }).map((_, i) => (
            <View
              key={`hg${i}`}
              style={{
                position: 'absolute',
                top: i * decorations.gridSpacing,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: decorations.gridColor,
              }}
            />
          ))}
        {/* Scan lines overlay */}
        {showScanLines &&
          Array.from({ length: 200 }).map((_, i) => (
            <View
              key={`sl${i}`}
              style={{
                position: 'absolute',
                top: i * decorations.scanLineSpacing,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: decorations.scanLineColor,
              }}
            />
          ))}
        {/* Top glow */}
        <View
          style={{
            position: 'absolute',
            top: -40,
            left: -40,
            width: 200,
            height: 200,
            borderRadius: 100,
            backgroundColor: 'rgba(0, 212, 255, 0.06)',
          }}
        />
        {/* Bottom-right glow */}
        <View
          style={{
            position: 'absolute',
            bottom: -60,
            right: -60,
            width: 250,
            height: 250,
            borderRadius: 125,
            backgroundColor: 'rgba(123, 47, 255, 0.05)',
          }}
        />
      </View>
    );
  }

  // ── Cartoon: Bubbles + wavy decoration ──
  if (showBubbles) {
    const bubbles = useMemo(() => {
      const items = [];
      const colors = decorations.bubbleColors || ['#FB923C', '#4ADE80', '#F472B6'];
      const count = decorations.bubbleCount || 10;
      // Deterministic pseudo-random positions based on index
      for (let i = 0; i < count; i++) {
        const seed = i * 137.5;
        const x = (seed * 0.618) % 100;
        const y = (seed * 0.382) % 100;
        const size = 6 + (i % 4) * 4;
        const opacity = 0.12 + (i % 3) * 0.06;
        items.push({ x, y, size, opacity, color: colors[i % colors.length], key: `b${i}` });
      }
      return items;
    }, [decorations.bubbleColors, decorations.bubbleCount]);

    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]} pointerEvents="none">
        {/* Wavy decoration at top */}
        {decorations.showWavyTop && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6 }}>
            {/* Stripe 1 */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: decorations.wavyColor || '#FB923C' }} />
            {/* Stripe 2 */}
            <View style={{ position: 'absolute', top: 2, left: 0, right: 0, height: 2, backgroundColor: decorations.wavyColor2 || '#4ADE80' }} />
            {/* Stripe 3 */}
            <View style={{ position: 'absolute', top: 4, left: 0, right: 0, height: 2, backgroundColor: '#F472B6' }} />
          </View>
        )}

        {/* Floating bubbles */}
        {bubbles.map((b) => (
          <View
            key={b.key}
            style={{
              position: 'absolute',
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: b.size,
              height: b.size,
              borderRadius: b.size / 2,
              backgroundColor: b.color,
              opacity: b.opacity,
            }}
          />
        ))}

        {/* Big soft glow in top-right */}
        <View
          style={{
            position: 'absolute',
            top: -80,
            right: -80,
            width: 250,
            height: 250,
            borderRadius: 125,
            backgroundColor: 'rgba(251, 146, 60, 0.06)',
          }}
        />
        {/* Soft glow in bottom-left */}
        <View
          style={{
            position: 'absolute',
            bottom: -100,
            left: -100,
            width: 300,
            height: 300,
            borderRadius: 150,
            backgroundColor: 'rgba(74, 222, 128, 0.05)',
          }}
        />
      </View>
    );
  }

  // ── Default: just background color ──
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]} pointerEvents="none" />
  );
}

/**
 * Card corner brackets decoration (Sci-Fi style)
 * Renders L-shaped brackets at each corner of the card
 * @param {object} decorations - decoration config from styleThemes
 * @param {object} borderRadius - border radius from theme
 */
export function CornerBrackets({ decorations = {}, borderRadius = 10 }) {
  if (!decorations.showCornerBrackets) return null;

  const {
    cornerColor = '#00D4FF',
    cornerLength = 12,
    cornerWidth = 2,
  } = decorations;

  const cornerStyle = {
    position: 'absolute',
    width: cornerLength,
    height: cornerLength,
    borderColor: cornerColor,
  };

  return (
    <>
      {/* Top-left */}
      <View style={[cornerStyle, { top: -1, left: -1, borderTopWidth: cornerWidth, borderLeftWidth: cornerWidth, borderTopLeftRadius: borderRadius }]} />
      {/* Top-right */}
      <View style={[cornerStyle, { top: -1, right: -1, borderTopWidth: cornerWidth, borderRightWidth: cornerWidth, borderTopRightRadius: borderRadius }]} />
      {/* Bottom-left */}
      <View style={[cornerStyle, { bottom: -1, left: -1, borderBottomWidth: cornerWidth, borderLeftWidth: cornerWidth, borderBottomLeftRadius: borderRadius }]} />
      {/* Bottom-right */}
      <View style={[cornerStyle, { bottom: -1, right: -1, borderBottomWidth: cornerWidth, borderRightWidth: cornerWidth, borderBottomRightRadius: borderRadius }]} />
    </>
  );
}

/**
 * Get style-specific card wrapper props
 * @param {object} theme - resolved theme from getTheme()
 * @returns {object} style object to spread onto card View
 */
export function getCardStyle(theme) {
  const deco = theme.decorations || {};
  return {
    borderWidth: deco.cardBorderWidth || 0,
    borderColor: deco.cardBorderColor || 'transparent',
  };
}

/**
 * Get style-specific button text shadow props
 * @param {object} theme - resolved theme from getTheme()
 * @returns {object} textShadow style object
 */
export function getButtonTextShadow(theme) {
  const deco = theme.decorations || {};
  if (deco.buttonTextShadow) {
    return {
      textShadowColor: theme.primary,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 8,
    };
  }
  return {};
}

/**
 * Get status bar style based on theme
 * @param {object} theme - resolved theme from getTheme()
 * @returns {string} 'light-content' or 'dark-content'
 */
export function getStatusBarStyle(theme) {
  const deco = theme.decorations || {};
  return deco.statusBarStyle || (theme.isDark ? 'light-content' : 'dark-content');
}

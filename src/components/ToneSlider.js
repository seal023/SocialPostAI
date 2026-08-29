// ============================================================
// ToneSlider — Tone thermometer 0-10 slider
// INLINE slider using onTouchStart/onTouchMove + pageX
// + measureInWindow — no external slider component needed
// ============================================================

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, getTheme } from '../themes/theme';
import { useLanguage } from '../context/LanguageContext';

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 6;

// Tone level labels indexed by slider value
const TONE_LEVEL_KEYS = [
  'tone_professional',  // 0
  'tone_professional',  // 1
  'tone_professional',  // 2
  'tone_formal_warm',   // 3
  'tone_formal_warm',   // 4
  'tone_lively_trendy', // 5
  'tone_lively_trendy', // 6
  'tone_casual_relaxed', // 7
  'tone_casual_relaxed', // 8
  'tone_conversational', // 9
  'tone_conversational', // 10
];

export default function ToneSlider({
  value = 5,
  onChange,
  themeName = 'pink',
}) {
  const theme = getTheme(themeName);
  const { t } = useLanguage();
  const clampedValue = Math.max(0, Math.min(10, Math.round(value)));
  const currentLabel = t(TONE_LEVEL_KEYS[clampedValue] || 'tone_professional');

  // ── Slider refs ──
  const trackRef = useRef(null);
  const trackPageXRef = useRef(0);
  const trackWidthRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(clampedValue);
  valueRef.current = clampedValue;

  const [trackWidth, setTrackWidth] = useState(0);

  // ── Snap to step=1 for tone (0-10) ──
  const snapValue = (raw) => {
    const snapped = Math.round(raw);
    return Math.max(0, Math.min(10, snapped));
  };

  // ── Measure track position using measureInWindow ──
  const measureTrack = useCallback(() => {
    if (trackRef.current) {
      trackRef.current.measureInWindow((x, y, width) => {
        trackPageXRef.current = x;
        trackWidthRef.current = width;
        setTrackWidth(width);
      });
    }
  }, []);

  // ── Convert screen pageX → slider value ──
  const pageXToValue = useCallback((pageX) => {
    const w = trackWidthRef.current;
    if (w <= 0) return valueRef.current; // Keep current if not measured
    const localX = pageX - trackPageXRef.current;
    const ratio = Math.max(0, Math.min(1, localX / w));
    return snapValue(ratio * 10);
  }, []);

  // ── Touch handlers ──
  // Handles BOTH touch events (onTouchStart/onTouchMove) and
  // responder events (onResponderGrant/onResponderMove).
  // Touch events: pageX is in e.nativeEvent.touches[0].pageX
  // Responder events: pageX is in e.nativeEvent.pageX directly
  const handleTouch = useCallback((e) => {
    let pageX = null;
    // Try touches[] first (onTouchStart/onTouchMove)
    if (e.nativeEvent.touches && e.nativeEvent.touches.length > 0) {
      pageX = e.nativeEvent.touches[0].pageX;
    }
    // Fallback: pageX on nativeEvent directly (onResponderGrant/onResponderMove)
    if (pageX === null || !Number.isFinite(pageX)) {
      pageX = e.nativeEvent.pageX;
    }
    if (!Number.isFinite(pageX)) return;
    // Re-measure on each touch (layout may have changed due to scroll)
    measureTrack();
    const newVal = pageXToValue(pageX);
    if (onChangeRef.current) onChangeRef.current(newVal);
  }, [measureTrack, pageXToValue]);

  // ── Visual calculations ──
  const ratio = trackWidth > 0 ? clampedValue / 10 : clampedValue / 10;
  const thumbLeft = trackWidth > 0 ? ratio * trackWidth - THUMB_SIZE / 2 : -THUMB_SIZE;
  const activeWidth = trackWidth > 0 ? ratio * trackWidth : 0;

  return (
    <View style={styles.container}>
      {/* Title row with badge */}
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.title }]}>
          {t('tone_thermometer')}
        </Text>
        <View style={[styles.badge, { backgroundColor: theme.primaryLight }]}>
          <Text style={[styles.badgeText, { color: theme.primary }]}>
            {clampedValue} · {currentLabel}
          </Text>
        </View>
      </View>

      {/* Level labels row */}
      <View style={styles.levelRow}>
        <Text style={[styles.levelLabel, { color: COLORS.BASE.subtitle }]}>
          {t('tone_0_2')}
        </Text>
        <Text style={[styles.levelLabel, { color: COLORS.BASE.subtitle }]}>
          {t('tone_5_6')}
        </Text>
        <Text style={[styles.levelLabel, { color: COLORS.BASE.subtitle }]}>
          {t('tone_9_10')}
        </Text>
      </View>

      {/* ── INLINE SLIDER ── */}
      <View
        ref={trackRef}
        style={styles.trackContainer}
        onLayout={measureTrack}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
      >
        {/* Background track */}
        <View style={[styles.track, { backgroundColor: COLORS.BASE.borderLight }]} pointerEvents="none" />
        {/* Active track */}
        <View style={[styles.activeTrack, { backgroundColor: theme.primary, width: activeWidth }]} pointerEvents="none" />
        {/* Thumb */}
        <View style={[styles.thumb, { backgroundColor: theme.primary, left: thumbLeft }]} pointerEvents="none" />
      </View>

      {/* Scale numbers */}
      <View style={styles.scaleRow}>
        {Array.from({ length: 11 }, (_, i) => (
          <Text
            key={i}
            style={[
              styles.scaleNum,
              i <= clampedValue
                ? { color: theme.primary }
                : { color: COLORS.BASE.placeholder },
            ]}
          >
            {i}
          </Text>
        ))}
      </View>

      {/* Hint */}
      <Text style={[styles.hint, { color: COLORS.BASE.placeholder }]}>
        {t('tone_hint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  badgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  levelLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
  },

  // ── Inline slider styles ──
  trackContainer: {
    width: '100%',
    height: 44,
    position: 'relative',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (44 - TRACK_HEIGHT) / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  activeTrack: {
    position: 'absolute',
    left: 0,
    top: (44 - TRACK_HEIGHT) / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    top: (44 - THUMB_SIZE) / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },

  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
  },
  scaleNum: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    width: 16,
    textAlign: 'center',
  },
  hint: {
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});

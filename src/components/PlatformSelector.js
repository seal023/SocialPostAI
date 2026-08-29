// ============================================================
// PlatformSelector — Horizontal scrolling platform chips
// Shows exactly 4.5 icons to hint scrollable content
// Right-side fade hint using layered semi-transparent views
// Dynamic sizing via onLayout — works on all screen widths
// ============================================================

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SHADOWS, getTheme } from '../themes/theme';
import { useLanguage } from '../context/LanguageContext';

// Map platform.name (lowercase) to i18n translation key
const NAME_KEY_MAP = {
  viral: 'platform_viral',
  visual: 'platform_visual',
  brief: 'platform_brief',
  community: 'platform_community',
  professional: 'platform_professional',
  video: 'platform_video',
  discover: 'platform_discover',
  chat: 'platform_chat',
};

const VISIBLE_CHIPS = 4.5; // Show 4 full + 1 half

export default function PlatformSelector({
  platforms = [],
  selectedPlatforms = [],
  onToggle,
  themeName = 'pink',
}) {
  const theme = getTheme(themeName);
  const { t } = useLanguage();

  // ── Measure container width for dynamic chip sizing ──
  const [containerWidth, setContainerWidth] = useState(0);
  const handleLayout = useCallback((e) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  // ── Dynamic dimensions ──
  // chipSlot = full width per chip including gap
  const chipSlot = containerWidth > 0 ? containerWidth / VISIBLE_CHIPS : 80;
  const chipGap = Math.max(6, Math.round(chipSlot * 0.08));
  const chipWidth = chipSlot - chipGap;
  const iconSize = Math.max(40, Math.min(52, Math.round(chipWidth * 0.55)));
  const emojiSize = Math.max(28, Math.min(32, Math.round(iconSize * 0.75)));

  // ── Press animation ──
  const scaleAnims = useRef(
    platforms.reduce((acc, p) => {
      acc[p.id] = new Animated.Value(1);
      return acc;
    }, {})
  ).current;

  const handlePressIn = (id) => {
    Animated.spring(scaleAnims[id], {
      toValue: 0.93,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = (id) => {
    Animated.spring(scaleAnims[id], {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  const handleToggle = (id) => {
    if (!onToggle) return;
    let updated;
    if (selectedPlatforms.includes(id)) {
      updated = selectedPlatforms.filter((pid) => pid !== id);
    } else {
      updated = [...selectedPlatforms, id];
    }
    onToggle(updated);
  };

  const renderChip = (platform) => {
    const isSelected = selectedPlatforms.includes(platform.id);
    const scaleAnim = scaleAnims[platform.id] || new Animated.Value(1);

    return (
      <Animated.View
        key={platform.id}
        style={[
          { width: chipWidth, marginRight: chipGap },
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.chip,
            isSelected && {
              borderColor: theme.primary,
              backgroundColor: theme.primaryLight,
            },
          ]}
          onPress={() => handleToggle(platform.id)}
          onPressIn={() => handlePressIn(platform.id)}
          onPressOut={() => handlePressOut(platform.id)}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.iconCircle,
              { width: iconSize, height: iconSize, borderRadius: iconSize / 2 },
              isSelected && { backgroundColor: theme.primaryAlpha20 },
            ]}
          >
            <Text style={[styles.iconEmoji, { fontSize: emojiSize }]}>
              {platform.icon}
            </Text>
          </View>
          <Text
            style={[
              styles.chipLabel,
              isSelected
                ? { color: theme.primary }
                : { color: COLORS.BASE.subtitle },
            ]}
            numberOfLines={1}
          >
            {(() => {
              const key = NAME_KEY_MAP[platform.name.toLowerCase()];
              return key ? t(key) : platform.name;
            })()}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Fade background = card background color
  const fadeColor = COLORS.BASE.card;

  // Fade width proportional to one chip (the 0.5 visible part)
  const fadeWidth = containerWidth > 0 ? Math.round(chipSlot * 0.55) : 45;

  // 10 stripes for smooth gradient
  const fadeOpacitySteps = [0, 0.03, 0.08, 0.15, 0.25, 0.38, 0.52, 0.68, 0.82, 0.94, 1.0];

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Text style={[styles.title, { color: theme.title }]}>
        {t('select_platform')}
      </Text>

      <View style={styles.scrollWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          scrollEventThrottle={16}
        >
          {platforms.map(renderChip)}
        </ScrollView>

        {/* Right fade hint — smooth gradient using layered Views
            Width = ~55% of one chip slot (the half-visible area)
            11 stripes from opacity 0 → 1.0 */}
        <View
          style={[styles.fadeContainer, { width: fadeWidth }]}
          pointerEvents="none"
        >
          {fadeOpacitySteps.map((opacity, i) => (
            <View
              key={i}
              style={[
                styles.fadeStripe,
                {
                  backgroundColor: fadeColor,
                  opacity,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  scrollWrapper: {
    position: 'relative',
  },
  scrollContent: {
    paddingVertical: SPACING.xs,
  },
  chip: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.BASE.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  iconCircle: {
    backgroundColor: COLORS.BASE.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  iconEmoji: {
    // fontSize set dynamically
  },
  chipLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
    textAlign: 'center',
  },

  // ── Fade overlay ──
  fadeContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  fadeStripe: {
    flex: 1,
  },
});

// ============================================================
// StyleSelector — Horizontal row of compact style chips
// Single select with animated spring press feedback
// ============================================================

import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SHADOWS, getTheme } from '../themes/theme';
import { useLanguage } from '../context/LanguageContext';

// i18n key mapping for style labels
const STYLE_LABEL_KEYS = {
  lively: 'style_lively',
  professional: 'style_formal',
  casual: 'style_casual',
  storytelling: 'style_elegant',
  formal: 'style_formal',
  elegant: 'style_elegant',
};

export default function StyleSelector({
  styles: stylesProp,
  selectedStyle,
  onSelect,
  themeName = 'pink',
}) {
  const theme = getTheme(themeName);
  const { t } = useLanguage();
  const styleList = stylesProp || [];

  const scaleAnims = useRef(
    styleList.reduce((acc, s) => {
      acc[s.id] = new Animated.Value(1);
      return acc;
    }, {})
  ).current;

  const handlePressIn = (id) => {
    if (scaleAnims[id]) {
      Animated.spring(scaleAnims[id], {
        toValue: 0.95,
        useNativeDriver: true,
      }).start();
    }
  };

  const handlePressOut = (id) => {
    if (scaleAnims[id]) {
      Animated.spring(scaleAnims[id], {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  };

  const renderCard = (styleItem) => {
    const isSelected = selectedStyle === styleItem.id;
    const scaleAnim = scaleAnims[styleItem.id] || new Animated.Value(1);
    const label = STYLE_LABEL_KEYS[styleItem.id]
      ? t(STYLE_LABEL_KEYS[styleItem.id])
      : styleItem.label;

    return (
      <Animated.View
        key={styleItem.id}
        style={{ transform: [{ scale: scaleAnim }] }}
      >
        <TouchableOpacity
          style={[
            styles.card,
            isSelected && {
              borderColor: theme.primary,
              backgroundColor: theme.primaryLight,
              borderWidth: 2,
            },
          ]}
          onPress={() => onSelect && onSelect(styleItem.id)}
          onPressIn={() => handlePressIn(styleItem.id)}
          onPressOut={() => handlePressOut(styleItem.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.emoji}>{styleItem.emoji}</Text>
          <Text
            style={[
              styles.label,
              isSelected
                ? { color: theme.primary, fontWeight: '700' }
                : { color: COLORS.BASE.subtitle },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {isSelected && (
            <Text style={[styles.checkIcon, { color: theme.primary }]}>✓</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.title }]}>
        {t('select_style')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {styleList.map(renderCard)}
      </ScrollView>
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
  row: {
    flexDirection: 'row',
    paddingVertical: SPACING.xs,
  },
  card: {
    width: 96,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: COLORS.BASE.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 8,
    backgroundColor: COLORS.BASE.card,
    ...SHADOWS.card,
  },
  emoji: {
    fontSize: 18,
    marginRight: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  checkIcon: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 4,
  },
});

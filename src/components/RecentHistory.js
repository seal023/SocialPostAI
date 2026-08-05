// ============================================================
// RecentHistory — Horizontal scrolling recent 3 records
// Each card shows platform icons, topic, preview, char count, time
// ============================================================

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SHADOWS, getTheme } from '../themes/theme';
import { PLATFORMS } from '../utils/mockData';
import { useLanguage } from '../context/LanguageContext';

function formatTime(dateString, t) {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return t('just_now');
  if (diffMin < 60) return t('min_ago', { count: diffMin });
  if (diffHr < 24) return t('hr_ago', { count: diffHr });
  if (diffDay < 7) return t('day_ago', { count: diffDay });
  // Date format: M/D
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function RecentHistory({
  history = [],
  onPress,
  themeName = 'pink',
}) {
  const theme = getTheme(themeName);
  const { t } = useLanguage();

  if (!history || history.length === 0) return null;

  const renderCard = (item) => {
    const platformIcons = (item.platforms || []).map((pid) => {
      const p = PLATFORMS.find((pl) => pl.id === pid);
      return p ? p.icon : '';
    });

    const preview = item.text
      ? item.text.length > 80
        ? item.text.substring(0, 80) + '...'
        : item.text
      : '';

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, { backgroundColor: COLORS.BASE.card }]}
        onPress={() => onPress && onPress(item)}
        activeOpacity={0.7}
      >
        {/* Platform icons row */}
        <View style={styles.platformRow}>
          {platformIcons.map((icon, idx) => (
            <Text key={idx} style={styles.platformIcon}>
              {icon}
            </Text>
          ))}
        </View>

        {/* Topic */}
        <Text style={[styles.topic, { color: theme.title }]} numberOfLines={1}>
          {item.topic || t('untitled')}
        </Text>

        {/* Preview */}
        <Text style={[styles.preview, { color: COLORS.BASE.body }]} numberOfLines={2}>
          {preview}
        </Text>

        {/* Footer: char count + time */}
        <View style={styles.footer}>
          <Text style={[styles.meta, { color: COLORS.BASE.placeholder }]}>
            {item.charCount || (item.text ? item.text.length : 0)} {t('chars')}
          </Text>
          <Text style={[styles.meta, { color: COLORS.BASE.placeholder }]}>
            {formatTime(item.createdAt, t)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.title }]}>
        {t('recent')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {history.slice(0, 3).map(renderCard)}
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
  scrollContent: {
    paddingVertical: SPACING.xs,
  },
  card: {
    width: 200,
    marginRight: SPACING.md,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.BASE.border,
    ...SHADOWS.card,
  },
  platformRow: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
  platformIcon: {
    fontSize: 14,
    marginRight: SPACING.xs,
  },
  topic: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  preview: {
    fontSize: FONT_SIZE.xs,
    lineHeight: 16,
    marginBottom: SPACING.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    fontSize: FONT_SIZE.xs,
  },
});

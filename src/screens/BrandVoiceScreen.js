// ============================================================
// BrandVoiceScreen — Brand Voice Learning
// User pastes 3-5 historical copy samples
// These are injected into the AI prompt as voice reference
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SHADOWS, getTheme } from '../themes/theme';
import {
  getBrandVoiceSamples,
  saveBrandVoiceSamples,
  clearBrandVoiceSamples,
} from '../utils/storage';
import { useLanguage } from '../context/LanguageContext';

const MIN_SAMPLES = 2;
const MAX_SAMPLES = 5;

export default function BrandVoiceScreen({ themeName = 'pink', onBack }) {
  const theme = getTheme(themeName);
  const { t } = useLanguage();

  // Initialize with empty slots
  const [samples, setSamples] = useState(Array(MAX_SAMPLES).fill(''));
  const [isSaving, setIsSaving] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  const backScale = React.useRef(new Animated.Value(1)).current;
  const saveScale = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadSamples();
  }, []);

  const loadSamples = async () => {
    const existing = await getBrandVoiceSamples();
    if (existing.length > 0) {
      const filled = [...existing, ...Array(MAX_SAMPLES - existing.length).fill('')];
      setSamples(filled.slice(0, MAX_SAMPLES));
      setHasExisting(true);
    }
  };

  // ---- Update a single sample ----
  const handleSampleChange = (index, text) => {
    const updated = [...samples];
    updated[index] = text;
    setSamples(updated);
  };

  // ---- Count filled samples ----
  const filledCount = samples.filter((s) => s.trim().length > 5).length;

  // ---- Save ----
  const handleSave = async () => {
    const validSamples = samples.filter((s) => s.trim().length > 5);

    if (validSamples.length < MIN_SAMPLES) {
      Alert.alert(
        t('need_more_samples'),
        t('need_more_desc', { count: MIN_SAMPLES, current: validSamples.length }),
        [{ text: t('ok') }],
      );
      return;
    }

    setIsSaving(true);

    Animated.sequence([
      Animated.spring(saveScale, { toValue: 0.95, useNativeDriver: true }),
      Animated.spring(saveScale, { toValue: 1, useNativeDriver: true }),
    ]).start();

    try {
      await saveBrandVoiceSamples(validSamples);
      setHasExisting(true);
      Alert.alert(
        t('brand_voice_saved'),
        t('brand_voice_saved_desc', { count: validSamples.length }),
        [{ text: t('ok') }],
      );
    } catch (error) {
      Alert.alert(t('save_failed'), t('save_failed_desc'), [{ text: t('ok') }]);
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Clear ----
  const handleClear = () => {
    Alert.alert(t('clear_brand_voice'), t('clear_brand_voice_desc'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('clear'),
        style: 'destructive',
        onPress: async () => {
          await clearBrandVoiceSamples();
          setSamples(Array(MAX_SAMPLES).fill(''));
          setHasExisting(false);
        },
      },
    ]);
  };

  // ---- Back ----
  const handleBack = () => {
    Animated.sequence([
      Animated.spring(backScale, { toValue: 0.95, useNativeDriver: true }),
      Animated.spring(backScale, { toValue: 1, useNativeDriver: true }),
    ]).start(() => {
      if (onBack) onBack();
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="dark-content" />

      {/* Nav bar */}
      <View style={[styles.navBar, { backgroundColor: theme.background }]}>
        <Animated.View style={{ transform: [{ scale: backScale }] }}>
          <TouchableOpacity onPress={handleBack} style={styles.navBackBtn} activeOpacity={0.7}>
            <Text style={[styles.navBackText, { color: theme.primary }]}>{t('back')}</Text>
          </TouchableOpacity>
        </Animated.View>
        <Text style={[styles.navTitle, { color: theme.title }]}>{t('brand_voice_title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Explanation card */}
        <View style={[styles.introCard, { backgroundColor: COLORS.BASE.card, borderColor: COLORS.BASE.border }]}>
          <Text style={styles.introIcon}>🎙️</Text>
          <Text style={[styles.introTitle, { color: theme.title }]}>
            {t('teach_ai_voice')}
          </Text>
          <Text style={[styles.introDesc, { color: COLORS.BASE.subtitle }]}>
            {t('brand_voice_desc')}
          </Text>
        </View>

        {/* Status badge */}
        <View style={styles.statusRow}>
          <Text style={[styles.statusLabel, { color: COLORS.BASE.subtitle }]}>
            {filledCount} of {MAX_SAMPLES} samples
          </Text>
          {hasExisting && (
            <View style={[styles.activeBadge, { backgroundColor: COLORS.BASE.success + '20' }]}>
              <Text style={[styles.activeBadgeText, { color: COLORS.BASE.success }]}>
                ● {t('active')}
              </Text>
            </View>
          )}
          {!hasExisting && filledCount === 0 && (
            <View style={[styles.activeBadge, { backgroundColor: COLORS.BASE.warning + '20' }]}>
              <Text style={[styles.activeBadgeText, { color: COLORS.BASE.warning }]}>
                ○ {t('not_set')}
              </Text>
            </View>
          )}
        </View>

        {/* Sample inputs */}
        {samples.map((sample, index) => (
          <View key={index} style={styles.sampleSection}>
            <View style={styles.sampleLabelRow}>
              <Text style={[styles.sampleLabel, { color: theme.title }]}>
                {t('sample')} {index + 1}
              </Text>
              {index < MIN_SAMPLES && (
                <View style={[styles.requiredBadge, { backgroundColor: theme.primaryLight }]}>
                  <Text style={[styles.requiredText, { color: theme.primary }]}>{t('required')}</Text>
                </View>
              )}
              {index >= MIN_SAMPLES && (
                <Text style={[styles.optionalText, { color: COLORS.BASE.placeholder }]}>
                  {t('optional')}
                </Text>
              )}
            </View>
            <View style={[styles.sampleInputWrapper, { borderColor: COLORS.BASE.border }]}>
              <TextInput
                style={[styles.sampleInput, { color: theme.title }]}
                value={sample}
                onChangeText={(text) => handleSampleChange(index, text)}
                placeholder={`Paste your ${getOrdinal(index + 1)} best copy example here...`}
                placeholderTextColor={COLORS.BASE.placeholder}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={1000}
              />
              <View style={styles.sampleFooter}>
                <Text style={[styles.sampleCharCount, { color: COLORS.BASE.placeholder }]}>
                  {sample.length}/1000
                </Text>
                {sample.length > 5 && (
                  <Text style={styles.sampleCheckIcon}>✓</Text>
                )}
              </View>
            </View>
          </View>
        ))}

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <Animated.View style={{ flex: 1, transform: [{ scale: saveScale }] }}>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                {
                  backgroundColor: filledCount >= MIN_SAMPLES ? theme.primary : COLORS.BASE.placeholder,
                },
              ]}
              onPress={handleSave}
              disabled={isSaving || filledCount < MIN_SAMPLES}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>
                {isSaving ? 'Saving...' : 'Save Brand Voice'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {hasExisting && (
            <TouchableOpacity
              style={[styles.clearBtn, { borderColor: COLORS.BASE.danger }]}
              onPress={handleClear}
              activeOpacity={0.7}
            >
              <Text style={[styles.clearBtnText, { color: COLORS.BASE.danger }]}>{t('clear_all')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tips */}
        <View style={[styles.tipsCard, { backgroundColor: theme.primaryLight }]}>
          <Text style={[styles.tipsTitle, { color: theme.primary }]}>{t('tips')}</Text>
          <Text style={[styles.tipsText, { color: theme.primary }]}>
            {t('tip_1')}{'\n'}
            {t('tip_2')}{'\n'}
            {t('tip_3')}{'\n'}
            {t('tip_4')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- Helpers ----

function getOrdinal(n) {
  const ordinals = ['first', 'second', 'third', 'fourth', 'fifth'];
  return ordinals[n - 1] || n + 'th';
}

// ---- Styles ----

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Nav bar
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
  },
  navBackBtn: {
    padding: SPACING.sm,
  },
  navBackText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
  navTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxxl + 40,
  },

  // Intro card
  introCard: {
    padding: SPACING.xl,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  introIcon: {
    fontSize: 36,
    marginBottom: SPACING.sm,
  },
  introTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  introDesc: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
    textAlign: 'center',
  },

  // Status
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  statusLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
  activeBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  activeBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },

  // Sample input
  sampleSection: {
    marginBottom: SPACING.lg,
  },
  sampleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sampleLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    marginRight: SPACING.sm,
  },
  requiredBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  requiredText: {
    fontSize: 10,
    fontWeight: '700',
  },
  optionalText: {
    fontSize: FONT_SIZE.xs,
  },
  sampleInputWrapper: {
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    backgroundColor: COLORS.BASE.card,
    ...SHADOWS.card,
  },
  sampleInput: {
    fontSize: FONT_SIZE.sm,
    minHeight: 80,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  sampleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  sampleCharCount: {
    fontSize: FONT_SIZE.xs,
  },
  sampleCheckIcon: {
    color: COLORS.BASE.success,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.xxl,
  },
  saveBtn: {
    height: 48,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.float,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  clearBtn: {
    height: 48,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  clearBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },

  // Tips
  tipsCard: {
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
  },
  tipsTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  tipsText: {
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
  },
});

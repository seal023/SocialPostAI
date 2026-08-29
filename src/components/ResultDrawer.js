// ============================================================
// ResultDrawer — Bottom sheet with editable text, action buttons,
// cultural check, and share functionality
// Copy → clipboard | Share → system share | Favorite → toggle
// Regenerate → re-run generation
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  ScrollView,
  Share,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SHADOWS, getTheme } from '../themes/theme';
import { updateHistory } from '../utils/storage';
import { useLanguage } from '../context/LanguageContext';
import { getPermissions } from '../utils/permissions';
import CulturalCheck from './CulturalCheck';

export default function ResultDrawer({
  visible = false,
  result = null,
  onClose,
  onRegenerate,
  onFavorite,
  onSave,
  themeName = 'pink',
}) {
  const theme = getTheme(themeName);
  const { t } = useLanguage();
  const [permissions, setPermissions] = useState(null);

  // Load permissions when drawer becomes visible
  useEffect(() => {
    if (visible) {
      getPermissions().then(setPermissions);
    }
  }, [visible]);
  const [editedText, setEditedText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [charCount, setCharCount] = useState(0);
  // Initialize slideAnim to 1 so the drawer starts at visible position (translateY: 0)
  const slideAnim = useRef(new Animated.Value(1)).current;
  const btnScales = useRef({
    copy: new Animated.Value(1),
    regenerate: new Animated.Value(1),
    favorite: new Animated.Value(1),
    share: new Animated.Value(1),
  }).current;

  // Sync edited text when result changes
  useEffect(() => {
    if (result) {
      let text = '';
      if (result.text) {
        text = result.text;
      } else if (result.results && typeof result.results === 'object') {
        text = Object.values(result.results).join('\n\n---\n\n');
      }
      setEditedText(text);
      setOriginalText(text);
      setCharCount(text.length);
    } else {
      setEditedText('');
      setOriginalText('');
      setCharCount(0);
    }
  }, [result]);

  // Animate slide in/out
  useEffect(() => {
    const shouldShow = visible && !!result;
    if (shouldShow) {
      Animated.spring(slideAnim, {
        toValue: 1,
        friction: 9,
        tension: 50,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, result]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  // ---- Animated button press ----
  // Fire callback immediately; animation runs in parallel for visual feedback.
  // Previous version waited for the spring to finish, adding 300-500ms latency.
  const animateButton = (key, callback) => {
    if (callback) callback();
    Animated.sequence([
      Animated.spring(btnScales[key], {
        toValue: 0.92,
        useNativeDriver: true,
      }),
      Animated.spring(btnScales[key], {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // ---- Copy to clipboard ----
  const handleCopy = async () => {
    const textToCopy = editedText || '';
    if (!textToCopy) {
      Alert.alert(t('nothing_to_copy'), t('nothing_to_copy_desc'));
      return;
    }
    try {
      await Clipboard.setStringAsync(textToCopy);
      Alert.alert(t('copied'), t('copied_to_clipboard'));
    } catch (error) {
      console.error('[ResultDrawer] Copy failed:', error);
      Alert.alert(t('copy_failed'), t('copy_failed_desc'));
    }
  };

  // ---- Regenerate ----
  const handleRegenerate = () => {
    if (onRegenerate) onRegenerate();
  };

  // ---- Favorite toggle (delegates to parent, which handles AsyncStorage) ----
  const handleFavorite = async () => {
    if (!result) return;
    if (!permissions?.canFavorite) {
      Alert.alert(t('locked'), t('feature_locked_upgrade'));
      return;
    }
    // Only notify parent — do NOT call toggleFavorite here
    // The parent's onFavorite handler already calls toggleFavorite
    if (onFavorite) onFavorite(result);
  };

  // ---- Share (system share sheet) ----
  const handleShare = async () => {
    const textToShare = editedText || '';
    if (!textToShare) {
      Alert.alert(t('nothing_to_copy'), t('nothing_to_copy_desc'));
      return;
    }
    try {
      await Share.share({
        message: textToShare,
        title: result?.topic || 'SocialPost AI',
      });
    } catch (error) {
      console.error('[ResultDrawer] Share failed:', error);
      Alert.alert(t('share_failed'), t('share_failed_desc'));
    }
  };

  // ---- Save (persist edited text to AsyncStorage) ----
  const handleSave = async () => {
    if (!result) return;
    try {
      await updateHistory(result.id, { text: editedText });
      Alert.alert('✅ ' + t('saved'), t('copy_saved'));
      if (onSave) onSave({ id: result.id, editedText });
    } catch (error) {
      console.error('[ResultDrawer] Save failed:', error);
    }
  };

  // ---- Handle text change — explicitly update both editedText and charCount ----
  const handleTextChanged = (newText) => {
    setEditedText(newText);
    setCharCount(newText.length);
  };

  // Check if text has been modified
  const hasUnsavedChanges = editedText !== originalText;

  // Close handler with unsaved changes check
  const handleClose = () => {
    if (hasUnsavedChanges) {
      Alert.alert(
        t('unsaved_changes_title'),
        t('unsaved_changes_desc'),
        [
          {
            text: t('dont_save'),
            style: 'destructive',
            onPress: () => {
              if (onClose) onClose();
            },
          },
          {
            text: t('cancel'),
            style: 'cancel',
          },
          {
            text: t('save'),
            onPress: () => {
              handleSave();
              if (onClose) onClose();
            },
          },
        ],
        { cancelable: true },
      );
    } else {
      if (onClose) onClose();
    }
  };

  // Don't render Modal if there's nothing to show and it's not visible
  if (!result && !visible) {
    return null;
  }

  // Platform icon mapping
  const platformIcons = (result?.platforms || []).map((pid) => {
    const iconMap = {
      tiktok: '🎵',
      instagram: '📸',
      twitter: '🐦',
      facebook: '👍',
      linkedin: '💼',
      youtube: '▶️',
      pinterest: '📌',
      threads: '🧵',
    };
    return iconMap[pid] || '📱';
  });

  return (
    <Modal
      visible={!!(visible && result)}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouch}
          activeOpacity={1}
          onPress={handleClose}
        />
        <Animated.View
          style={[
            styles.drawer,
            { backgroundColor: COLORS.BASE.card, transform: [{ translateY }] },
          ]}
        >
          {/* Drag handle */}
          <View style={styles.dragHandleContainer}>
            <View style={[styles.dragHandle, { backgroundColor: COLORS.BASE.border }]} />
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title */}
            <Text style={[styles.drawerTitle, { color: theme.title }]}>
                ✨ {t('copy_generated')}
              </Text>

              {/* Source + Brand Voice badges */}
              <View style={styles.sourceBadgeRow}>
                {/* AI Disclaimer badge — always shown */}
                <View style={[styles.sourceBadge, { backgroundColor: COLORS.BASE.subtitle + '20' }]}>
                  <Text style={[styles.sourceBadgeText, { color: COLORS.BASE.subtitle }]}>
                    🤖 {t('generated_by_ai')}
                  </Text>
                </View>
                {result?.source === 'ai' && (
                  <View style={[styles.sourceBadge, { backgroundColor: COLORS.BASE.success + '20' }]}>
                    <Text style={[styles.sourceBadgeText, { color: COLORS.BASE.success }]}>
                      {t('ai_generated')}
                    </Text>
                  </View>
                )}
                {result?.source === 'ai' && result?.provider && (
                  <View style={[styles.sourceBadge, { backgroundColor: '#6366F120' }]}>
                    <Text style={[styles.sourceBadgeText, { color: '#6366F1' }]}>
                      {t('via_provider', { provider: result.provider })}
                    </Text>
                  </View>
                )}
                {result?.source === 'mock' && (
                  <View style={[styles.sourceBadge, { backgroundColor: COLORS.BASE.warning + '20' }]}>
                    <Text style={[styles.sourceBadgeText, { color: COLORS.BASE.warning }]}>
                      {t('mock_preview')}
                    </Text>
                  </View>
                )}
                {result?.usedBrandVoice && (
                  <View style={[styles.sourceBadge, { backgroundColor: '#8B5CF620' }]}>
                    <Text style={[styles.sourceBadgeText, { color: '#8B5CF6' }]}>
                      {t('brand_voice_badge')}
                    </Text>
                  </View>
                )}
              </View>

              {/* Platform tags */}
              <View style={styles.platformTags}>
                {platformIcons.map((icon, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.platformTag,
                      { backgroundColor: theme.primaryLight },
                    ]}
                  >
                    <Text style={styles.platformTagIcon}>{icon}</Text>
                  </View>
                ))}
              </View>

              {/* Editable text */}
              <View
                style={[
                  styles.textInputWrapper,
                  { borderColor: COLORS.BASE.border },
                ]}
              >
                <View style={styles.textInputHeader}>
                  <Text style={[styles.textInputLabel, { color: COLORS.BASE.subtitle }]}>
                    {t('copy_generated')}
                  </Text>
                  <Text style={[styles.charCountLabel, { color: theme.primary }]}>
                    {charCount} {t('chars')}
                  </Text>
                </View>
                <TextInput
                  style={[styles.textInput, { color: theme.body }]}
                  value={editedText}
                  onChangeText={handleTextChanged}
                  multiline
                  minHeight={120}
                  textAlignVertical="top"
                  placeholder={t('placeholder_generated')}
                  placeholderTextColor={COLORS.BASE.placeholder}
                />
              </View>

            {/* Cultural check — Pro only */}
            {permissions?.canUseCulturalCheck ? (
              <View style={styles.culturalCheckWrapper}>
                <CulturalCheck text={editedText} themeName={themeName} />
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.culturalCheckLocked, { borderColor: theme.borderLight }]}
                onPress={() => {
                  Alert.alert(
                    t('pro_feature_lock'),
                    t('pro_feature_lock_desc'),
                    [
                      { text: t('cancel'), style: 'cancel' },
                      { text: t('upgrade_pro'), style: 'default', onPress: () => {
                        // Navigate to Profile for upgrade
                        if (onClose) onClose();
                      }},
                    ]
                  );
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.culturalCheckLockedIcon, { color: theme.subtitle }]}>🔒</Text>
                <Text style={[styles.culturalCheckLockedText, { color: theme.subtitle }]}>
                  {t('cultural_fit_check')} · {t('pro_only_feature')}
                </Text>
                <Text style={[styles.culturalCheckLockedCta, { color: theme.primary }]}>
                  {t('upgrade_pro')} →
                </Text>
              </TouchableOpacity>
            )}

            {/* Action buttons — 5 actions */}
            <View style={styles.actionsRow}>
              {/* Copy */}
              <Animated.View style={{ transform: [{ scale: btnScales.copy }] }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.primaryLight }]}
                  onPress={() => animateButton('copy', handleCopy)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionIcon}>📋</Text>
                  <Text style={[styles.actionLabel, { color: theme.primary }]}>{t('copy')}</Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Share (replaces Save) */}
              <Animated.View style={{ transform: [{ scale: btnScales.share }] }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.primaryLight }]}
                  onPress={() => animateButton('share', handleShare)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionIcon}>📤</Text>
                  <Text style={[styles.actionLabel, { color: theme.primary }]}>{t('share')}</Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Regenerate */}
              <Animated.View style={{ transform: [{ scale: btnScales.regenerate }] }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.primaryLight }]}
                  onPress={() => animateButton('regenerate', handleRegenerate)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionIcon}>🔄</Text>
                  <Text style={[styles.actionLabel, { color: theme.primary }]}>{t('regenerate')}</Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Favorite */}
              <Animated.View style={{ transform: [{ scale: btnScales.favorite }] }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.primaryLight, opacity: permissions?.canFavorite === false ? 0.4 : 1 }]}
                  onPress={() => animateButton('favorite', handleFavorite)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionIcon}>
                    {permissions?.canFavorite === false ? '🔒' : (result?.isFavorite ? '❤️' : '🤍')}
                  </Text>
                  <Text style={[styles.actionLabel, { color: theme.primary }]}>{t('favorite')}</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: COLORS.BASE.overlay,
  },
  overlayTouch: {
    flex: 1,
  },
  drawer: {
    height: '80%',
    maxHeight: '85%',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    ...SHADOWS.float,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxxl + 20,
  },
  drawerTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  sourceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  sourceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    flexWrap: 'wrap',
  },
  sourceBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  platformTags: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  platformTag: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  platformTagIcon: {
    fontSize: 16,
  },
  textInputWrapper: {
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    backgroundColor: COLORS.BASE.background,
    marginBottom: SPACING.md,
  },
  textInputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  textInputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  textInput: {
    fontSize: FONT_SIZE.md,
    lineHeight: 22,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCountLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  culturalCheckWrapper: {
    marginBottom: SPACING.lg,
  },
  culturalCheckLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.BASE.background,
  },
  culturalCheckLockedIcon: {
    fontSize: FONT_SIZE.lg,
    marginRight: SPACING.sm,
  },
  culturalCheckLockedText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
  culturalCheckLockedCta: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    minWidth: 62,
  },
  actionIcon: {
    fontSize: 20,
    marginBottom: SPACING.xs,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});

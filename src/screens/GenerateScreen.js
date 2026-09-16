// ============================================================
// GenerateScreen — Full version with real AI API + i18n
// Top nav → Trial banner → Platform selector → Topic input
// → Scene info → Output language → Style selector → Brand voice
// → Tone thermometer → Word count → Generate button → Recent
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Modal,
} from 'react-native';
// TODO: Re-enable when building Development Build (requires native module)
// import * as Location from 'expo-location';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SHADOWS, getTheme } from '../themes/theme';
import { PLATFORMS, STYLES, VOICE_TYPES, generateFullResult } from '../utils/mockData';
import { generateCopy, parseMultiPlatformResponse } from '../services/ModelAdapter';
import { saveHistory, getHistory, toggleFavorite, updateHistory, getBrandVoiceSamples } from '../utils/storage';
import { getSubscriptionState, incrementDailyUsage, getRemainingCount, getTrendingTopics, resetDailyUsage, subscribeSubscription } from '../utils/subscription';
import { getPermissions } from '../utils/permissions';
import { TEST_TOOLS_ENABLED } from '../config/buildInfo';
import { useLanguage } from '../context/LanguageContext';
import PlatformSelector from '../components/PlatformSelector';
import StyleSelector from '../components/StyleSelector';
import ToneSlider from '../components/ToneSlider';
import RecentHistory from '../components/RecentHistory';
import ResultDrawer from '../components/ResultDrawer';
import VoiceInput from '../components/VoiceInput';
import ErrorBoundary from '../components/ErrorBoundary';
import { BackgroundDecorator, CornerBrackets, getCardStyle, getButtonTextShadow, getStatusBarStyle } from '../components/StyleDecorator';

export default function GenerateScreen({ themeName = 'pink', navigation }) {
  const theme = getTheme(themeName);
  const { t, outputLanguage } = useLanguage();

  // State
  const [topic, setTopic] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState(['tiktok', 'instagram']);
  const [selectedStyle, setSelectedStyle] = useState('lively');
  const [tone, setTone] = useState(5);
  const [wordCount, setWordCount] = useState(180);
  const [isGenerating, setIsGenerating] = useState(false);
  const [remainingCount, setRemainingCount] = useState(999);
  const [history, setHistory] = useState([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentResult, setCurrentResult] = useState(null);
  const [brandVoiceSamples, setBrandVoiceSamples] = useState([]);
  const [showBrandVoiceModal, setShowBrandVoiceModal] = useState(false);
  const [activeBrandVoice, setActiveBrandVoice] = useState(0); // single-select: index of active sample

  // Local output language — defaults to global setting, only affects this session
  const [localOutputLang, setLocalOutputLang] = useState(outputLanguage);

  // Scene info state
  const [sceneExpanded, setSceneExpanded] = useState(false);
  const [location, setLocation] = useState('');
  const [locationAuto, setLocationAuto] = useState(false);
  // TODO: Re-enable when building Development Build
  // const [locationStatus, setLocationStatus] = useState('pending');
  const [imageDescription, setImageDescription] = useState('');
  const [trendingTopics, setTrendingTopics] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customTopic, setCustomTopic] = useState('');

  // Subscription state
  const [subscriptionState, setSubscriptionState] = useState({ status: 'trial', trialDaysLeft: 30 });
  const [permissions, setPermissions] = useState(null);

  // Sync with global setting when it changes
  useEffect(() => {
    setLocalOutputLang(outputLanguage);
  }, [outputLanguage]);

  // Live subscription updates: when Pro is unlocked (purchase/restore), refresh
  // the trial/free banner and quota immediately instead of waiting for remount.
  //
  // ⚠️ Must refresh the derived PERMISSIONS too, not just the state object. This
  // header's chip renders from subscriptionState while the 🎤 voice button is
  // gated on permissions.canUseVoice — if only the state were updated, the chip
  // would flip to "Pro" while voice stayed locked until the tab was re-focused
  // (2026-09-16: "已订阅 Pro 了，语音仍提示需要 Pro"). ProfileScreen already
  // refreshes both; this brings the home tab in line.
  useEffect(() => {
    const unsub = subscribeSubscription(async (state) => {
      setSubscriptionState(state);
      try {
        const perms = await getPermissions();
        setPermissions(perms);
      } catch (e) {}
    });
    return unsub;
  }, []);

  // Button scale animation
  const buttonScale = useState(new Animated.Value(1))[0];

  // ── Word count slider refs & state ──
  const wcTrackRef = useRef(null);
  const wcTrackPageXRef = useRef(0);
  const wcTrackWidthRef = useRef(0);
  const wcWordCountRef = useRef(wordCount);
  wcWordCountRef.current = wordCount;
  const [wcTrackWidth, setWcTrackWidth] = useState(0);

  const wcSnapValue = (raw) => {
    const snapped = Math.round(raw / 10) * 10;
    return Math.max(50, Math.min(500, snapped));
  };

  const wcMeasureTrack = useCallback(() => {
    if (wcTrackRef.current) {
      wcTrackRef.current.measureInWindow((x, y, width) => {
        wcTrackPageXRef.current = x;
        wcTrackWidthRef.current = width;
        setWcTrackWidth(width);
      });
    }
  }, []);

  const wcHandleTouch = useCallback((e) => {
    let pageX = null;
    if (e.nativeEvent.touches && e.nativeEvent.touches.length > 0) {
      pageX = e.nativeEvent.touches[0].pageX;
    }
    if (pageX === null || !Number.isFinite(pageX)) {
      pageX = e.nativeEvent.pageX;
    }
    if (!Number.isFinite(pageX)) return;
    wcMeasureTrack();
    const w = wcTrackWidthRef.current;
    if (w <= 0) return;
    const localX = pageX - wcTrackPageXRef.current;
    const ratio = Math.max(0, Math.min(1, localX / w));
    const newVal = wcSnapValue(50 + ratio * 450);
    setWordCount(newVal);
  }, [wcMeasureTrack]);

  // Word count slider visual calculations
  const wcRatio = (wordCount - 50) / 450;
  const wcThumbLeft = wcTrackWidth > 0 ? wcRatio * wcTrackWidth - 14 : -14;
  const wcActiveWidth = wcTrackWidth > 0 ? wcRatio * wcTrackWidth : 0;

  // Load data on mount and when tab regains focus
  useFocusEffect(
    useCallback(() => {
      loadData();
      // TODO: Re-enable when building Development Build
      // requestLocation();
    }, [])
  );

  // 每一步独立 try-catch：任何一步失败只让对应 state 保持默认值，
  // 绝不冒泡成 unhandled rejection（iOS 26 + A18 Pro + Release 下会被
  // 框架 reportException 放大成原生崩溃）。
  const loadData = async () => {
    try {
      const h = await getHistory();
      setHistory(h);
    } catch (e) {}
    try {
      const remaining = await getRemainingCount();
      setRemainingCount(remaining);
    } catch (e) {}
    try {
      const bvSamples = await getBrandVoiceSamples();
      setBrandVoiceSamples(bvSamples);
      // Default: first sample is active (single-select)
      if (bvSamples.length > 0) {
        setActiveBrandVoice(0);
      }
    } catch (e) {}
    try {
      const subState = await getSubscriptionState();
      setSubscriptionState(subState);
    } catch (e) {}
    try {
      const perms = await getPermissions();
      setPermissions(perms);
    } catch (e) {}
    try {
      setTrendingTopics(getTrendingTopics());
    } catch (e) {}
  };

  // TODO: Re-enable when building Development Build (requires expo-location native module)
  // ---- Location with degradation logic ----
  // const requestLocation = async () => {
  //   try {
  //     const { status } = await Location.requestForegroundPermissionsAsync();
  //     if (status === 'granted') {
  //       const pos = await Location.getCurrentPositionAsync({}).catch(() => null);
  //       if (!pos) {
  //         setLocationStatus('failed');
  //         return;
  //       }
  //       const geo = await Location.reverseGeocodeAsync(pos.coords);
  //       if (geo.length > 0) {
  //         const city = geo[0].city || geo[0].region || '';
  //         if (city) {
  //           setLocation(city);
  //           setLocationAuto(true);
  //           setLocationStatus('success');
  //           return;
  //         }
  //       }
  //       setLocationStatus('failed');
  //     } else {
  //       setLocationStatus('denied');
  //     }
  //   } catch (e) {
  //     console.warn('[GenerateScreen] Location error:', e);
  //     setLocationStatus('failed');
  //   }
  // };

  // ---- Voice input result handler ----
  const handleVoiceResult = (transcript) => {
    if (transcript && transcript.trim()) {
      setTopic((prev) => {
        const separator = prev.trim() ? ' ' : '';
        return prev + separator + transcript.trim();
      });
    }
  };

  // ---- Feature lock check ----
  const checkProFeature = (featureName) => {
    if (subscriptionState.status === 'free') {
      Alert.alert(t('pro_feature_lock'), t('pro_feature_lock_desc'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('upgrade_pro'), onPress: () => navigation?.navigate('Profile') },
      ]);
      return false;
    }
    return true;
  };

  // ---- Generate copy ----
  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) {
      Alert.alert(t('missing_topic'), t('missing_topic_desc'));
      return;
    }
    if (selectedPlatforms.length === 0) {
      Alert.alert(t('no_platform'), t('no_platform_desc'));
      return;
    }
    if (remainingCount <= 0) {
      const limitButtons = [
        { text: t('not_now'), style: 'cancel' },
        { text: t('upgrade_pro'), style: 'default', onPress: () => navigation?.navigate('Profile') },
      ];
      // QA-only: recover the free quota on the spot instead of hunting through
      // Profile settings. Gated by TEST_TOOLS_ENABLED (see src/config/buildInfo).
      if (TEST_TOOLS_ENABLED) {
        limitButtons.push({
          text: t('dev_reset_today'),
          onPress: async () => {
            try {
              await resetDailyUsage();
              const sub = await getSubscriptionState();
              setSubscriptionState(sub);
              setRemainingCount(await getRemainingCount());
              Alert.alert(t('dev_reset_done'));
            } catch (e) {
              console.warn('[GenerateScreen] dev quota reset failed:', e);
            }
          },
        });
      }
      Alert.alert(t('daily_limit_reached'), t('daily_limit_reached_desc'), limitButtons);
      return;
    }

    setIsGenerating(true);

    Animated.sequence([
      Animated.spring(buttonScale, { toValue: 0.95, useNativeDriver: true }),
      Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true }),
    ]).start();

    // Build scene context
    const sceneContext = {
      location: location || undefined,
      imageDescription: imageDescription || undefined,
      currentDate: selectedDate.toLocaleDateString(),
      trendingTopics: trendingTopics.length > 0 ? trendingTopics : undefined,
    };

    try {
      console.log('[GenerateScreen] outputLanguage =', localOutputLang, '(type:', typeof localOutputLang, ')');
      const apiResult = await generateCopy({
        platforms: selectedPlatforms,
        style: selectedStyle,
        tone,
        wordCount,
        topic: topic.trim(),
        brandVoiceSamples: brandVoiceSamples.length >= 2
          ? [brandVoiceSamples[activeBrandVoice]]
          : undefined,
        outputLanguage: localOutputLang,
        sceneContext,
      });

      let result;

      if (apiResult.success && apiResult.data) {
        const platformResults = parseMultiPlatformResponse(apiResult.data, selectedPlatforms);

        result = {
          id: Date.now().toString(),
          platforms: selectedPlatforms,
          platformNames: selectedPlatforms
            .map((pid) => {
              const p = PLATFORMS.find((pl) => pl.id === pid);
              return p ? p.name : pid;
            })
            .join(', '),
          style: selectedStyle,
          tone,
          wordCount,
          topic: topic.trim(),
          text: apiResult.data,
          results: platformResults,
          createdAt: new Date().toISOString(),
          isFavorite: false,
          source: 'ai',
          provider: apiResult.provider || 'unknown',
          usedBrandVoice: brandVoiceSamples.length >= 2,
        };
      } else {
        result = generateFullResult(selectedPlatforms, selectedStyle, tone, wordCount, topic.trim());
        result.source = 'mock';
      }

      if (!result.text && result.results) {
        result.text = Object.values(result.results).join('\n\n---\n\n');
      }

      setCurrentResult(result);
      setDrawerVisible(true);

      // Update daily usage for free users
      await incrementDailyUsage();
      const newRemaining = await getRemainingCount();
      setRemainingCount(newRemaining);

      await saveHistory(result);
      const updatedHistory = await getHistory();
      setHistory(updatedHistory);
    } catch (error) {
      const result = generateFullResult(selectedPlatforms, selectedStyle, tone, wordCount, topic.trim());
      result.source = 'mock';

      if (!result.text && result.results) {
        result.text = Object.values(result.results).join('\n\n---\n\n');
      }

      setCurrentResult(result);
      setDrawerVisible(true);
      setRemainingCount((prev) => Math.max(0, prev - 1));

      Alert.alert(t('generation_failed'), t('generation_failed_desc'));
    } finally {
      setIsGenerating(false);
    }
  }, [topic, selectedPlatforms, selectedStyle, tone, wordCount, remainingCount, brandVoiceSamples, activeBrandVoice, localOutputLang, location, imageDescription, trendingTopics, t]);

  // ---- Favorite toggle ----
  const handleFavorite = async (result) => {
    if (!result) return;
    // Check feature lock for free users
    if (subscriptionState.status === 'free') {
      Alert.alert(t('pro_feature_lock'), t('pro_feature_lock_desc'));
      return;
    }
    await toggleFavorite(result.id);
    const updated = { ...result, isFavorite: !result.isFavorite };
    setCurrentResult(updated);
    Alert.alert(
      result.isFavorite ? t('unfavorited') : t('favorited'),
      result.isFavorite ? t('removed_from_favorites') : t('added_to_favorites'),
    );
    const updatedHistory = await getHistory();
    setHistory(updatedHistory);
  };

  // ---- Save ----
  const handleSave = async (data) => {
    if (data && data.id) {
      await updateHistory(data.id, { text: data.editedText });
      Alert.alert('✅ ' + t('saved'), t('copy_saved'));
    }
    setDrawerVisible(false);
    const updatedHistory = await getHistory();
    setHistory(updatedHistory);
  };

  // ---- Regenerate ----
  const handleRegenerate = () => {
    setDrawerVisible(false);
    setTimeout(() => handleGenerate(), 300);
  };

  // ---- View history item ----
  const handleHistoryPress = (item) => {
    setCurrentResult(item);
    setDrawerVisible(true);
  };

  // ---- Navigate to brand voice ----
  const handleAddBrandVoice = () => {
    navigation?.navigate('Profile');
  };

  // ---- Select brand voice sample (single-select) ----
  const selectBrandVoice = (index) => {
    setActiveBrandVoice(index);
  };

  // ---- Current date formatted ----
  const currentDateStr = selectedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  // ---- Handle trending topic click → fill into topic input ----
  const handleTrendingTagPress = (tag) => {
    const tagText = tag.replace(/^#/, '');
    setTopic((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${tagText}` : tagText;
    });
  };

  // ---- Handle custom topic submit ----
  const handleCustomTopicSubmit = () => {
    if (customTopic.trim()) {
      const tag = customTopic.trim().startsWith('#') ? customTopic.trim() : `#${customTopic.trim()}`;
      setTopic((prev) => {
        const trimmed = prev.trim();
        return trimmed ? `${trimmed} ${tag}` : tag;
      });
      setCustomTopic('');
    }
  };

  // ---- Date picker scroll state ----
  const [datePickerYear, setDatePickerYear] = useState(selectedDate.getFullYear());
  const [datePickerMonth, setDatePickerMonth] = useState(selectedDate.getMonth() + 1);
  const [datePickerDay, setDatePickerDay] = useState(selectedDate.getDate());

  // Open date picker — sync scroll state to current selectedDate
  const openDatePicker = () => {
    setDatePickerYear(selectedDate.getFullYear());
    setDatePickerMonth(selectedDate.getMonth() + 1);
    setDatePickerDay(selectedDate.getDate());
    setShowDatePicker(true);
  };

  // Confirm date picker
  const confirmDatePicker = () => {
    const maxDay = new Date(datePickerYear, datePickerMonth, 0).getDate();
    const safeDay = Math.min(datePickerDay, maxDay);
    const newDate = new Date(datePickerYear, datePickerMonth - 1, safeDay);
    if (newDate <= new Date()) {
      setSelectedDate(newDate);
    }
    setShowDatePicker(false);
  };

  // Date picker wheel refs for programmatic scroll
  const yearWheelRef = useRef(null);
  const monthWheelRef = useRef(null);
  const dayWheelRef = useRef(null);

  // Year range for picker (5 years ago to current year)
  const currentYear = new Date().getFullYear();
  const pickerYears = Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);
  // Day range for picker (1-31, will clamp on confirm)
  const pickerDays = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={getStatusBarStyle(theme)} />

      {/* Background decoration layer */}
      <BackgroundDecorator decorations={theme.decorations} background={theme.background} />

      {/* ===== Top Navigation Bar (56px) ===== */}
      <View style={[styles.navBar, { backgroundColor: theme.background }]}>
        <Text style={[styles.navBrand, { color: theme.primary }]}>
          ✨ {t('nav_brand')}
        </Text>
        {/* Plan-state chip — the home screen mirrors the same subscriptionState
            the Profile page renders, so the tier shown here (Pro / trial / free)
            can never drift from the 👑 Pro row there. */}
        <View
          style={[
            styles.navPlanTag,
            {
              backgroundColor: subscriptionState.status === 'pro'
                ? theme.primaryLight
                : (theme.borderLight || theme.border),
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.navPlanTagText,
              { color: subscriptionState.status === 'pro' ? theme.primary : theme.subtitle },
            ]}
          >
            {subscriptionState.status === 'pro'
              ? t('subscription_active')
              : subscriptionState.status === 'trial'
                ? t('trial_badge', { days: subscriptionState.trialDaysLeft })
                : t('free_plan_limited')}
          </Text>
        </View>
      </View>

      {/* ===== Scrollable Content ===== */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ===== Trial Countdown Banner ===== */}
        {subscriptionState.status === 'trial' && subscriptionState.trialDaysLeft <= 7 && (
          <TouchableOpacity
            style={[styles.trialBanner, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
            onPress={() => navigation?.navigate('Profile')}
            activeOpacity={0.7}
          >
            <Text style={[styles.trialBannerText, { color: theme.primary }]}>
              {subscriptionState.trialDaysLeft >= 4
                ? t('trial_banner_days', { days: subscriptionState.trialDaysLeft })
                : subscriptionState.trialDaysLeft >= 1
                  ? t('trial_banner_urgent', { days: subscriptionState.trialDaysLeft })
                  : t('trial_banner_last_day')
              }
            </Text>
          </TouchableOpacity>
        )}

        {/* Platform Selector */}
        <PlatformSelector
          platforms={PLATFORMS}
          selectedPlatforms={selectedPlatforms}
          onToggle={setSelectedPlatforms}
          themeName={themeName}
        />

        {/* Topic Input */}
        <View style={styles.inputSection}>
          <Text style={[styles.sectionTitle, { color: theme.title }]}>
            {t('enter_topic')}
          </Text>
          <View style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.borderRadius.md }, getCardStyle(theme)]}>
            <CornerBrackets decorations={theme.decorations} borderRadius={theme.borderRadius.md} />
            <TextInput
              style={[styles.textInput, { color: theme.title, paddingRight: topic.length > 0 ? 36 : 0 }]}
              value={topic}
              onChangeText={setTopic}
              multiline
              numberOfLines={3}
              maxLength={100}
              textAlignVertical="top"
            />
            {topic.length === 0 && (
              <Text style={[styles.topicHint, { color: theme.placeholder }]} pointerEvents="none">
                {t('topic_placeholder')}
              </Text>
            )}
            {topic.length > 0 && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setTopic('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
            <View style={styles.inputFooter}>
              <Text style={[styles.charCount, { color: theme.placeholder }]}>
                {topic.length}/100
              </Text>
              <View style={styles.inputActions}>
                {permissions?.canUseVoice ? (
                  <ErrorBoundary
                    fallback={
                      <TouchableOpacity
                        style={[styles.inputActionBtn, { opacity: 0.4 }]}
                        onPress={() => Alert.alert(t('voice_error'), t('voice_error_desc'))}
                      >
                        <Text style={styles.inputActionIcon}>🎤</Text>
                      </TouchableOpacity>
                    }
                  >
                    <VoiceInput
                      themeName={themeName}
                      onResult={handleVoiceResult}
                      language={localOutputLang}
                    />
                  </ErrorBoundary>
                ) : (
                  <TouchableOpacity
                    style={[styles.inputActionBtn, { opacity: 0.4 }]}
                    onPress={() => Alert.alert(t('locked'), t('feature_locked_upgrade'))}
                  >
                    <Text style={styles.inputActionIcon}>🎤</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.inputActionBtn}>
                  <Text style={styles.inputActionIcon}>✨</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* ===== Scene Info — Collapsible ===== */}
        <View style={[styles.sceneSection, { marginBottom: SPACING.xxl }]}>
          <TouchableOpacity
            style={[styles.sceneHeader, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.borderRadius.md, borderWidth: 1, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg }]}
            onPress={() => setSceneExpanded(!sceneExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.sceneHeaderText}>
              <Text style={[styles.sceneTitle, { color: theme.primary }]}>
                📍 {t('scene_info')}
              </Text>
              <Text style={[styles.sceneHint, { color: theme.placeholder }]}>
                {t('scene_info_hint')}
              </Text>
            </View>
            <Text style={[styles.sceneExpandIcon, { color: theme.placeholder }]}>
              {sceneExpanded ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {sceneExpanded && (
            <View style={[styles.sceneContent, { backgroundColor: theme.primaryLight, borderRadius: theme.borderRadius.md, borderColor: theme.primary, borderWidth: 1.5, padding: SPACING.lg }, getCardStyle(theme)]}>
              {/* Location — manual input for now */}
              <View style={styles.sceneRow}>
                <Text style={styles.sceneEmoji}>📍</Text>
                <TextInput
                  style={[styles.sceneInputFull, { color: theme.title, borderColor: theme.border }]}
                  value={location}
                  onChangeText={setLocation}
                  placeholder={t('location_input_placeholder')}
                  placeholderTextColor={theme.placeholder}
                  multiline
                />
              </View>

              {/* Image description */}
              <View style={styles.sceneRow}>
                <Text style={styles.sceneEmoji}>📷</Text>
                <TextInput
                  style={[styles.sceneInput, { color: theme.title, borderColor: theme.border }]}
                  value={imageDescription}
                  onChangeText={setImageDescription}
                  placeholder={t('image_desc_placeholder')}
                  placeholderTextColor={theme.placeholder}
                  multiline
                />
              </View>

              {/* Current date — clickable to open date picker */}
              <View style={styles.sceneRow}>
                <Text style={styles.sceneEmoji}>📅</Text>
                <TouchableOpacity
                  style={styles.sceneDateBtn}
                  onPress={openDatePicker}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sceneDateText, { color: theme.primary }]}>
                    {currentDateStr}
                  </Text>
                  <Text style={[styles.sceneDateEdit, { color: theme.placeholder }]}> ✏️</Text>
                </TouchableOpacity>
              </View>

              {/* Date Picker Modal — custom scroll-wheel picker */}
              <Modal
                visible={showDatePicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowDatePicker(false)}
              >
                <View style={styles.datePickerOverlay}>
                  <TouchableOpacity
                    style={styles.datePickerOverlayTouch}
                    onPress={() => setShowDatePicker(false)}
                  />
                  <View style={[styles.datePickerContainer, { backgroundColor: theme.card }]}>
                    {/* Header */}
                    <View style={styles.datePickerHeader}>
                      <Text style={[styles.datePickerTitle, { color: theme.title }]}>
                        {t('select_date')}
                      </Text>
                      <TouchableOpacity
                        style={styles.datePickerClose}
                        onPress={() => setShowDatePicker(false)}
                      >
                        <Text style={[styles.datePickerCloseText, { color: theme.subtitle }]}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Scroll wheels — Year / Month / Day */}
                    <View style={styles.datePickerWheelsRow}>
                      {/* Year wheel */}
                      <View style={styles.datePickerWheelCol}>
                        <ScrollView
                          ref={(r) => { yearWheelRef.current = r; }}
                          style={styles.datePickerWheel}
                          showsVerticalScrollIndicator={false}
                          snapToInterval={40}
                          decelerationRate="fast"
                          onMomentumScrollEnd={(e) => {
                            const idx = Math.round(e.nativeEvent.contentOffset.y / 40);
                            const year = pickerYears[Math.min(idx, pickerYears.length - 1)];
                            setDatePickerYear(year);
                          }}
                          onScrollEndDrag={(e) => {
                            const idx = Math.round(e.nativeEvent.contentOffset.y / 40);
                            const year = pickerYears[Math.min(idx, pickerYears.length - 1)];
                            setDatePickerYear(year);
                          }}
                          contentContainerStyle={styles.datePickerWheelContent}
                        >
                          {pickerYears.map((year) => (
                            <TouchableOpacity
                              key={year}
                              style={[styles.datePickerWheelItem, datePickerYear === year && styles.datePickerWheelItemActive]}
                              onPress={() => setDatePickerYear(year)}
                              activeOpacity={0.6}
                            >
                              <Text style={[styles.datePickerWheelItemText, { color: datePickerYear === year ? theme.primary : theme.subtitle }]}>
                                {year}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <Text style={[styles.datePickerWheelLabel, { color: theme.subtitle }]}>
                          Year
                        </Text>
                      </View>

                      {/* Month wheel */}
                      <View style={styles.datePickerWheelCol}>
                        <ScrollView
                          ref={(r) => { monthWheelRef.current = r; }}
                          style={styles.datePickerWheel}
                          showsVerticalScrollIndicator={false}
                          snapToInterval={40}
                          decelerationRate="fast"
                          onMomentumScrollEnd={(e) => {
                            const idx = Math.round(e.nativeEvent.contentOffset.y / 40);
                            const month = Math.min(Math.max(idx + 1, 1), 12);
                            setDatePickerMonth(month);
                          }}
                          onScrollEndDrag={(e) => {
                            const idx = Math.round(e.nativeEvent.contentOffset.y / 40);
                            const month = Math.min(Math.max(idx + 1, 1), 12);
                            setDatePickerMonth(month);
                          }}
                          contentContainerStyle={styles.datePickerWheelContent}
                        >
                          {[1,2,3,4,5,6,7,8,9,10,11,12].map((month) => (
                            <TouchableOpacity
                              key={month}
                              style={[styles.datePickerWheelItem, datePickerMonth === month && styles.datePickerWheelItemActive]}
                              onPress={() => setDatePickerMonth(month)}
                              activeOpacity={0.6}
                            >
                              <Text style={[styles.datePickerWheelItemText, { color: datePickerMonth === month ? theme.primary : theme.subtitle }]}>
                                {month}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <Text style={[styles.datePickerWheelLabel, { color: theme.subtitle }]}>
                          Month
                        </Text>
                      </View>

                      {/* Day wheel */}
                      <View style={styles.datePickerWheelCol}>
                        <ScrollView
                          ref={(r) => { dayWheelRef.current = r; }}
                          style={styles.datePickerWheel}
                          showsVerticalScrollIndicator={false}
                          snapToInterval={40}
                          decelerationRate="fast"
                          onMomentumScrollEnd={(e) => {
                            const idx = Math.round(e.nativeEvent.contentOffset.y / 40);
                            const maxDay = new Date(datePickerYear, datePickerMonth, 0).getDate();
                            const day = Math.min(Math.max(idx + 1, 1), maxDay);
                            setDatePickerDay(day);
                          }}
                          onScrollEndDrag={(e) => {
                            const idx = Math.round(e.nativeEvent.contentOffset.y / 40);
                            const maxDay = new Date(datePickerYear, datePickerMonth, 0).getDate();
                            const day = Math.min(Math.max(idx + 1, 1), maxDay);
                            setDatePickerDay(day);
                          }}
                          contentContainerStyle={styles.datePickerWheelContent}
                        >
                          {pickerDays.map((day) => (
                            <TouchableOpacity
                              key={day}
                              style={[styles.datePickerWheelItem, datePickerDay === day && styles.datePickerWheelItemActive]}
                              onPress={() => setDatePickerDay(day)}
                              activeOpacity={0.6}
                            >
                              <Text style={[styles.datePickerWheelItemText, { color: datePickerDay === day ? theme.primary : theme.subtitle }]}>
                                {day}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <Text style={[styles.datePickerWheelLabel, { color: theme.subtitle }]}>
                          Day
                        </Text>
                      </View>
                    </View>

                    {/* Selection highlight bar */}
                    <View style={styles.datePickerHighlight} pointerEvents="none">
                      <View style={[styles.datePickerHighlightBar, { borderColor: theme.primary }]} />
                    </View>

                    {/* Footer */}
                    <View style={styles.datePickerFooter}>
                      <TouchableOpacity
                        style={[styles.datePickerBtn, styles.datePickerBtnCancel]}
                        onPress={() => setShowDatePicker(false)}
                      >
                        <Text style={[styles.datePickerBtnText, { color: theme.subtitle }]}>
                          {t('cancel')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.datePickerBtn, styles.datePickerBtnConfirm, { backgroundColor: theme.primary }]}
                        onPress={confirmDatePicker}
                      >
                        <Text style={[styles.datePickerBtnText, { color: '#FFFFFF' }]}>
                          {t('confirm')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>

              {/* Trending topics — clickable tags + custom input */}
              <View style={styles.sceneRow}>
                <Text style={styles.sceneEmoji}>🔥</Text>
                <View style={styles.trendingRow}>
                  {trendingTopics.map((tag, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.trendingTag, { backgroundColor: theme.primaryLight }]}
                      onPress={() => handleTrendingTagPress(tag)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.trendingTagText, { color: theme.primary }]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {/* Custom topic input */}
                  <TextInput
                    style={[styles.customTopicInput, { color: theme.title, borderColor: theme.border }]}
                    value={customTopic}
                    onChangeText={setCustomTopic}
                    placeholder="#"
                    placeholderTextColor={theme.placeholder}
                    onSubmitEditing={handleCustomTopicSubmit}
                    returnKeyType="done"
                    maxLength={20}
                  />
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Output Language Selector */}
        <View style={styles.outputLangSection}>
          <View style={[styles.sectionDivider, { backgroundColor: theme.border }]} />
          <Text style={[styles.sectionSubtitle, { color: theme.subtitle }]}>
            🌐 {t('output_language')}
          </Text>
          <View style={styles.outputLangRow}>
            <TouchableOpacity
              style={[
                styles.outputLangBtn,
                styles.outputLangBtnFirst,
                localOutputLang === 'en'
                  ? { backgroundColor: theme.primary, borderColor: theme.primary }
                  : { borderColor: theme.border, backgroundColor: theme.card },
              ]}
              onPress={() => setLocalOutputLang('en')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.outputLangBtnText,
                  localOutputLang === 'en' ? { color: '#FFFFFF' } : { color: theme.subtitle },
                ]}
              >
                {t('english')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.outputLangBtn,
                localOutputLang === 'zh'
                  ? { backgroundColor: theme.primary, borderColor: theme.primary }
                  : { borderColor: theme.border, backgroundColor: theme.card },
              ]}
              onPress={() => setLocalOutputLang('zh')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.outputLangBtnText,
                  localOutputLang === 'zh' ? { color: '#FFFFFF' } : { color: theme.subtitle },
                ]}
              >
                {t('chinese')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Style Selector */}
        <StyleSelector
          styles={STYLES}
          selectedStyle={selectedStyle}
          onSelect={setSelectedStyle}
          themeName={themeName}
        />

        {/* ===== Brand Voice — single-row entry like StyleSelector ===== */}
        <TouchableOpacity
          style={[styles.brandVoiceRow, { borderColor: theme.border, backgroundColor: theme.card }]}
          activeOpacity={0.7}
          onPress={() => {
            if (brandVoiceSamples.length >= 2) {
              setShowBrandVoiceModal(true);
            } else {
              handleAddBrandVoice();
            }
          }}
        >
          <Text style={[styles.sectionTitle, { color: theme.title, marginBottom: 0, flex: 1, maxWidth: 200 }]}>
            🎙️ {t('brand_voice_learning')}
          </Text>
          <View style={styles.brandVoiceRowRight}>
            <Text
              style={[
                styles.brandVoiceRowValue,
                {
                  color: brandVoiceSamples.length >= 2 ? theme.primary : theme.placeholder,
                },
              ]}
              numberOfLines={1}
            >
              {brandVoiceSamples.length >= 2
                ? VOICE_TYPES[activeBrandVoice]
                  ? `${VOICE_TYPES[activeBrandVoice].emoji} ${t(VOICE_TYPES[activeBrandVoice].i18nKey)}`
                  : brandVoiceSamples[activeBrandVoice]?.substring(0, 20) + '...'
                : t('no_brand_voice_selected')
              }
            </Text>
            <Text style={[styles.brandVoiceRowArrow, { color: theme.placeholder }]}>
              {'>'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Brand Voice Detail Modal — single-select radio style */}
        <Modal
          visible={showBrandVoiceModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowBrandVoiceModal(false)}
        >
          <View style={styles.bvModalOverlay}>
            <TouchableOpacity
              style={styles.bvModalOverlayTouch}
              onPress={() => setShowBrandVoiceModal(false)}
            />
            <View style={[styles.bvModalContainer, { backgroundColor: theme.card }]}>
              {/* Header */}
              <View style={styles.bvModalHeader}>
                <Text style={[styles.bvModalTitle, { color: theme.title }]}>
                  🎙️ {t('brand_voice_learning')}
                </Text>
                <TouchableOpacity onPress={() => setShowBrandVoiceModal(false)}>
                  <Text style={[styles.bvModalClose, { color: theme.subtitle }]}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Instruction */}
              <Text style={[styles.bvModalHint, { color: theme.subtitle }]}>
                {t('select_brand_voice_hint')}
              </Text>

              {/* Sample list — radio style single-select */}
              <ScrollView style={styles.bvModalScroll} showsVerticalScrollIndicator={false}>
                {brandVoiceSamples.map((sample, i) => {
                  const isActive = activeBrandVoice === i;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.bvSampleCard,
                        {
                          borderColor: isActive ? theme.primary : theme.border,
                          backgroundColor: isActive ? theme.primaryLight : theme.card,
                        },
                      ]}
                      onPress={() => selectBrandVoice(i)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.bvSampleCardHeader}>
                        <Text style={[styles.bvSampleIndex, { color: isActive ? theme.primary : theme.subtitle }]}>
                          {`${t('sample')} ${i + 1}`}
                        </Text>
                        {/* Radio circle */}
                        <View style={[styles.bvSampleRadio, { borderColor: isActive ? theme.primary : theme.border, backgroundColor: isActive ? theme.primary : 'transparent' }]}>
                          {isActive && <View style={styles.bvSampleRadioDot} />}
                        </View>
                      </View>
                      <Text style={[styles.bvSampleText, { color: theme.body }]} numberOfLines={4}>
                        {sample}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Footer — confirm only (no select all) */}
              <View style={styles.bvModalFooter}>
                <TouchableOpacity
                  style={[styles.bvModalBtn, styles.bvModalBtnPrimary, { backgroundColor: theme.primary, flex: 1 }]}
                  onPress={() => setShowBrandVoiceModal(false)}
                >
                  <Text style={[styles.bvModalBtnText, { color: '#FFFFFF' }]}>{t('confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Tone Thermometer */}
        <ToneSlider
          value={tone}
          onChange={setTone}
          themeName={themeName}
        />

        {/* Word Count — Inline Slider */}
        <View style={styles.wordCountSection}>
          <View style={styles.wordCountHeader}>
            <Text style={[styles.sectionTitle, { color: theme.title, marginBottom: 0 }]}>
              {t('word_count')}
            </Text>
            <View style={[styles.wordCountBadge, { backgroundColor: theme.primaryLight }]}>
              <Text style={[styles.wordCountText, { color: theme.primary }]}>
                {wordCount} {t('chars')}
              </Text>
            </View>
          </View>

          <View
            ref={wcTrackRef}
            style={styles.wcTrackContainer}
            onLayout={wcMeasureTrack}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={wcHandleTouch}
            onResponderMove={wcHandleTouch}
            onTouchStart={wcHandleTouch}
            onTouchMove={wcHandleTouch}
          >
            <View style={[styles.wcTrack, { backgroundColor: theme.borderLight }]} pointerEvents="none" />
            <View style={[styles.wcActiveTrack, { backgroundColor: theme.primary, width: wcActiveWidth }]} pointerEvents="none" />
            <View style={[styles.wcThumb, { backgroundColor: theme.primary, left: wcThumbLeft }]} pointerEvents="none" />
          </View>

          <View style={styles.wordCountLabels}>
            <Text style={[styles.wordCountLabel, { color: theme.placeholder }]}>50</Text>
            <Text style={[styles.wordCountLabel, { color: theme.placeholder }]}>500</Text>
          </View>
        </View>

        {/* Generate Button */}
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={[
              styles.generateBtn,
              { backgroundColor: isGenerating ? theme.placeholder : theme.primary },
            ]}
            onPress={handleGenerate}
            disabled={isGenerating}
            activeOpacity={0.8}
          >
            {isGenerating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={[styles.generateBtnText, getButtonTextShadow(theme)]}>{t('generate_copy')}</Text>
            )}
          </TouchableOpacity>
          <Text style={[styles.remainingText, { color: theme.subtitle }]}>
            {remainingCount >= 999
              ? t('remaining_unlimited')
              : t('remaining_today', { count: remainingCount })}
          </Text>
        </Animated.View>

        {/* Recent History */}
        <RecentHistory
          history={history}
          onPress={handleHistoryPress}
          themeName={themeName}
        />
      </ScrollView>

      {/* Result Drawer */}
      <ResultDrawer
        visible={drawerVisible}
        result={currentResult}
        onClose={() => setDrawerVisible(false)}
        onRegenerate={handleRegenerate}
        onFavorite={handleFavorite}
        onSave={handleSave}
        themeName={themeName}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
  },
  navBrand: {
    fontSize: 22,
    fontWeight: '700',
    flexShrink: 0,
  },
  navPlanTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    flexShrink: 1,
    marginLeft: SPACING.md,
  },
  navPlanTagText: {
    fontSize: 12,
    fontWeight: '700',
  },

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxxl + 80,
  },

  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },

  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  sectionDivider: {
    height: 1,
    marginVertical: SPACING.md,
    opacity: 0.5,
  },

  // ── Trial banner ──
  trialBanner: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  trialBannerText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    textAlign: 'center',
  },

  inputSection: {
    marginBottom: SPACING.lg,
  },
  inputWrapper: {
    borderWidth: 1.5,
    padding: SPACING.md,
    position: 'relative',
    ...SHADOWS.card,
  },
  clearBtn: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.BASE.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.BASE.subtitle,
  },
  textInput: {
    fontSize: FONT_SIZE.md,
    minHeight: 80,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  topicHint: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
    fontSize: FONT_SIZE.md,
    lineHeight: 22,
    opacity: 0.65,
  },
  inputFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  charCount: {
    fontSize: FONT_SIZE.xs,
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputActionBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  inputActionIcon: {
    fontSize: FONT_SIZE.lg,
  },

  // ── Scene info ──
  sceneSection: {
    marginBottom: SPACING.xxl,
  },
  sceneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sceneHeaderText: {
    flex: 1,
    flexDirection: 'column',
  },
  sceneTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  sceneHint: {
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
  },
  sceneExpandIcon: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    marginLeft: SPACING.sm,
  },
  sceneContent: {
    marginTop: SPACING.sm,
    padding: SPACING.lg,
    borderWidth: 1.5,
  },
  sceneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sceneEmoji: {
    fontSize: FONT_SIZE.md,
    marginRight: SPACING.sm,
    width: 24,
    textAlign: 'center',
  },
  sceneFieldContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sceneInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sceneInputFull: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sceneAutoTag: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: SPACING.xs,
  },
  sceneDateText: {
    fontSize: FONT_SIZE.sm,
    flex: 1,
  },
  sceneDateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sceneDateEdit: {
    fontSize: FONT_SIZE.xs,
  },
  customTopicInput: {
    fontSize: FONT_SIZE.xs,
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    width: 70,
    height: 24,
  },
  // Date picker modal styles
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  datePickerOverlayTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  datePickerContainer: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderRadius: 20,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#EAE8F0',
  },
  datePickerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
  datePickerClose: {
    padding: SPACING.xs,
  },
  datePickerCloseText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '300',
  },
  // Scroll wheel row
  datePickerWheelsRow: {
    flexDirection: 'row',
    height: '50%',
    maxHeight: 300,
    paddingVertical: SPACING.sm,
  },
  datePickerWheelCol: {
    flex: 1,
    alignItems: 'center',
  },
  datePickerWheel: {
    width: '100%',
    height: '100%',
  },
  datePickerWheelContent: {
    paddingVertical: 10,
  },
  datePickerWheelItem: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerWheelItemActive: {
    // active item gets highlighted via text color
  },
  datePickerWheelItemText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
  },
  datePickerWheelLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  // Selection highlight bar
  datePickerHighlight: {
    position: 'absolute',
    top: 70,
    left: SPACING.md,
    right: SPACING.md,
    bottom: 80,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  datePickerHighlightBar: {
    width: '100%',
    height: 42,
    borderWidth: 1.5,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  datePickerFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  datePickerBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  datePickerBtnCancel: {
    backgroundColor: '#F3F4F6',
  },
  datePickerBtnConfirm: {
    // backgroundColor set dynamically
  },
  datePickerBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  trendingRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  trendingTag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    marginRight: SPACING.xs,
    marginBottom: 4,
  },
  trendingTagText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },

  // ── Output language selector ──
  outputLangSection: {
    marginBottom: SPACING.lg,
  },
  outputLangRow: {
    flexDirection: 'row',
  },
  outputLangBtn: {
    flex: 1,
    height: 40,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outputLangBtnFirst: {
    marginRight: SPACING.sm,
  },
  outputLangBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },

  // ── Brand voice — single-row entry ──
  brandVoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1.5,
    borderRadius: RADIUS.lg,
    ...SHADOWS.card,
    // borderColor and backgroundColor set via inline styles (theme-dependent)
  },
  brandVoiceRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    marginLeft: SPACING.sm,
  },
  brandVoiceRowValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    maxWidth: 180,
    marginRight: SPACING.sm,
  },
  brandVoiceRowArrow: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    marginLeft: SPACING.xs,
  },

  // ── Brand voice modal ──
  bvModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bvModalOverlayTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bvModalContainer: {
    maxHeight: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: SPACING.md,
  },
  bvModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#EAE8F0',
  },
  bvModalTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
  bvModalClose: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '300',
    padding: SPACING.xs,
  },
  bvModalHint: {
    fontSize: FONT_SIZE.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
  },
  bvModalScroll: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  bvSampleCard: {
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  bvSampleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  bvSampleIndex: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  bvSampleRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bvSampleRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  bvSampleText: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
  },
  bvModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#EAE8F0',
  },
  bvModalBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  bvModalBtnSecondary: {
    borderWidth: 1,
  },
  bvModalBtnPrimary: {
    // backgroundColor set dynamically
  },
  bvModalBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },

  wordCountSection: {
    marginBottom: SPACING.xxl,
  },
  wordCountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  wordCountBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  wordCountText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  wordCountLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  wordCountLabel: {
    fontSize: FONT_SIZE.xs,
  },

  // ── Word count inline slider styles ──
  wcTrackContainer: {
    width: '100%',
    height: 44,
    position: 'relative',
  },
  wcTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 19,
    height: 6,
    borderRadius: 3,
  },
  wcActiveTrack: {
    position: 'absolute',
    left: 0,
    top: 19,
    height: 6,
    borderRadius: 3,
  },
  wcThumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    top: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },

  generateBtn: {
    width: '100%',
    height: 52,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.float,
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
  },
  remainingText: {
    textAlign: 'center',
    fontSize: FONT_SIZE.xs,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xxl,
  },
});

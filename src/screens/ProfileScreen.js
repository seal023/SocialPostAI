// ============================================================
// ProfileScreen — Full version
// User info → Theme switcher → Usage stats → Favorites → Settings
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Alert,
  SafeAreaView,
  StatusBar,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SHADOWS, STYLE_THEME_OPTIONS, setStyleTheme, getTheme } from '../themes/theme';
import { getPreference, savePreference, getUsageStats, getFavorites, getBrandVoiceSamples, toggleFavorite, getHistory } from '../utils/storage';
import {
  getSubscriptionState,
  setProStatus,
  loadUserProfile,
  updateUserProfile,
  initIAPIntegration,
  loadProductInfo,
  purchasePro,
  restoreProPurchase,
  resetDailyUsage,
  resetTrialForTesting,
  PRODUCT_IDS,
} from '../utils/subscription';
import { baseProductId } from '../services/IAPService';
import { useLanguage } from '../context/LanguageContext';
import { signInWithApple, signOutApple, getAppleAuthState, isAppleAuthAvailable } from '../services/AppleAuthService';
import { getPermissions } from '../utils/permissions';
import BrandVoiceScreen from './BrandVoiceScreen';
import ResultDrawer from '../components/ResultDrawer';
import DiagnosticsPanel from '../components/DiagnosticsPanel';
import { TEST_TOOLS_ENABLED } from '../config/buildInfo';
import { BackgroundDecorator, CornerBrackets, getCardStyle, getStatusBarStyle } from '../components/StyleDecorator';

// Privacy & Terms URLs
const PRIVACY_URL = 'https://seal023.github.io/privacy-policy/';
const TERMS_URL = 'https://seal023.github.io/terms-of-service/';

// Pricing tiers — will be loaded dynamically from StoreKit via IAP
// Fallback values used until products are fetched
// ⚠️  Product IDs must EXACTLY match App Store Connect configuration.
//     Current (per Apple review): com.seal023.socialpostai.monthly / com.seal023.socialpostai.annual
//     Trial duration on App Store Connect: 7 days.
let PROFILE_TIERS = [
  {
    id: 'monthly',
    productId: PRODUCT_IDS.MONTHLY,
    label: 'Monthly',
    price: '$5.99',
    period: '/mo',
    priceValue: 5.99,
    introPrice: 'Free',
    introPeriod: '7 days',
    introNote: 'Start 7-day free trial, then $5.99/mo',
    isLoading: true,
  },
  {
    id: 'annual',
    productId: PRODUCT_IDS.ANNUAL,
    label: 'Annual',
    price: '$49.99',
    period: '/yr',
    priceValue: 49.99,
    badge: 'Best Value',
    introPrice: 'Free',
    introPeriod: '7 days',
    introNote: 'Start 7-day free trial, then $49.99/yr',
    subNote: '$4.17/mo avg',
    isLoading: true,
  },
];

// Feature comparison for Free vs Pro — MUST match Apple Review specification
// https://appstoreconnect.apple.com  Agreements, Tax, and Banking
const FEATURE_COMPARISON = [
  { key: 'feat_ai_copy',         free: '3/day', pro: 'Unlimited' },
  { key: 'feat_voice_input',     free: '❌',    pro: '✅' },
  { key: 'feat_brand_voice',     free: '❌',    pro: '✅' },
  { key: 'feat_cultural_check',  free: '❌',    pro: '✅' },
  { key: 'feat_history_retention', free: '7 days', pro: 'Unlimited', hasInfo: true },
  { key: 'feat_avatar_username', free: '❌',    pro: '✅' },
];

// Map style option names to i18n keys
const STYLE_KEY_MAP = {
  sciFi: 'style_scifi',
  dreamy: 'style_dreamy',
  cartoon: 'style_cartoon',
  minimal: 'style_minimal',
};

export default function ProfileScreen({ themeName = 'pink', onThemeChange }) {
  const theme = getTheme(themeName);
  const { t, language, setLanguage } = useLanguage();
  const [stats, setStats] = useState({ today: 0, month: 0, total: 0 });
  const [favorites, setFavorites] = useState([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [brandVoiceCount, setBrandVoiceCount] = useState(0);
  const [showBrandVoice, setShowBrandVoice] = useState(false);
  const [showInterfaceLangPicker, setShowInterfaceLangPicker] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [selectedTier, setSelectedTier] = useState('annual');
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentResult, setCurrentResult] = useState(null);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [subscriptionState, setSubscriptionState] = useState({ status: 'loading', trialDaysLeft: 0 });
  const [userProfile, setUserProfile] = useState({ avatarUri: '', username: '' });
  const [iapProducts, setIapProducts] = useState(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [appleUser, setAppleUser] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Check Apple ID login status and permissions on mount
  useEffect(() => {
    (async () => {
      try {
        const authState = await getAppleAuthState();
        if (authState.isLoggedIn) {
          setAppleUser(authState.user);
        }
      } catch (e) {}
      try {
        const perms = await getPermissions();
        setPermissions(perms);
      } catch (e) {}
    })();
  }, []);

  // Refresh data every time the Profile tab becomes focused
  // This ensures favorites, stats, etc. stay in sync across tabs
  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  // 每一步独立 try-catch：任何一步失败只让对应 state 保持默认值，
  // 绝不冒泡成 unhandled rejection（iOS 26 + A18 Pro + Release 下会被
  // 框架 reportException 放大成原生崩溃）。
  const loadData = async () => {
    try {
      const usageStats = await getUsageStats();
      setStats(usageStats);
    } catch (e) {}
    try {
      const favs = await getFavorites();
      setFavorites(favs);
    } catch (e) {}
    try {
      const bvSamples = await getBrandVoiceSamples();
      setBrandVoiceCount(bvSamples.length);
    } catch (e) {}
    try {
      const subState = await getSubscriptionState();
      setSubscriptionState(subState);
    } catch (e) {}
    try {
      const profile = await loadUserProfile();
      setUserProfile(profile);
    } catch (e) {}

    // Lazy-initialize IAP (StoreKit) only when the user reaches the Profile tab.
    // App launch no longer touches StoreKit — native init/getAvailablePurchases
    // calls at startup crash on iOS 26 (SIGABRT). initIAPIntegration is idempotent.
    if (!iapProducts) {
      try {
        await initIAPIntegration();
      } catch (e) {}
      try {
        const products = await loadProductInfo();
        if (products && products.length > 0) {
          // Merge real prices into PROFILE_TIERS
          PROFILE_TIERS = PROFILE_TIERS.map((tier) => {
            // Match on the NORMALIZED id: StoreKit may return the `.v2` SKU
            // while the tier is keyed by the canonical id (and vice versa).
            // A plain `===` here silently failed, so the card kept showing the
            // hardcoded fallback price — which would not match the amount Apple
            // actually charges (App Store display rules require it to match).
            const product =
              products.find((p) => p.productId === tier.productId) ||
              products.find((p) => baseProductId(p.productId) === tier.productId);
            if (product) {
              return {
                ...tier,
                price: product.localizedPrice || product.price,
                priceValue: product.priceValue,
                description: product.description,
                isLoading: false,
                isFallback: product.isFallback || false,
              };
            }
            return { ...tier, isLoading: false };
          });
          setIapProducts(products);
        }
      } catch (e) {}
    }
  };

  // If brand voice screen is active, render it instead
  if (showBrandVoice) {
    return (
      <BrandVoiceScreen
        themeName={themeName}
        onBack={() => {
          setShowBrandVoice(false);
          loadData(); // refresh brand voice count
        }}
      />
    );
  }

  // ---- Theme switch ----
  const handleThemeChange = async (newTheme) => {
    setStyleTheme(newTheme);
    await savePreference({ theme: newTheme });
    if (onThemeChange) {
      onThemeChange(newTheme);
    }
    setShowStylePicker(false);
  };

  // ---- Interface language switch ----
  const handleInterfaceLangSwitch = async (newLang) => {
    await setLanguage(newLang);
    setShowInterfaceLangPicker(false);
  };

  // ---- Avatar picker ----
  const handleAvatarPick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        await updateUserProfile({ avatarUri: uri });
        setUserProfile((prev) => ({ ...prev, avatarUri: uri }));
      }
    } catch (e) {
      console.error('Image picker error:', e);
    }
  };

  // ---- Username edit ----
  const handleUsernameSave = async () => {
    if (usernameInput.trim()) {
      await updateUserProfile({ username: usernameInput.trim() });
      setUserProfile((prev) => ({ ...prev, username: usernameInput.trim() }));
    }
    setEditingUsername(false);
  };

  // ---- Favorites press ----
  const handleFavoritesPress = () => {
    setShowFavorites(!showFavorites);
  };

  // ---- Toggle favorite ----
  const handleFavorite = async (result) => {
    if (!result) return;
    await toggleFavorite(result.id);
    loadData();
    const updated = { ...result, isFavorite: !result.isFavorite };
    setCurrentResult(updated);
  };

  // ---- Handle item press ----
  const handleItemPress = (item) => {
    setCurrentResult(item);
    setDrawerVisible(true);
  };

  // ---- Subscription purchase via IAP ----
  const handlePurchase = async (tier) => {
    if (isPurchasing) return;

    console.log('[ProfileScreen] handlePurchase clicked, tier:', tier?.id, 'productId:', tier?.productId);
    setIsPurchasing(true);
    try {
      console.log('[ProfileScreen] Calling purchasePro...');
      const result = await purchasePro(tier.productId);
      console.log('[ProfileScreen] purchasePro result:', result);

      if (!result.success) {
        if (result.error === 'IAP_NOT_AVAILABLE') {
          Alert.alert(
            t('iap_not_available_title'),
            t('iap_not_available_desc'),
          );
        } else if (result.error !== 'E_USER_CANCELED') {
          Alert.alert(
            t('purchase_failed_title'),
            result.message || t('purchase_failed_desc'),
          );
        }
        return;
      }

      // Purchase request sent successfully — wait for callback
      // The purchase result is handled asynchronously via IAPService callbacks
      // Refresh subscription state after a short delay
      setTimeout(async () => {
        const newSubState = await getSubscriptionState();
        setSubscriptionState(newSubState);

        if (newSubState.status === 'pro') {
          Alert.alert(
            '✅ ' + t('purchase_success_title'),
            t('purchase_success_desc'),
          );
        }
      }, 2000);
    } catch (error) {
      console.error('[ProfileScreen] Purchase error:', error);
      Alert.alert(t('purchase_failed_title'), t('purchase_failed_desc'));
    } finally {
      setIsPurchasing(false);
    }
  };

  // ---- Restore purchases ----
  const handleRestorePurchase = async () => {
    if (isRestoring) return;

    console.log('[ProfileScreen] handleRestorePurchase clicked');
    setIsRestoring(true);
    try {
      console.log('[ProfileScreen] Calling restoreProPurchase...');
      const result = await restoreProPurchase();
      console.log('[ProfileScreen] restoreProPurchase result:', result);

      Alert.alert(
        result.success ? '✅ ' + t('restore_success_title') : t('restore_failed_title'),
        result.message,
        [{ text: 'OK', onPress: () => {
          if (result.success) {
            // Refresh subscription state
            setTimeout(async () => {
              const newSubState = await getSubscriptionState();
              setSubscriptionState(newSubState);
            }, 500);
          }
        }}]
      );
    } catch (error) {
      console.error('[ProfileScreen] Restore error:', error);
      Alert.alert(t('restore_failed_title'), t('restore_failed_desc'));
    } finally {
      setIsRestoring(false);
    }
  };

  // ---- Developer: reset quota (QA / testing only) ----
  const handleDevReset = () => {
    Alert.alert(
      t('dev_reset_quota'),
      t('dev_reset_quota_desc'),
      [
        {
          text: t('dev_reset_today'),
          onPress: async () => {
            try {
              await resetDailyUsage();
              const newSubState = await getSubscriptionState();
              setSubscriptionState(newSubState);
              Alert.alert(t('dev_reset_done'));
            } catch (e) {
              console.error('[ProfileScreen] resetDailyUsage failed:', e);
            }
          },
        },
        {
          text: t('dev_reset_trial'),
          onPress: async () => {
            try {
              await resetTrialForTesting();
              const newSubState = await getSubscriptionState();
              setSubscriptionState(newSubState);
              Alert.alert(t('dev_reset_done'));
            } catch (e) {
              console.error('[ProfileScreen] resetTrialForTesting failed:', e);
            }
          },
        },
        { text: t('cancel'), style: 'cancel' },
      ]
    );
  };

  // ---- Apple ID Sign In ----
  const handleAppleSignIn = async () => {
    const result = await signInWithApple();
    if (result.success) {
      setAppleUser(result.user);
      Alert.alert('✅ ' + t('welcome_back'), '');
    } else if (result.error !== 'cancelled') {
      Alert.alert(t('apple_sign_in_failed'));
    }
  };

  // ---- Apple ID Sign Out ----
  const handleAppleSignOut = async () => {
    Alert.alert(
      t('sign_out'),
      t('apple_sign_out_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('sign_out'),
          style: 'destructive',
          onPress: async () => {
            await signOutApple();
            setAppleUser(null);
            // Sync: clear subscription state and Pro permissions
            try {
              const AsyncStorage = require('@react-native-async-storage/async-storage').default;
              await AsyncStorage.removeItem('@SocialPostAI:subscriptionStatus');
              await AsyncStorage.removeItem('@SocialPostAI:dailyUsage');
              console.log('[AppleAuth] Signed out, cleared subscription state');
            } catch (e) {
              // Silent fail
            }
            // Refresh UI
            const subState = await getSubscriptionState();
            setSubscriptionState(subState);
            const perms = await getPermissions();
            setPermissions(perms);
          },
        },
      ]
    );
  };

  // ---- Show Apple account options ----
  const handleAppleAccountPress = () => {
    Alert.alert(
      t('apple_manage_account'),
      appleUser?.email
        ? `${appleUser.fullName || t('content_creator')}\n${appleUser.email}`
        : (appleUser?.fullName || t('apple_id_subscribed')),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('sign_out'),
          style: 'destructive',
          onPress: handleAppleSignOut,
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={getStatusBarStyle(theme)} />

      <>
        {/* Background decoration layer */}
        <BackgroundDecorator decorations={theme.decorations} background={theme.background} />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
        {/* ===== User Info Area ===== */}
        <View style={[styles.profileCard, { backgroundColor: theme.card, borderRadius: theme.borderRadius.xl }, getCardStyle(theme)]}>
          <CornerBrackets decorations={theme.decorations} borderRadius={theme.borderRadius.xl} />

        {/* Avatar — Pro users can change */}
        <TouchableOpacity
          onPress={permissions?.canEditProfile ? handleAvatarPick : undefined}
          style={styles.avatarContainer}
          disabled={!permissions?.canEditProfile}
        >
            {userProfile.avatarUri ? (
              <Image source={{ uri: userProfile.avatarUri }} style={[styles.avatar, { backgroundColor: theme.primary }]} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                <Text style={styles.avatarLetter}>{userProfile.username?.[0] || 'C'}</Text>
              </View>
            )}
            {permissions?.canEditProfile && (
              <View style={[styles.avatarEditBadge, { backgroundColor: theme.primary }]}>
                <Text style={styles.avatarEditBadgeText}>📷</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Username — Pro users can edit */}
          {editingUsername && permissions?.canEditProfile ? (
            <View style={styles.usernameEditRow}>
              <TextInput
                style={[styles.usernameInput, { color: theme.title, borderColor: theme.border }]}
                value={usernameInput}
                onChangeText={setUsernameInput}
                placeholder={t('username_placeholder')}
                placeholderTextColor={theme.placeholder}
                autoFocus
                maxLength={20}
                onBlur={handleUsernameSave}
                onSubmitEditing={handleUsernameSave}
              />
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => {
                if (permissions?.canEditProfile) {
                  setUsernameInput(userProfile.username || '');
                  setEditingUsername(true);
                }
              }}
              disabled={!permissions?.canEditProfile}
            >
              <Text style={[styles.userName, { color: theme.title }]}>
                {userProfile.username || t('content_creator')}
              </Text>
              {permissions?.showProBadge && (
                <Text style={[styles.proBadgeInline, { color: theme.primary }]}>
                  {t('pro_member_badge')}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Subscription badge — hidden when Pro (inline badge next to username is sufficient) */}
          {subscriptionState.status !== 'pro' && subscriptionState.status !== 'loading' && (
          <TouchableOpacity
            onPress={() => subscriptionState.status !== 'pro' ? setShowSubscription(true) : null}
            style={[styles.planBadge, {
              backgroundColor: subscriptionState.status === 'trial'
                ? theme.primaryLight
                : theme.borderLight || theme.border,
            }]}
          >
            <Text style={[styles.planText, {
              color: subscriptionState.status === 'free' ? theme.subtitle : theme.primary,
            }]}>
              {subscriptionState.status === 'trial'
                ? t('trial_badge', { days: subscriptionState.trialDaysLeft })
                : t('free_plan_limited')
              }
            </Text>
          </TouchableOpacity>
          )}

          {/* Upgrade prompt for free users */}
          {subscriptionState.status === 'free' && (
            <TouchableOpacity
              onPress={() => setShowSubscription(true)}
              style={[styles.upgradeBtn, { backgroundColor: theme.primary }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.upgradeBtnText, { color: '#FFFFFF' }]}>
                👑 {t('upgrade_unlock')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ===== Usage Stats (80px) ===== */}
        <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.title }]}>
            {t('usage')}
          </Text>
          <View style={styles.statsRow}>
            <StatItem label={t('today')} value={stats.today} theme={theme} />
            <View style={[styles.statDivider, { backgroundColor: theme.borderLight }]} />
            <StatItem label={t('this_month')} value={stats.month} theme={theme} />
            <View style={[styles.statDivider, { backgroundColor: theme.borderLight }]} />
            <StatItem label={t('total')} value={stats.total} theme={theme} />
          </View>
        </View>

        {/* ===== Favorites Section ===== */}
        <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
          <TouchableOpacity
            style={styles.favHeader}
            activeOpacity={0.7}
            onPress={handleFavoritesPress}
          >
            <Text style={[styles.sectionTitle, { color: theme.title, marginBottom: 0 }]}>
              ❤️ {t('favorites')}
            </Text>
            <View style={styles.favRight}>
              <Text style={[styles.favCount, { color: theme.subtitle }]}>
                {favorites.length} {t('items')}
              </Text>
              <Text style={[styles.arrow, { color: theme.placeholder }]}>
                {showFavorites ? '‹' : '›'}
              </Text>
            </View>
          </TouchableOpacity>

          {showFavorites && (
            <View style={styles.favList}>
              {favorites.length === 0 ? (
                <Text style={[styles.emptyFav, { color: theme.placeholder }]}>
                  {t('no_favorites')}
                </Text>
              ) : (
                favorites.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.favItem, { borderBottomColor: theme.border }]}
                    onPress={() => handleItemPress(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.favTopic, { color: theme.title }]}>
                      {item.topic}
                    </Text>
                    <Text style={[styles.favPreview, { color: theme.subtitle }]}>
                      {Object.values(item.results || {})[0]?.substring(0, 30)}...
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>

        {/* ===== Brand Voice Learning Entry (56px) ===== */}
        <TouchableOpacity
          style={[styles.sectionCard, { backgroundColor: theme.card, opacity: permissions?.canUseBrandVoice ? 1 : 0.5 }]}
          activeOpacity={0.7}
          onPress={() => {
            if (permissions?.canUseBrandVoice) {
              setShowBrandVoice(true);
            } else {
              Alert.alert(t('locked'), t('feature_locked_upgrade'));
            }
          }}
        >
          <View style={styles.favRow}>
            <Text style={[styles.sectionTitle, { color: theme.title, marginBottom: 0 }]}>
              🎙️ {t('brand_voice_learning')}
            </Text>
            <View style={styles.favRight}>
              {brandVoiceCount >= 2 ? (
                <View style={[styles.activeDot, { backgroundColor: theme.success }]}>
                  <Text style={styles.activeDotText}>● {t('active')}</Text>
                </View>
              ) : (
                <Text style={[styles.favCount, { color: theme.placeholder }]}>
                  {brandVoiceCount}/5 {t('sample').toLowerCase()}s
                </Text>
              )}
              <Text style={[styles.arrow, { color: theme.placeholder }]}>›</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ===== Theme Style Entry ===== */}
        <TouchableOpacity
          style={[styles.sectionCard, { backgroundColor: theme.card }]}
          activeOpacity={0.7}
          onPress={() => setShowStylePicker(true)}
        >
          <View style={styles.favRow}>
            <Text style={[styles.sectionTitle, { color: theme.title, marginBottom: 0 }]}>
              🎨 {t('theme_style')}
            </Text>
            <View style={styles.favRight}>
              <Text style={[styles.favCount, { color: theme.subtitle }]}>
                {(() => {
                  const opt = STYLE_THEME_OPTIONS.find((o) => o.name === themeName);
                  return opt ? `${opt.emoji} ${t(STYLE_KEY_MAP[opt.name])}` : t('style_minimal');
                })()}
              </Text>
              <Text style={[styles.arrow, { color: theme.placeholder }]}>›</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ===== Interface Language Entry ===== */}
        <TouchableOpacity
          style={[styles.sectionCard, { backgroundColor: theme.card }]}
          activeOpacity={0.7}
          onPress={() => setShowInterfaceLangPicker(true)}
        >
          <View style={styles.favRow}>
            <Text style={[styles.sectionTitle, { color: theme.title, marginBottom: 0 }]}>
              🌐 {t('interface_language')}
            </Text>
            <View style={styles.favRight}>
              <Text style={[styles.favCount, { color: theme.subtitle }]}>
                {language === 'zh' ? '🇨🇳 中文' : '🇺🇸 English'}
              </Text>
              <Text style={[styles.arrow, { color: theme.placeholder }]}>›</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ===== Subscription Entry ===== */}
        <TouchableOpacity
          style={[styles.sectionCard, { backgroundColor: theme.card }]}
          activeOpacity={0.7}
          onPress={() => setShowSubscription(true)}
        >
          <View style={styles.favRow}>
            <Text style={[styles.sectionTitle, { color: theme.title, marginBottom: 0 }]}>
              👑 Pro
            </Text>
            <View style={styles.favRight}>
              <Text style={[styles.favCount, { color: theme.primary }]}>
                {t('upgrade_to_pro')}
              </Text>
              <Text style={[styles.arrow, { color: theme.placeholder }]}>›</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ===== Apple ID Login ===== */}
        {isAppleAuthAvailable() && (
          <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
            {appleUser || subscriptionState?.status === 'pro' || subscriptionState?.status === 'trial' ? (
              <>
                {/* Apple ID info row */}
                <TouchableOpacity
                  style={styles.appleUserInfo}
                  onPress={handleAppleAccountPress}
                  activeOpacity={0.7}
                >
                  <View style={styles.appleUserInfoLeft}>
                    <Text style={styles.appleIcon}>🍎</Text>
                    <View style={styles.appleUserDetails}>
                      <Text style={[styles.appleUserBound, { color: theme.title }]}>
                        {t('apple_bound')}
                      </Text>
                      <Text style={[styles.appleUserEmail, { color: theme.subtitle }]} numberOfLines={1}>
                        {appleUser?.email || appleUser?.fullName || t('apple_id_subscribed')}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.appleManageArrow, { color: theme.placeholder }]}>›</Text>
                </TouchableOpacity>

                {/* Sign out row — always visible in all subscription states */}
                <TouchableOpacity
                  style={[styles.appleSignOutRow, { borderTopColor: theme.borderLight }]}
                  onPress={handleAppleSignOut}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.appleSignOutText, { color: theme.subtitle }]}>
                    {t('sign_out')}
                  </Text>
                  <Text style={[styles.appleSignOutArrow, { color: theme.placeholder }]}>›</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.appleSignInBtn}
                onPress={handleAppleSignIn}
                activeOpacity={0.7}
              >
                <Text style={styles.appleSignInIcon}></Text>
                <Text style={styles.appleSignInText}>
                  {t('sign_in_with_apple')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ===== Settings List ===== */}
        <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
          <SettingRow
            item={{ id: 'privacy', icon: '🔒', titleKey: 'privacy_policy' }}
            isLast={false}
            theme={theme}
            onPress={() => Linking.openURL(PRIVACY_URL)}
            t={t}
          />
          <SettingRow
            item={{ id: 'terms', icon: '📄', titleKey: 'terms_of_service' }}
            isLast={false}
            theme={theme}
            onPress={() => Linking.openURL(TERMS_URL)}
            t={t}
          />
          <SettingRow
            item={{ id: 'data_storage', icon: '💾', titleKey: 'data_storage_notice' }}
            isLast={false}
            theme={theme}
            onPress={() => Alert.alert(
              t('data_storage_title'),
              t('data_storage_desc'),
              [{ text: t('data_storage_ok') }],
            )}
            t={t}
          />
          <SettingRow
            item={{ id: 'ai_disclaimer', icon: '🤖', titleKey: 'ai_content_notice' }}
            isLast={false}
            theme={theme}
            onPress={() => Alert.alert(
              t('ai_disclaimer_title'),
              t('ai_disclaimer_desc'),
              [{ text: t('ai_disclaimer_ok') }],
            )}
            t={t}
          />
          <SettingRow
            item={{ id: 'contact', icon: '📧', titleKey: 'contact_us' }}
            isLast={false}
            theme={theme}
            onPress={() => Alert.alert(t('contact_us'), t('contact_desc'))}
            t={t}
          />
          {TEST_TOOLS_ENABLED && (
            <SettingRow
              item={{ id: 'dev_reset', icon: '🧪', titleKey: 'dev_reset_quota' }}
              isLast={false}
              theme={theme}
              onPress={handleDevReset}
              t={t}
            />
          )}
          <SettingRow
            item={{ id: 'rate', icon: '⭐', titleKey: 'rate_app' }}
            isLast={false}
            theme={theme}
            onPress={() => Alert.alert(t('rate_thanks'), t('rate_desc'))}
            t={t}
          />
          <SettingRow
            item={{ id: 'diag', icon: '🩺', titleKey: 'diag_open' }}
            isLast={true}
            theme={theme}
            onPress={() => setShowDiagnostics(true)}
            t={t}
          />
        </View>

        {/* ===== Version ===== */}
        <Text style={[styles.version, { color: theme.placeholder }]}>
          SocialPost AI v1.0.0
        </Text>
      </ScrollView>

      {/* ===== Interface Language Picker Modal ===== */}
      <Modal
        visible={showInterfaceLangPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInterfaceLangPicker(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.title }]}>
              🌐 {t('interface_language')}
            </Text>

            <TouchableOpacity
              style={[
                styles.modelOption,
                language === 'en' && {
                  borderColor: theme.primary,
                  backgroundColor: theme.primaryLight,
                },
              ]}
              onPress={() => handleInterfaceLangSwitch('en')}
              activeOpacity={0.7}
            >
              <View style={styles.modelOptionLeft}>
                <Text style={styles.modelIcon}>🇺🇸</Text>
                <View>
                  <Text style={[styles.modelName, { color: theme.title }]}>
                    {t('english')}
                  </Text>
                  <Text style={[styles.modelId, { color: theme.placeholder }]}>
                    English
                  </Text>
                </View>
              </View>
              {language === 'en' && (
                <Text style={[styles.modelCheck, { color: theme.primary }]}>✓</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modelOption,
                language === 'zh' && {
                  borderColor: theme.primary,
                  backgroundColor: theme.primaryLight,
                },
              ]}
              onPress={() => handleInterfaceLangSwitch('zh')}
              activeOpacity={0.7}
            >
              <View style={styles.modelOptionLeft}>
                <Text style={styles.modelIcon}>🇨🇳</Text>
                <View>
                  <Text style={[styles.modelName, { color: theme.title }]}>
                    {t('chinese')}
                  </Text>
                  <Text style={[styles.modelId, { color: theme.placeholder }]}>
                    中文
                  </Text>
                </View>
              </View>
              {language === 'zh' && (
                <Text style={[styles.modelCheck, { color: theme.primary }]}>✓</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalCloseBtn, { backgroundColor: theme.primary }]}
              onPress={() => setShowInterfaceLangPicker(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCloseText}>{t('done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== Subscription Modal ===== */}
      <Modal
        visible={showSubscription}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSubscription(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.subModalCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.title }]}>
              👑 {t('upgrade_to_pro')}
            </Text>
            <Text style={[styles.modalSubtitle, { color: theme.subtitle }]}>
              {t('go_pro_subtitle')}
            </Text>

            {/* Feature comparison */}
            <View style={styles.comparisonTable}>
              <View style={[styles.comparisonHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.comparisonHeaderText, { color: theme.subtitle }]} />
                <Text style={[styles.comparisonHeaderText, { color: theme.subtitle }]}>Free</Text>
                <Text style={[styles.comparisonHeaderText, { color: theme.primary }]}>Pro</Text>
              </View>
              {FEATURE_COMPARISON.map((row, idx) => (
                <View key={idx} style={styles.comparisonRow}>
                  <View style={styles.comparisonFeatureWrapper}>
                    <Text style={[styles.comparisonFeature, { color: theme.subtitle }]}>{t(row.key)}</Text>
                    {row.hasInfo && (
                      <TouchableOpacity
                        activeOpacity={0.6}
                        onPress={() => Alert.alert(t('history_info_title'), t('history_info_desc'))}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        style={{ marginLeft: 4 }}
                      >
                        <Text style={[styles.infoIcon, { color: theme.primary }]}>ⓘ</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={[styles.comparisonValue, { color: theme.subtitle }]}>{row.free}</Text>
                  <Text style={[styles.comparisonValue, { color: theme.primary, fontWeight: '700' }]}>{row.pro}</Text>
                </View>
              ))}
            </View>

            {/* Data storage footer notice */}
            <Text style={[styles.historyFooterNote, { color: theme.placeholder }]}>
              {t('history_footer_note')}
            </Text>

            {/* Pricing tiers */}
            <View style={styles.tierRow}>
              {PROFILE_TIERS.map((tier) => (
                <TouchableOpacity
                  key={tier.id}
                  style={[
                    styles.tierCard,
                    selectedTier === tier.id && {
                      borderColor: theme.primary,
                      backgroundColor: theme.primaryLight,
                    },
                  ]}
                  onPress={() => setSelectedTier(tier.id)}
                  activeOpacity={0.7}
                >
                  {tier.badge ? (
                    <View style={[styles.tierBadge, { backgroundColor: theme.primary }]}>
                      <Text style={styles.tierBadgeText}>{tier.badge}</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.tierLabel, { color: theme.subtitle }]}>
                    {tier.label}
                  </Text>
                  {/* Monthly: show intro price + regular price */}
                  {tier.introPrice ? (
                    <View style={styles.tierPriceGroup}>
                      <Text style={[styles.tierIntroPrice, { color: theme.primary }]}>
                        {tier.introPrice}
                      </Text>
                      <Text style={[styles.tierIntroPeriod, { color: theme.primary }]}>
                        {tier.introPeriod}
                      </Text>
                      <Text style={[styles.tierRegularPrice, { color: theme.placeholder }]}>
                        {tier.price}{tier.period}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.tierPriceGroup}>
                      <Text style={[styles.tierPrice, { color: theme.title }]}>
                        {tier.price}
                      </Text>
                      <Text style={[styles.tierPeriod, { color: theme.placeholder }]}>
                        {tier.period}
                      </Text>
                    </View>
                  )}
                  {/* Sub-note: monthly intro note or annual monthly avg */}
                  {tier.introNote && selectedTier === tier.id && (
                    <Text style={[styles.tierSubNote, { color: theme.subtitle }]}>
                      {tier.introNote}
                    </Text>
                  )}
                  {tier.subNote && (
                    <Text style={[styles.tierSubNote, { color: theme.primary }]}>
                      {tier.subNote}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.modalCloseBtn, { backgroundColor: theme.primary, opacity: isPurchasing ? 0.6 : 1 }]}
              onPress={() => {
                const tier = PROFILE_TIERS.find((t) => t.id === selectedTier);
                if (tier) handlePurchase(tier);
              }}
              activeOpacity={0.7}
              disabled={isPurchasing}
            >
              {isPurchasing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.modalCloseText}>{t('subscribe_btn')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleRestorePurchase}
              activeOpacity={0.7}
              style={styles.restoreRow}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator color={theme.placeholder} size="small" />
              ) : (
                <Text style={[styles.restoreText, { color: theme.placeholder }]}>
                  {t('restore_purchases')}
                </Text>
              )}
            </TouchableOpacity>

            {/* Cancel button - always visible */}
            <TouchableOpacity
              style={{
                marginTop: 16,
                paddingVertical: 12,
                alignItems: 'center',
              }}
              onPress={() => setShowSubscription(false)}
            >
              <Text style={{
                color: '#999',
                fontSize: 16,
                textAlign: 'center',
              }}>
                {t('cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== Diagnostics Panel ===== */}
      <DiagnosticsPanel
        visible={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        themeName={themeName}
      />

      {/* ===== Theme Style Picker Modal ===== */}
      <Modal
        visible={showStylePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStylePicker(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.modalTitle, { color: theme.title }]}>
                🎨 {t('theme_style')}
              </Text>
              <TouchableOpacity
                onPress={() => setShowStylePicker(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.pickerClose, { color: theme.primary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.pickerDivider, { backgroundColor: theme.borderLight }]} />

            {STYLE_THEME_OPTIONS.map((opt) => {
              const isActive = themeName === opt.name;
              return (
                <TouchableOpacity
                  key={opt.name}
                  style={[
                    styles.styleOption,
                    isActive && {
                      borderColor: theme.primary,
                      backgroundColor: theme.primaryLight,
                    },
                  ]}
                  onPress={() => handleThemeChange(opt.name)}
                  activeOpacity={0.7}
                >
                  <View style={styles.styleOptionLeft}>
                    {/* Color preview dots */}
                    <View style={styles.stylePreviewDots}>
                      {opt.previewColors.map((color, i) => (
                        <View
                          key={i}
                          style={[styles.styleDot, { backgroundColor: color }]}
                        />
                      ))}
                    </View>
                    <View style={styles.styleTextBlock}>
                      <Text style={[styles.styleEmoji]}>{opt.emoji}</Text>
                      <View>
                          <Text style={[styles.styleLabel, { color: isActive ? theme.primary : theme.title }]}>
                            {t(STYLE_KEY_MAP[opt.name])}
                          </Text>
                        </View>
                    </View>
                  </View>
                  {isActive && (
                    <Text style={[styles.modelCheck, { color: theme.primary }]}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.modalCloseBtn, { backgroundColor: theme.primary }]}
              onPress={() => setShowStylePicker(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCloseText}>{t('done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== Result Drawer ===== */}
      <ResultDrawer
        visible={drawerVisible}
        result={currentResult}
        onClose={() => {
          setDrawerVisible(false);
          loadData();
        }}
        onRegenerate={() => setDrawerVisible(false)}
        onFavorite={handleFavorite}
        onSave={() => setDrawerVisible(false)}
        themeName={themeName}
      />
      </>
    </SafeAreaView>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StatItem({ label, value, theme }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: theme.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.subtitle }]}>{label}</Text>
    </View>
  );
}

function SettingRow({ item, isLast, theme, onPress, t }) {
  return (
    <TouchableOpacity
      style={[styles.settingRow, !isLast && styles.settingDivider, !isLast && { borderBottomColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.settingIcon}>{item.icon}</Text>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: theme.title }]}>
          {t(item.titleKey)}
        </Text>
      </View>
      <Text style={[styles.arrow, { color: theme.placeholder }]}>›</Text>
    </TouchableOpacity>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxxl + 80,
  },

  // Profile card
  profileCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.xxxl,
    paddingVertical: SPACING.lg,
    ...SHADOWS.card,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    resizeMode: 'cover',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.sm,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadgeText: {
    fontSize: 10,
  },
  avatarLetter: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  usernameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  usernameInput: {
    fontSize: FONT_SIZE.md,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    width: 160,
    textAlign: 'center',
  },
  upgradeBtn: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xxxl + 8,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    alignSelf: 'center',
    ...SHADOWS.medium,
  },
  upgradeBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  planBadge: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    marginTop: SPACING.sm,
  },
  planText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },

  // Section card
  sectionCard: {
    padding: SPACING.xl,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '400',
  },
  statDivider: {
    width: 1,
    height: 32,
  },

  // Favorites
  favHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  favRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  favCount: {
    fontSize: FONT_SIZE.sm,
    marginRight: SPACING.sm,
  },
  arrow: {
    fontSize: 22,
    fontWeight: '300',
  },
  favList: {
    marginTop: SPACING.md,
    maxHeight: 200,
  },
  favItem: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BASE.border,
  },
  favTopic: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  favPreview: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  emptyFav: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },

  // Brand voice active dot
  activeDot: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    marginRight: SPACING.sm,
  },
  activeDotText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Settings
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
  },
  settingDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.BASE.border,
  },
  settingIcon: {
    fontSize: FONT_SIZE.md,
    marginRight: SPACING.md,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
  },

  // Version
  version: {
    textAlign: 'center',
    fontSize: FONT_SIZE.xs,
    marginTop: SPACING.xl,
  },

  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.BASE.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalCard: {
    width: '100%',
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    ...SHADOWS.float,
  },
  subModalCard: {
    width: '100%',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.float,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  modalSubtitle: {
    fontSize: FONT_SIZE.xs,
    marginBottom: SPACING.lg,
  },
  modelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.BASE.border,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
  },
  modelOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modelIcon: {
    fontSize: 24,
    marginRight: SPACING.md,
  },
  modelName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  modelId: {
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
  },
  modelCheck: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  modalCloseBtn: {
    height: 44,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },

  // Subscription — feature comparison
  comparisonTable: {
    marginBottom: SPACING.lg,
  },
  comparisonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: SPACING.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.BASE.border,
    marginBottom: SPACING.xs,
  },
  comparisonHeaderText: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  comparisonFeature: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
  },
  comparisonFeatureWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  comparisonValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.xs,
  },
  historyFooterNote: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 16,
    paddingHorizontal: SPACING.md,
  },

  // Subscription — tier cards
  tierRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  tierCard: {
    width: '48%',
    borderWidth: 1.5,
    borderColor: COLORS.BASE.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    marginBottom: SPACING.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  tierBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderBottomLeftRadius: 8,
  },
  tierBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
  },
  tierLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
    marginBottom: 2,
  },
  tierPriceGroup: {
    alignItems: 'center',
  },
  tierIntroPrice: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  tierIntroPeriod: {
    fontSize: 10,
    fontWeight: '600',
  },
  tierRegularPrice: {
    fontSize: 10,
    marginTop: 2,
  },
  tierPrice: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  tierPeriod: {
    fontSize: 10,
  },
  tierSubNote: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 13,
  },
  restoreRow: {
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  restoreText: {
    fontSize: FONT_SIZE.xs,
  },

  // Apple ID Sign In
  appleUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appleUserInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  appleIcon: {
    fontSize: 24,
    marginRight: SPACING.md,
  },
  appleUserDetails: {
    flex: 1,
  },
  appleUserBound: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  appleUserEmail: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  appleManageArrow: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '300',
  },
  appleSignOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  appleSignOutText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
  },
  appleSignOutArrow: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '300',
  },
  appleSignInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
  },
  appleSignInIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  appleSignInText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  proBadgeInline: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    marginLeft: SPACING.xs,
  },

  // Theme Style Picker
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  pickerClose: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
  },
  pickerDivider: {
    height: 1,
    marginBottom: SPACING.md,
  },
  styleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.BASE.border,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
  },
  styleOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stylePreviewDots: {
    flexDirection: 'row',
    marginRight: SPACING.md,
  },
  styleDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 3,
  },
  styleTextBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  styleEmoji: {
    fontSize: 22,
    marginRight: SPACING.sm,
  },
  styleLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  styleSublabel: {
    fontSize: FONT_SIZE.xs,
    marginTop: 1,
  },
});

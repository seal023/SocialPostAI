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
  subscribeSubscription,
  syncProEntitlement,
  manageSubscriptions,
  PRODUCT_IDS,
} from '../utils/subscription';
import { baseProductId, isUserCancelled, getLastEntitlementResult, fetchStorefront } from '../services/IAPService';
import { useLanguage } from '../context/LanguageContext';
import { signInWithApple, signOutApple, deleteAppleAccount, getAppleAuthState, isAppleAuthAvailable } from '../services/AppleAuthService';
import { getPermissions } from '../utils/permissions';
import BrandVoiceScreen from './BrandVoiceScreen';
import ResultDrawer from '../components/ResultDrawer';
import DiagnosticsPanel from '../components/DiagnosticsPanel';
import { TEST_TOOLS_ENABLED } from '../config/buildInfo';
import { BackgroundDecorator, CornerBrackets, getCardStyle, getStatusBarStyle } from '../components/StyleDecorator';

// Privacy & Terms URLs
const PRIVACY_URL = 'https://seal023.github.io/privacy-policy/';
const TERMS_URL = 'https://seal023.github.io/terms-of-service/';

// App Store product page + write-review deep link.
// The numeric id equals the App Store Connect "Apple ID" (ascAppId 6801996062).
// Once the app is live these open the App Store; on TestFlight (no public page
// yet) the open fails and we fall back to an alert.
const APP_STORE_URL = 'https://apps.apple.com/app/id6801996062';
const APP_STORE_REVIEW_URL = 'https://apps.apple.com/app/id6801996062?action=write-review';

// Pricing tiers — will be loaded dynamically from StoreKit via IAP
// Format an amount in the currency/format of a StoreKit localized price:
//   ('¥328.00', 27.3333) → '¥27.33'      ('US$49.99', 4.1666) → 'US$4.17'
//   ('49,99 €', 4.1666)  → '4.17 €'
//
// The paywall's price-DERIVED notes (annual monthly-average, "then ¥xx/yr")
// must be quoted in the same currency Apple actually charges. App Store review
// compares the displayed price with the real one, and a hardcoded USD string on
// a ¥-priced product both misleads users and risks rejection.
function formatLocalizedAmount(localizedPrice, amount) {
  if (typeof localizedPrice !== 'string' || !localizedPrice.trim()) return null;
  if (typeof amount !== 'number' || !isFinite(amount)) return null;

  const trimmed = localizedPrice.trim();
  const numeric = trimmed.replace(/[^\d.,]/g, '');
  // Mirror StoreKit's own precision: ¥328.00 → 2 decimals, ¥328 → 0.
  const decimals = /[.,]\d{2}$/.test(numeric) ? 2 : 0;
  // Everything that is not a digit/separator/space is the currency marker.
  const symbol = trimmed.replace(/[\d.,\s]/g, '');
  const value = amount.toFixed(decimals);

  if (!symbol) return value;
  // Keep the marker on whichever side StoreKit put it.
  return /^\d/.test(trimmed) ? `${value} ${symbol}` : `${symbol}${value}`;
}

// ---- "StoreKit never answered the product request" detector ----------------
// Distinct from "Apple answered and refused the purchase". IAPService composes
// the fetch diagnostic INTO the PRODUCT_NOT_FOUND payload (see the
// fetchCause/hint block in purchaseSubscription), so matching that text is how
// we tell a cold-start timeout apart from a real product/configuration error —
// and both the silent retry below and the alert wording depend on it.
const STORE_FETCH_TIMEOUT_RE = /E_FETCH_TIMEOUT|did not settle|StoreKit 无响应/;

function isStoreFetchTimeoutFailure(result) {
  return !!result && result.success === false
    && STORE_FETCH_TIMEOUT_RE.test(String(result.message || ''));
}

// Fallback values used until products are fetched
// ⚠️  Product IDs must EXACTLY match App Store Connect configuration.
//     Current (2026-11-05): com.seal023.socialpostai.monthly.v3 / com.seal023.socialpostai.annual.v3
//     (the old .v2 subscriptions were abandoned — see PRODUCT_IDS in IAPService.js)
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

export default function ProfileScreen({ themeName = 'pink', onThemeChange, onSignOut }) {
  const theme = getTheme(themeName);
  const { t, language, setLanguage } = useLanguage();
  // Explicit acknowledgement button for every Alert on this screen.
  //
  // WHY: React Native's Alert.alert(title, message) WITHOUT a buttons array makes
  // iOS supply its own default button ("OK"), and iOS localises that string
  // against the DEVICE language — not our in-app language. On a Chinese device
  // with the app set to English this produced "English dialog + 好" (reported
  // 2026-10-09). Passing our own text ({ text: t('ok') }) keeps it consistent
  // with the interface language the user actually selected.
  const okButton = [{ text: t('ok') }];
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
  const [restoreModal, setRestoreModal] = useState(null); // { tone: 'success'|'error'|'info', icon, title, desc }
  // Guards the "欢迎 Pro" welcome alert so it shows at most once per session,
  // even if the subscription event fires more than once (purchase + restore).
  const proWelcomeShownRef = useRef(false);
  // Mirrors `showSubscription` so an async handler can tell whether the paywall
  // is still open. Needed by the cold-StoreKit silent retry in handlePurchase:
  // that retry fires ~1.5s after a long timeout and must NOT open Apple's
  // payment sheet if the user already dismissed the paywall in the meantime.
  const paywallOpenRef = useRef(false);
  useEffect(() => {
    paywallOpenRef.current = showSubscription;
  }, [showSubscription]);

  // ── iOS modal/alert collision guard (build 74 regression) ──────────────────
  // Dismissing a <Modal> and presenting a native Alert (or opening another
  // Modal) in the SAME JS turn makes UIKit present the alert from a view
  // controller that is still being dismissed. The transition breaks and the
  // modal's host view is left behind on top of this screen, swallowing every
  // touch: Settings stops scrolling and stops responding to taps while the tab
  // bar (a sibling of the screen, not of the modal) keeps working. Reproduced
  // on build 74 — 购买 → "已购买" → 确定 → 设置页冻结.
  //
  // EVERY close of the paywall must go through closePaywall() so the timestamp
  // below is accurate — the subscription-state listener closes it too (on a
  // successful unlock), and an Alert fired right after THAT close froze the
  // screen just the same.
  // 450ms: RN's fade dismissal runs ~0.35s, plus a margin so we never present
  // into the tail of the transition.
  const MODAL_EXIT_MS = 450;
  const paywallClosedAtRef = useRef(0);

  const closePaywall = () => {
    paywallOpenRef.current = false;
    paywallClosedAtRef.current = Date.now();
    setShowSubscription(false);
  };

  // Close the paywall (if it is up) and only then run `fn` — after the
  // dismissal animation has actually finished, so nothing is presented into a
  // half-dismissed modal.
  const closePaywallThen = (fn) => {
    if (paywallOpenRef.current) closePaywall();
    const closedAt = paywallClosedAtRef.current;
    const elapsed = closedAt ? Date.now() - closedAt : Infinity;
    if (elapsed >= MODAL_EXIT_MS) {
      fn();
      return;
    }
    setTimeout(fn, MODAL_EXIT_MS - elapsed);
  };

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

  // Live subscription updates: when Pro is unlocked (purchase or restore),
  // update our local state, close the paywall, and greet the user — without
  // relying on the fragile 2-second setTimeout poll in handlePurchase.
  useEffect(() => {
    const unsub = subscribeSubscription(async (state) => {
      setSubscriptionState(state);
      // Recompute the derived permissions too. They drive the 👑 Pro badge and
      // the avatar/username editing row; without this the unlock lands in
      // storage but the badge stays hidden until the app is restarted.
      try {
        const perms = await getPermissions();
        setPermissions(perms);
      } catch (e) {}
      if (state.status === 'pro') {
        closePaywall(); // auto-close paywall on success (stamps the close time)
        // ⚠️ The "Purchase Successful" alert is deliberately NOT fired here.
        // This listener also runs for PASSIVE reconciles (app init, every paywall
        // focus), which flip an ALREADY-subscribed user's status to 'pro'. Greeting
        // here therefore made a genuinely FAILED purchase pop a "Purchase
        // Successful / Welcome to Pro!" alert on top of its failure dialog, even
        // though nothing was bought. Only the two user-initiated flows greet now:
        // handlePurchase() and handleRestorePurchase() below.
      }
    });
    return unsub;
  }, []);

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
    // Re-reconcile Pro status with what StoreKit says the user actually owns,
    // every time the Profile tab (and thus the paywall) becomes focused. This
    // fixes "已购买却仍显示升级到 Pro": a purchase made elsewhere / a restored
    // subscription is reflected immediately, without waiting for a crash-prone
    // startup check.
    //
    // Order matters: this call can itself write 'pro' to storage, so the reads
    // below must happen AFTER it, never before.
    try {
      await syncProEntitlement('paywall-focus');
    } catch (e) {}
    try {
      const subState = await getSubscriptionState();
      setSubscriptionState(subState);
    } catch (e) {}
    // Permissions are DERIVED from the stored subscription status (they gate
    // the 👑 Pro badge next to the avatar, profile editing, etc.). They used to
    // be loaded once on mount only, so after a purchase the Pro badge never
    // appeared and the avatar row went blank — the subscription state and its
    // derived permissions must always be read as a pair.
    try {
      const perms = await getPermissions();
      setPermissions(perms);
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
            // Match on the NORMALIZED slot: StoreKit returns the `.v3` SKU,
            // but a legacy `.v2` / plain SKU must still map onto the same card.
            // A plain `===` here silently failed once, so the card kept showing
            // the hardcoded fallback price — which would not match the amount
            // Apple actually charges (App Store display rules require a match).
            const product =
              products.find((p) => p.productId === tier.productId) ||
              products.find((p) => baseProductId(p.productId) === baseProductId(tier.productId));
            if (!product) return { ...tier, isLoading: false };

            const realPrice = product.localizedPrice || product.price;
            const parsedValue = parseFloat(String(realPrice || '').replace(/[^\d.]/g, ''));
            const realValue =
              typeof product.priceValue === 'number' && isFinite(product.priceValue)
                ? product.priceValue
                : (isFinite(parsedValue) ? parsedValue : tier.priceValue);
            const isFallback = product.isFallback === true;

            const next = {
              ...tier,
              price: realPrice || tier.price,
              priceValue: realValue,
              description: product.description,
              isLoading: false,
              isFallback,
            };

            // Rebuild the price-DERIVED notes from the real localized price.
            // These used to be hardcoded USD ("$4.17/mo avg", "then $5.99/mo"),
            // so the paywall quoted dollars while Apple charged ¥328/yr — a
            // mismatch App Store review flags and users read as misleading.
            // When StoreKit could not be reached (fallback list) we show NO
            // derived amount at all rather than a fabricated currency.
            if (!isFallback && realPrice) {
              if (tier.id === 'monthly' || tier.id === 'annual') {
                next.introNote = t('paywall_free_trial_then', {
                  price: `${realPrice}${tier.period}`,
                });
              }
              if (tier.id === 'annual') {
                const perMonth = formatLocalizedAmount(realPrice, realValue / 12);
                next.subNote = perMonth ? t('paywall_annual_avg', { price: perMonth }) : null;
              }
            } else {
              // StoreKit unreachable → the tier still carries its hardcoded USD
              // placeholder. Show no derived amount rather than a fabricated one.
              next.introNote = null;
              next.subNote = null;
            }
            return next;
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

    // Already subscribed? NEVER start a purchase. StoreKit has nothing to sell
    // for an item you already own, so on an owned subscription the purchase can
    // resolve WITHOUT ever presenting the payment sheet — which then surfaced as
    // a bogus "购买成功 / 欢迎升级 Pro" alert with no sheet in sight. Reconcile
    // first (state can be stale), and if Pro is already owned, say so and stop.
    let ownsPro = subscriptionState.status === 'pro';
    if (!ownsPro) {
      try {
        // syncProEntitlement() can now also DOWNGRADE (when Apple decisively
        // reports that nothing is owned), so always re-read the derived state —
        // not only when it returns a positive hit.
        await syncProEntitlement('pre-purchase');
        const subState = await getSubscriptionState();
        setSubscriptionState(subState);
        const perms = await getPermissions();
        setPermissions(perms);
        ownsPro = subState.status === 'pro';
      } catch (e) {}
    }
    if (ownsPro) {
      closePaywallThen(() =>
        Alert.alert(t('already_subscribed_title'), t('already_subscribed_desc'), okButton));
      return;
    }

    setIsPurchasing(true);
    // The instant the user committed to buying. A genuinely NEW transaction
    // carries a timestamp ≈ this moment; a pre-existing entitlement (an
    // already-owned subscription) carries an OLDER one — see isNewPurchase below.
    const attemptAt = Date.now();
    try {
      console.log('[ProfileScreen] Calling purchasePro...');
      let result = await purchasePro(tier.productId);
      console.log('[ProfileScreen] purchasePro result:', result);

      // ── Cold-StoreKit guard ────────────────────────────────────────────────
      // On a fresh install/launch the FIRST product request is genuinely slow:
      // StoreKit must fetch/validate the app receipt and resolve the storefront
      // before `Product.products(for:)` can answer. So a first tap can time out
      // through no fault of the user, and an identical second tap moments later
      // succeeds — observed on device as "first tap → Cannot Reach the App
      // Store, second tap → purchase sheet opens". StoreKit 2 also refuses to
      // open the sheet for an SKU that is absent from its native product cache,
      // so a timed-out fetch cannot buy anything anyway: retrying is the only
      // way forward, not a way around a real error. Do it ONCE, silently, so
      // neither a user nor an App Store reviewer sees a scary alert on the very
      // first tap.
      if (isStoreFetchTimeoutFailure(result) && paywallOpenRef.current) {
        console.log('[ProfileScreen] StoreKit product request timed out (cold start?) — retrying once silently…');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        // The user may have dismissed the paywall during that wait — never open
        // Apple's payment sheet behind a screen they already closed.
        if (paywallOpenRef.current) {
          result = await purchasePro(tier.productId);
          console.log('[ProfileScreen] purchasePro retry result:', result);
        }
      }

      if (!result.success) {
        if (result.error === 'IAP_NOT_AVAILABLE') {
          Alert.alert(
            t('iap_not_available_title'),
            t('iap_not_available_desc'),
            okButton,
          );
        } else if (!isUserCancelled({ code: result.error, message: result.message })) {
          // StoreKit never answered (device has no App Store account / storefront
          // mismatch / no network) → the raw PRODUCT_NOT_FOUND payload embeds the
          // whole fetch diagnostic. Show the short, actionable version instead.
          if (isStoreFetchTimeoutFailure(result)) {
            // Distinguish "the store is genuinely unreachable" from "the store
            // IS reachable but answered too slowly". Blaming the account when
            // the device is signed in — and latency was the only real problem —
            // sends the user (and a reviewer) chasing a setting that is already
            // correct. getStorefront() hits the StoreKit storefront API, so a
            // country code here proves the StoreKit ↔ App Store path works.
            let storefrontOk = false;
            try {
              const sf = await fetchStorefront();
              storefrontOk = !!(sf && sf.ok);
            } catch (e) {}
            if (storefrontOk) {
              Alert.alert(t('purchase_store_slow_title'), t('purchase_store_slow_desc'), okButton);
            } else {
              Alert.alert(t('purchase_no_account_title'), t('purchase_no_account_desc'), okButton);
            }
          } else {
            Alert.alert(
              t('purchase_failed_title'),
              result.message || t('purchase_failed_desc'),
              okButton,
            );
          }
        }
        return;
      }

      // ⚠️ A resolved purchasePro() only means "the native StoreKit call
      // returned" — it is NOT proof the user paid. On a device with no App Store
      // account (or when StoreKit hands back an already-owned / queued
      // transaction) it resolves with NO payment sheet and NO charge. The previous
      // code greeted here unconditionally, which is exactly how "购买成功 / 欢迎
      // 升级 Pro" popped with nothing purchased (2026-09-16).
      //
      // Ask Apple what we own, then decide whether the entitlement is NEW.
      // The transaction object returned by the native purchase call is the
      // strongest evidence we can get: StoreKit only resolves it AFTER the
      // payment sheet completed. Build 73 charged the annual plan yet the app
      // stayed on Free because this decision depended 100% on the JS purchase
      // event arriving (and on the Sk2 entitlement query agreeing) — neither of
      // which is guaranteed. A returned transaction is treated as a purchase.
      const nativePurchase = result.purchase || null;
      let verified = false;
      if (nativePurchase) {
        console.log('[ProfileScreen] Native purchase returned a transaction:',
          nativePurchase.productId, '| txId:', nativePurchase.transactionId || '(none)');
        // No need to re-interrogate Apple here: the shared success callback has
        // already written 'pro', and re-running the reconcile would add up to a
        // 30s round trip (it re-fetches the catalog when the entitlement list
        // looks empty) — and could revoke what we just unlocked.
        verified = true;
      } else {
        try {
          verified = await syncProEntitlement('post-purchase');
        } catch (e) {}
      }

      let subState = subscriptionState;
      try {
        subState = await getSubscriptionState();
        setSubscriptionState(subState);
      } catch (e) {}
      try {
        const perms = await getPermissions();
        setPermissions(perms);
      } catch (e) {}

      // ── New purchase vs. already owned ─────────────────────────────────────
      // `verified` alone cannot tell these apart: tapping 订阅 on a subscription
      // the user ALREADY owns (e.g. an auto-renew-CANCELLED sub that is still
      // inside its paid period) makes Apple hand back the EXISTING transaction
      // with no sheet and no charge — yet syncProEntitlement happily reports it.
      // So compare the entitlement's OWN transaction timestamp to the moment the
      // user tapped: a real purchase closes AFTER the tap (txDate >= attemptAt,
      // minus a little slack for clock skew); a pre-existing entitlement is older.
      const ent = getLastEntitlementResult ? getLastEntitlementResult() : null;
      let txAt = ent ? ent.transactionDate : null;
      if (typeof txAt === 'string') txAt = Date.parse(txAt);
      if (typeof txAt === 'number' && txAt > 0 && txAt < 1e12) txAt = txAt * 1000; // seconds → ms
      const isNewPurchase =
        !!nativePurchase ||
        (verified && typeof txAt === 'number' && txAt >= attemptAt - 60000);

      if (isNewPurchase) {
        // Genuine new entitlement → greet and close the paywall. The shared
        // listener has already pushed the new state to the other tabs.
        closePaywallThen(() => {
          if (proWelcomeShownRef.current) return;
          proWelcomeShownRef.current = true;
          Alert.alert('✅ ' + t('purchase_success_title'), t('purchase_success_desc'), okButton);
        });
      } else if (verified || subState.status === 'pro') {
        // The user already owns an active subscription — nothing new was bought.
        // Close the paywall and say so, instead of claiming a (non-existent)
        // purchase. Pro IS still valid until its expiry date even when auto-renew
        // was cancelled, so the Pro UI on the other tabs is correct.
        closePaywallThen(() =>
          Alert.alert(t('already_subscribed_title'), t('already_subscribed_desc'), okButton));
      } else {
        // The sheet flow returned but Apple confirms NOTHING was purchased — do
        // NOT claim success. Say so plainly so the user can retry / restore
        // instead of believing they are Pro while features stay locked.
        // The paywall stays OPEN here, so there is no dismissal to collide with:
        // alerting over a presented modal is fine.
        Alert.alert(t('purchase_incomplete_title'), t('purchase_incomplete_desc'), okButton);
      }
    } catch (error) {
      console.error('[ProfileScreen] Purchase error:', error);
      Alert.alert(t('purchase_failed_title'), t('purchase_failed_desc'), okButton);
    } finally {
      setIsPurchasing(false);
    }
  };

  // ---- Rate the app (jump to App Store review page) ----
  const handleRateApp = async () => {
    const url = APP_STORE_REVIEW_URL;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        // Review deep link unsupported (e.g. TestFlight) → open the product page.
        await Linking.openURL(APP_STORE_URL);
      }
    } catch (e) {
      Alert.alert(t('rate_app'), t('rate_store_unavailable'), okButton);
    }
  };

  // ---- Restore purchases ----
  // Opens Apple's IN-APP subscription management sheet. This is the only way to
  // view/cancel a subscription bought from TestFlight under a real Apple ID
  // ("production sandbox"): such a subscription is invisible in
  // Settings → Subscriptions and cannot be cleared from App Store Connect.
  const handleManageSubscription = async () => {
    console.log('[ProfileScreen] handleManageSubscription clicked');
    try {
      const result = await manageSubscriptions();
      if (!result?.success) {
        console.warn('[ProfileScreen] manageSubscriptions result:', result);
        Alert.alert(
          t('manage_subscription_failed_title'),
          t('manage_subscription_failed_desc'),
          okButton,
        );
      }
    } catch (e) {
      console.warn('[ProfileScreen] manageSubscriptions threw:', e?.message || e);
      Alert.alert(
        t('manage_subscription_failed_title'),
        t('manage_subscription_failed_desc'),
        okButton,
      );
    }
  };

  const handleRestorePurchase = async () => {
    if (isRestoring) return;

    // This handler runs from INSIDE the paywall Modal, so the result can only be
    // shown on the settings screen after that modal is fully gone: the restore
    // overlay lives in the screen tree (below any presented modal), and opening
    // a second modal on top of the paywall is exactly what froze the screen on
    // build 74. closePaywallThen() closes it and waits out the animation.
    const showRestoreResult = (payload) => closePaywallThen(() => setRestoreModal(payload));

    console.log('[ProfileScreen] handleRestorePurchase clicked');
    setIsRestoring(true);
    try {
      console.log('[ProfileScreen] Calling restoreProPurchase...');
      const result = await restoreProPurchase();
      console.log('[ProfileScreen] restoreProPurchase result:', result);

      if (!result.success) {
        // No purchase to restore (or a stale Pro was just revoked) — tell the
        // user via the custom overlay (not a tiny system Alert).
        showRestoreResult({
          tone: 'error',
          icon: '⚠️',
          title: t(result.titleKey || 'restore_failed_title'),
          desc: t(result.messageKey || 'restore_failed_desc'),
        });
      } else {
        // Restore succeeded → greet from here (the shared status listener no
        // longer greets, precisely so a passive reconcile can never pop a
        // "Purchase Successful" alert for an already-subscribed user).
        proWelcomeShownRef.current = true;
        showRestoreResult({
          tone: 'success',
          icon: '✅',
          title: t('purchase_success_title'),
          desc: t('purchase_success_desc'),
        });
      }
      // On success the purchaseUpdatedListener also pushes the new state via
      // subscribeSubscription (closes the paywall + unlocks Pro live).
    } catch (error) {
      console.error('[ProfileScreen] Restore error:', error);
      showRestoreResult({
        tone: 'error',
        icon: '⚠️',
        title: t('restore_failed_title'),
        desc: t('restore_failed_desc'),
      });
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
              Alert.alert(t('dev_reset_done'), undefined, okButton);
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
              Alert.alert(t('dev_reset_done'), undefined, okButton);
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
      Alert.alert('✅ ' + t('welcome_back'), '', okButton);
    } else if (result.error !== 'cancelled') {
      Alert.alert(t('apple_sign_in_failed'), undefined, okButton);
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
            // Hand control back to App.js — signing out must return to the login
            // gate. Without this the user stayed on the tabs with no account and
            // could still drive the paywall, which is what produced the
            // "signed out but told 你已订阅 Pro" confusion.
            if (onSignOut) onSignOut();
          },
        },
      ]
    );
  };

  // ---- Delete Account (Apple Guideline 5.1.1(v)) ----
  // Signing out is NOT enough — apps that create an account must offer an
  // in-app deletion path. Two-step destructive confirm to avoid accidental loss.
  const handleDeleteAccount = () => {
    Alert.alert(
      t('delete_account_title'),
      t('delete_account_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete_account_confirm_action'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('delete_account_title'),
              t('delete_account_confirm_final'),
              [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('delete_account'),
                  style: 'destructive',
                  onPress: async () => {
                    const res = await deleteAppleAccount();
                    setAppleUser(null);
                    // Reset subscription / permission state to fresh (free) so the
                    // UI can't show a stale Pro badge after deletion.
                    try {
                      const subState = await getSubscriptionState();
                      setSubscriptionState(subState);
                      const perms = await getPermissions();
                      setPermissions(perms);
                    } catch (e) {
                      // best-effort
                    }
                    if (res.success) {
                      Alert.alert('✅ ' + t('delete_account_done'), undefined, okButton);
                    }
                    // Hand control back to App.js login gate — deleting the account
                    // must return the app to a first-launch (signed-out) state.
                    if (onSignOut) onSignOut();
                  },
                },
              ]
            );
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
        : (appleUser?.fullName || t('apple_id_label')),
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
              Alert.alert(t('locked'), t('feature_locked_upgrade'), okButton);
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
          onPress={() => {
            // Always open the paywall — an existing subscriber must still be able to
            // REVIEW the plans/pricing and find the subscription-management route.
            // Interception belongs on the PURCHASE ACTION, not on the page entry:
            // the paywall's subscribe button is disabled while Pro is active, and
            // handlePurchase re-checks the live entitlement before ever calling
            // StoreKit. (Blocking the entry instead made Pro users unable to see the
            // paid screen at all — reported as "再也看不到付费界面了".)
            setShowSubscription(true);
          }}
        >
          <View style={styles.favRow}>
            <Text style={[styles.sectionTitle, { color: theme.title, marginBottom: 0 }]}>
              👑 Pro
            </Text>
            <View style={styles.favRight}>
              <Text style={[styles.favCount, { color: theme.primary }]}>
                {subscriptionState.status === 'pro'
                  ? t('subscription_active')
                  : t('upgrade_to_pro')}
              </Text>
              <Text style={[styles.arrow, { color: theme.placeholder }]}>›</Text>
            </View>
          </View>
        </TouchableOpacity>

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
            onPress={() => Alert.alert(t('contact_us'), t('contact_desc'), okButton)}
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
            isLast={!TEST_TOOLS_ENABLED}
            theme={theme}
            onPress={handleRateApp}
            t={t}
          />
          {TEST_TOOLS_ENABLED && (
            <SettingRow
              item={{ id: 'diag', icon: '🩺', titleKey: 'diag_open' }}
              isLast={true}
              theme={theme}
              onPress={() => setShowDiagnostics(true)}
              t={t}
            />
          )}
        </View>

        {/* ===== Version ===== */}
        <Text style={[styles.version, { color: theme.placeholder }]}>
          SocialPost AI v1.0.0
        </Text>

        {/* ===== Apple ID Login ===== */}
        {isAppleAuthAvailable() && (
          <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
            {appleUser ? (
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
                        {appleUser?.email || appleUser?.fullName || t('apple_id_label')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.appleRightGroup}>
                    {/* Plan-state tag — driven by the SAME subscriptionState.status
                        the 👑 Pro row uses, so this row can never disagree with it.
                        It used to fall back to a static "（已订阅）" label that had
                        no relation to the real entitlement, so the row still read
                        "已订阅" after the subscription had lapsed. */}
                    {subscriptionState.status !== 'loading' && (
                      <View
                        style={[
                          styles.planStateTag,
                          {
                            backgroundColor: subscriptionState.status === 'pro'
                              ? theme.primaryLight
                              : (theme.borderLight || theme.border),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.planStateTagText,
                            {
                              color: subscriptionState.status === 'pro'
                                ? theme.primary
                                : theme.subtitle,
                            },
                          ]}
                        >
                          {subscriptionState.status === 'pro'
                            ? t('plan_tag_pro')
                            : subscriptionState.status === 'trial'
                              ? t('plan_tag_trial')
                              : t('plan_tag_free')}
                        </Text>
                      </View>
                    )}
                    <Text style={[styles.appleManageArrow, { color: theme.placeholder }]}>›</Text>
                  </View>
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

                {/* Delete Account row — Apple Guideline 5.1.1(v): apps that create
                    an account MUST offer in-app account deletion (not just sign-out). */}
                <TouchableOpacity
                  style={styles.appleDeleteRow}
                  onPress={handleDeleteAccount}
                  activeOpacity={0.6}
                >
                  <View style={styles.appleDeleteLead}>
                    <Text style={styles.appleDeleteIcon}>⚠️</Text>
                    <Text style={[styles.appleDeleteText, { color: theme.danger || '#E54848' }]}>
                      {t('delete_account')}
                    </Text>
                  </View>
                  <Text style={[styles.appleDeleteArrow, { color: theme.danger || '#E54848' }]}>›</Text>
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
        onRequestClose={closePaywall}
      >
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.subModalCard, { backgroundColor: theme.card }]}>
            {/* Scrollable: the Pro footer (status banner + two action pills) made
                this card taller than the viewport on smaller iPhones. */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: SPACING.xs }}
            >
            <Text style={[styles.modalTitle, { color: theme.title }]}>
              👑 {subscriptionState.status === 'pro' ? t('subscription_active') : t('upgrade_to_pro')}
            </Text>
            <Text style={[styles.modalSubtitle, { color: theme.subtitle }]}>
              {subscriptionState.status === 'pro'
                ? t('already_subscribed_desc')
                : t('go_pro_subtitle')}
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
                        onPress={() => Alert.alert(t('history_info_title'), t('history_info_desc'), okButton)}
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

            {/* ---- Purchase action / Pro status ----
                Previously a DISABLED grey button (theme.border + opacity 0.6 with
                white text) sat here while Pro was active: white-on-light-grey at
                60% opacity was unreadable, and the hint underneath was pulled up
                by a NEGATIVE margin → the two visibly overlapped (reported
                2026-09-16). Now: an explicit green status banner while Pro, and
                the real subscribe button only when a purchase is possible. */}
            {subscriptionState.status === 'pro' ? (
              <View
                style={[
                  styles.proStatusBanner,
                  {
                    backgroundColor: theme.isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.10)',
                    borderColor: theme.success,
                  },
                ]}
              >
                <Text style={[styles.proStatusTitle, { color: theme.success }]}>
                  ✅ {t('subscription_active')}
                </Text>
                <Text style={[styles.proStatusHint, { color: theme.subtitle }]}>
                  {t('subscription_active_hint')}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  // INTERCEPTION POINT: never start a purchase for an entitlement we
                  // already own — StoreKit would resolve WITHOUT a payment sheet and
                  // we'd celebrate a purchase that never happened. handlePurchase also
                  // re-checks the live entitlement (state can be stale), so this guard
                  // is belt-and-braces.
                  if (subscriptionState.status === 'pro') return;
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
            )}

            {/* Secondary actions — outlined pills instead of faint grey text.
                The old labels were 11px in theme.placeholder (#B0B0B8) with no
                padding: nearly invisible and too small to tap reliably. */}
            <TouchableOpacity
              onPress={handleRestorePurchase}
              activeOpacity={0.7}
              style={[styles.paywallSecondaryBtn, { borderColor: theme.primary }]}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <Text style={[styles.paywallSecondaryText, { color: theme.primary }]}>
                  ↻{' '}
                  {t('restore_purchases')}
                </Text>
              )}
            </TouchableOpacity>

            {/* Manage subscription — opens Apple's in-app management sheet.
                Always visible: a "production sandbox" (TestFlight) subscription
                can't be managed from Settings, and the local status may wrongly
                read trial/free while the Apple ID still owns a subscription. */}
            <TouchableOpacity
              onPress={handleManageSubscription}
              activeOpacity={0.7}
              style={[styles.paywallSecondaryBtn, { borderColor: theme.primary }]}
            >
              <Text style={[styles.paywallSecondaryText, { color: theme.primary }]}>
                ⚙️{' '}
                {t('manage_subscription')}
              </Text>
            </TouchableOpacity>

            {/* Cancel button - always visible */}
            <TouchableOpacity
              style={{
                marginTop: 16,
                paddingVertical: 12,
                alignItems: 'center',
              }}
              onPress={closePaywall}
            >
              <Text style={{
                color: '#999',
                fontSize: 16,
                textAlign: 'center',
              }}>
                {t('cancel')}
              </Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== Diagnostics Panel (dev/TestFlight only; hidden in production) ===== */}
      {TEST_TOOLS_ENABLED && (
        <DiagnosticsPanel
          visible={showDiagnostics}
          onClose={() => setShowDiagnostics(false)}
          themeName={themeName}
        />
      )}

      {/* ===== Restore Result Overlay (custom, eye-catching) =====
          Deliberately an in-screen overlay and NOT a <Modal>: restore is
          triggered from inside the paywall Modal, and stacking a second native
          modal on top of it left a stuck modal host that froze this whole
          screen (build 74 — Settings could not scroll or be tapped while the
          tab bar still worked). An absolutely-positioned View has no
          presentation lifecycle that can break. The paywall is closed first in
          handleRestorePurchase(), otherwise this would sit underneath it. */}
      {restoreModal ? (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            styles.restoreModalOverlay,
            { backgroundColor: theme.overlay, zIndex: 900 },
          ]}
        >
          <View style={[styles.restoreModalCard, { backgroundColor: theme.card }]}>
            {restoreModal.icon ? (
              <View
                style={[
                  styles.restoreIconCircle,
                  {
                    backgroundColor:
                      restoreModal.tone === 'success'
                        ? theme.success
                        : restoreModal.tone === 'error'
                        ? theme.danger
                        : theme.primary,
                  },
                ]}
              >
                <Text style={styles.restoreIconEmoji}>{restoreModal.icon}</Text>
              </View>
            ) : null}
            <Text style={[styles.restoreTitle, { color: theme.title }]}>
              {restoreModal.title}
            </Text>
            <Text style={[styles.restoreDesc, { color: theme.subtitle }]}>
              {restoreModal.desc}
            </Text>
            <TouchableOpacity
              style={[styles.restoreButton, { backgroundColor: theme.primary }]}
              onPress={() => setRestoreModal(null)}
            >
              <Text style={styles.restoreButtonText}>{t('got_it')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

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
    // Cap the height and let the inner ScrollView take over: with the Pro status
    // banner + two action pills the card is taller than a small iPhone viewport,
    // and a centered overlay would clip both ends (2026-09-16).
    maxHeight: '90%',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.float,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  restoreModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  restoreModalCard: {
    // Deliberately large: this is the only feedback for a restore attempt, and
    // the previous 90%/360 card still read as "too small" on device. Bump to
    // 92% / 420 with a min-height so it fills the screen centre convincingly.
    width: '92%',
    maxWidth: 420,
    minHeight: 300,
    borderRadius: 28,
    paddingVertical: 40,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.float,
  },
  restoreIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
  },
  restoreIconEmoji: {
    fontSize: 46,
  },
  restoreTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  restoreDesc: {
    fontSize: 16.5,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 30,
  },
  restoreButton: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  restoreButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
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
  // ---- Paywall: Pro status banner + secondary action pills ----
  // Replaced the old restoreRow/restoreText pair (11px, theme.placeholder, no
  // padding) — those were nearly invisible AND got pulled into the disabled
  // button above by a negative margin, so the text visibly overlapped.
  proStatusBanner: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  proStatusTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  proStatusHint: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  paywallSecondaryBtn: {
    marginTop: SPACING.md,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paywallSecondaryText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
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
  appleRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planStateTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginRight: SPACING.xs,
  },
  planStateTagText: {
    fontSize: 12,
    fontWeight: '700',
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
  appleDeleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(229,72,72,0.12)',
  },
  appleDeleteLead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appleDeleteIcon: {
    fontSize: 18,
    marginRight: SPACING.sm,
  },
  appleDeleteText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
  },
  appleDeleteArrow: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
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

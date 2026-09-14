// ============================================================
// Subscription Manager — Trial / Free / Pro logic
// Centralized subscription state for all screens
// Uses AsyncStorage via storage.js helpers
// ============================================================

import {
  getInstallDate,
  saveInstallDate,
  getSubscriptionStatus,
  saveSubscriptionStatus,
  getDailyUsage,
  saveDailyUsage,
  getUserProfile,
  saveUserProfile,
} from './storage';
import {
  initIAP,
  setPurchaseCallbacks,
  fetchProducts,
  purchaseSubscription,
  restorePurchases,
  getCachedReceipt,
  clearCachedReceipt,
  isIAPAvailable,
  cleanupIAP,
  PRODUCT_IDS,
  resolveProductId,
  isMonthlyProduct,
  isAnnualProduct,
  syncEntitlement,
  getLastEntitlementResult,
  getStoreKitMode,
  isUserCancelled,
} from '../services/IAPService';

// Re-exported so screens can branch on "the user dismissed Apple's sheet"
// without importing the service directly — and without re-hardcoding the
// E_USER_CANCELLED spelling (the one-L typo that caused a false
// "购买失败 PRODUCT_NOT_FOUND" alert on a plain cancel).
export { isUserCancelled };

// ---- Constants ----

// ============================================================
// Reactive subscription change notifications
// ------------------------------------------------------------
// Screens hold their own local `subscriptionState`, so they never re-render
// when Pro is unlocked mid-session (e.g. right after a purchase). A tiny
// listener set lets the purchase/restore success path push the new state to
// every interested screen at once — closing the paywall, showing the welcome
// alert, and unlocking Pro features live.
// ============================================================
const subscriptionListeners = new Set();

/**
 * Subscribe to subscription-state changes (purchase / restore / sign-out).
 * @param {(state: object) => void} listener
 * @returns {() => void} unsubscribe function
 */
export function subscribeSubscription(listener) {
  subscriptionListeners.add(listener);
  return () => subscriptionListeners.delete(listener);
}

function notifySubscriptionChanged() {
  getSubscriptionState()
    .then((state) => {
      subscriptionListeners.forEach((l) => {
        try { l(state); } catch (e) { console.error('[Subscription] listener error', e); }
      });
    })
    .catch((e) => console.error('[Subscription] notify failed', e));
}

const TRIAL_DAYS = 7;
const FREE_DAILY_LIMIT = 3;

// ---- Trending topics pool (rotate by day of year) ----
// All hashtags are in English per project requirement: default UI language is English.
// Users can still generate copy in Chinese if they select Chinese as output language.
const TRENDING_TOPICS_POOL = [
  ['#AICreation', '#DigitalMarketing', '#ShortVideoTips'],
  ['#SummerFashion', '#TravelVibes', '#FoodieLife'],
  ['#CareerGrowth', '#SideHustle', '#SelfDiscipline'],
  ['#FitnessJourney', '#SkincareRoutine', '#BookNotes'],
  ['#TechGadgets', '#HomeDecor', '#PetLife'],
  ['#ParentingTips', '#StudyHacks', '#ProductPicks'],
  ['#PhotographyTips', '#MusicLovers', '#DIYProjects'],
];

// ---- Helper: get today's date string ----

function getTodayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ---- Helper: days between two date strings ----

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const diffMs = Math.abs(d2 - d1);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ---- Core functions ----

/**
 * Initialize subscription on first app launch.
 * Records installDate if not set, sets default status to 'trial'.
 */
export async function initSubscription() {
  try {
    const installDate = await getInstallDate();
    if (!installDate) {
      const today = getTodayStr();
      await saveInstallDate(today);
      console.log('[Subscription] First launch — installDate set to', today);
    }

    const status = await getSubscriptionStatus();
    if (!status) {
      await saveSubscriptionStatus('trial');
      console.log('[Subscription] Default status set to trial');
    }
  } catch (error) {
    console.error('[Subscription] Init failed:', error);
  }
}

/**
 * Get the full subscription state object.
 * @returns {Promise<{status: string, trialDaysLeft: number, dailyCount: number, dailyLimit: number, installDate: string}>}
 */
export async function getSubscriptionState() {

  try {
    const status = await getSubscriptionStatus();
    const installDate = await getInstallDate() || getTodayStr();

    // If Pro, return unlimited
    if (status === 'pro') {
      return {
        status: 'pro',
        trialDaysLeft: 0,
        dailyCount: 0,
        dailyLimit: 999,
        installDate,
      };
    }

    // Calculate trial days left
    const today = getTodayStr();
    const daysSinceInstall = daysBetween(installDate, today);
    const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSinceInstall);

    // If still in trial period
    if (trialDaysLeft > 0) {
      return {
        status: 'trial',
        trialDaysLeft,
        dailyCount: 0,
        dailyLimit: 999, // unlimited during trial
        installDate,
      };
    }

    // Free tier (trial expired)
    const usage = await getDailyUsage();
    let dailyCount = usage.count || 0;

    // Reset count if date changed
    if (usage.date !== today) {
      dailyCount = 0;
    }

    return {
      status: 'free',
      trialDaysLeft: 0,
      dailyCount,
      dailyLimit: FREE_DAILY_LIMIT,
      installDate,
    };
  } catch (error) {
    console.error('[Subscription] getSubscriptionState failed:', error);
    return {
      status: 'trial',
      trialDaysLeft: TRIAL_DAYS,
      dailyCount: 0,
      dailyLimit: 999,
      installDate: getTodayStr(),
    };
  }
}

/**
 * Increment daily usage count. Auto-resets if date changed.
 * @returns {Promise<{dailyCount: number, dailyLimit: number}>}
 */
export async function incrementDailyUsage() {
  try {
    const state = await getSubscriptionState();

    // Trial and Pro: no limit, no tracking needed
    if (state.status !== 'free') {
      return { dailyCount: state.dailyCount, dailyLimit: state.dailyLimit };
    }

    const today = getTodayStr();
    const usage = await getDailyUsage();
    let newCount;

    if (usage.date !== today) {
      // New day — reset
      newCount = 1;
    } else {
      newCount = (usage.count || 0) + 1;
    }

    await saveDailyUsage({ date: today, count: newCount });

    return { dailyCount: newCount, dailyLimit: FREE_DAILY_LIMIT };
  } catch (error) {
    console.error('[Subscription] incrementDailyUsage failed:', error);
    return { dailyCount: 0, dailyLimit: FREE_DAILY_LIMIT };
  }
}

/**
 * Get remaining generation count for today.
 * Trial/Pro = 999 (unlimited), Free = max(0, 3 - dailyCount)
 */
export async function getRemainingCount() {
  const state = await getSubscriptionState();
  if (state.status !== 'free') return 999;
  return Math.max(0, state.dailyLimit - state.dailyCount);
}

/**
 * Quick check: is the user a Pro subscriber?
 */
export async function isProUser() {
  const status = await getSubscriptionStatus();
  return status === 'pro';
}

/**
 * Quick check: is the user still in trial period?
 */
export async function isTrialUser() {
  const state = await getSubscriptionState();
  return state.status === 'trial';
}

/**
 * Get trial days remaining.
 */
export async function getTrialDaysLeft() {
  const state = await getSubscriptionState();
  return state.trialDaysLeft;
}

/**
 * [DEV / TEST] Reset today's free generation count to 0.
 * Used during QA so the 3/day free quota can be recovered without
 * waiting for the date to roll over.
 * @returns {Promise<{dailyCount: number, dailyLimit: number}>}
 */
export async function resetDailyUsage() {
  const today = getTodayStr();
  await saveDailyUsage({ date: today, count: 0 });
  return { dailyCount: 0, dailyLimit: FREE_DAILY_LIMIT };
}

/**
 * [DEV / TEST] Reset to a fresh 7-day trial (unlimited generations).
 * Used during QA to re-test the trial → paywall flow from a clean state.
 * @returns {Promise<object>} Full subscription state
 */
export async function resetTrialForTesting() {
  const today = getTodayStr();
  await saveInstallDate(today);
  await saveSubscriptionStatus('trial');
  await saveDailyUsage({ date: today, count: 0 });
  return getSubscriptionState();
}

/**
 * Set Pro status (called after successful purchase).
 * @param {boolean} isPro
 */
export async function setProStatus(isPro) {
  await saveSubscriptionStatus(isPro ? 'pro' : 'free');
  console.log('[Subscription] Status set to', isPro ? 'pro' : 'free');
}

/**
 * Get trending topics based on day of year rotation.
 * @returns {string[]} Array of 3 hashtag strings
 */
export function getTrendingTopics() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const index = dayOfYear % TRENDING_TOPICS_POOL.length;
  return TRENDING_TOPICS_POOL[index];
}

/**
 * Get user profile (avatar + username).
 * @returns {Promise<{avatarUri: string, username: string}>}
 */
export async function loadUserProfile() {
  return getUserProfile();
}

/**
 * Save user profile fields.
 * @param {{avatarUri?: string, username?: string}} profile
 */
export async function updateUserProfile(profile) {
  return saveUserProfile(profile);
}

// ============================================================
// IAP Integration — In-App Purchase functions
// ============================================================

/**
 * Initialize IAP and register purchase callbacks.
 * Called on app launch alongside initSubscription.
 */
export async function initIAPIntegration() {
  try {
    // Check if IAP is available (requires Development Build, not Expo Go)
    if (!isIAPAvailable()) {
      console.log('[Subscription] IAP not available (Expo Go mode)');
      return;
    }

    // Register callbacks for purchase events
    setPurchaseCallbacks(
      // On purchase success — unlock Pro
      async (purchaseData) => {
        console.log('[Subscription] Purchase success callback:', purchaseData.productId);
        await saveSubscriptionStatus('pro');
        await saveUserProfile({ isPro: true, purchaseDate: purchaseData.purchaseDate });
        console.log('[Subscription] Pro unlocked via IAP');
        // Push the new state to every subscribed screen so the paywall closes
        // and Pro features unlock immediately (no fragile setTimeout poll).
        notifySubscriptionChanged();
      },
      // On purchase error — log only
      (error) => {
        console.error('[Subscription] Purchase error callback:', error.code, error.message);
      }
    );

    // Initialize IAP connection
    await initIAP();
    console.log('[Subscription] IAP integration initialized');

    // Reconcile once, silently, the first time the app touches StoreKit.
    //
    // Rationale: the Pro flag lives in AsyncStorage and used to be written ONLY
    // by the purchase listener. So a subscription bought earlier — on another
    // device, before a reinstall, or in a session where the unlock failed — left
    // the user staring at "升级到 Pro" while Apple already had their money.
    // Asking StoreKit what they own fixes that at the source.
    //
    // Guarded to StoreKit 2 on purpose: on Sk2 this reads
    // `Transaction.currentEntitlements` (local query, no prompt, no sheet). On
    // Sk1 the same call goes through `restoreCompletedTransactions()`, which is
    // the call that can throw a native exception on iOS 26 — so we never fire it
    // unprompted there.
    try {
      if (getStoreKitMode().mode === 'sk2') {
        const found = await syncEntitlement('init');
        console.log('[Subscription] Entitlement reconciliation on init:',
          found ? found.productId : 'none found');
      }
    } catch (e) {
      console.warn('[Subscription] Entitlement reconciliation failed (ignored):', e?.message || e);
    }
  } catch (error) {
    console.error('[Subscription] IAP init failed:', error);
  }
}

/**
 * Load product information from StoreKit / Google Play.
 * Returns real prices and titles to replace hardcoded values.
 * @returns {Promise<Array>} Array of product objects
 */
export async function loadProductInfo() {
  try {
    if (!isIAPAvailable()) {
      console.log('[Subscription] IAP not available, returning fallback prices');
      return getFallbackProducts();
    }

    const products = await fetchProducts();

    if (products.length === 0) {
      console.warn('[Subscription] No products returned, using fallback');
      return getFallbackProducts();
    }

    return products;
  } catch (error) {
    console.error('[Subscription] Load product info failed:', error);
    return getFallbackProducts();
  }
}

/**
 * Fallback product data when IAP is not available (Expo Go).
 */
function getFallbackProducts() {
  return [
    {
      productId: PRODUCT_IDS.MONTHLY,
      title: 'SocialPost AI Monthly',
      description: 'Unlimited AI copy generation',
      price: '$5.99',
      localizedPrice: '$5.99',
      currency: 'USD',
      priceValue: 5.99,
      isFallback: true,
    },
    {
      productId: PRODUCT_IDS.ANNUAL,
      title: 'SocialPost AI Annual',
      description: 'Unlimited AI copy generation — Best Value',
      price: '$49.99',
      localizedPrice: '$49.99',
      currency: 'USD',
      priceValue: 49.99,
      isFallback: true,
    },
  ];
}

/**
 * Initiate a Pro subscription purchase.
 * @param {string} productId - 'com.seal023.socialpostai.monthly' or 'com.seal023.socialpostai.annual'
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function purchasePro(productId) {
  try {
    if (!isIAPAvailable()) {
      console.warn('[Subscription] IAP NOT available — returning IAP_NOT_AVAILABLE');
      return {
        success: false,
        error: 'IAP_NOT_AVAILABLE',
        message: 'In-app purchases require a Development Build with react-native-iap linked.',
      };
    }

    console.log('[Subscription] Starting purchase for productId:', productId, '| monthly?', isMonthlyProduct(productId), '| annual?', isAnnualProduct(productId));
    // ASC may expose the .v2-suffixed SKU; resolve to whatever StoreKit returned
    // so the Apple sheet actually opens (getSubscriptions filters by exact id).
    const realSku = resolveProductId(productId);
    console.log('[Subscription] Resolved to real SKU:', realSku);
    await purchaseSubscription(realSku);

    // Purchase result is delivered asynchronously via callback
    // The caller should listen for state changes
    return { success: true };
  } catch (error) {
    console.error('[Subscription] Purchase failed:', error);
    return {
      success: false,
      error: error.code || 'PURCHASE_FAILED',
      message: error.message || 'Purchase failed',
    };
  }
}

/**
 * Restore previous purchases.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function restoreProPurchase() {
  try {
    if (!isIAPAvailable()) {
      return {
        success: false,
        message: 'IAP not available in Expo Go',
      };
    }

    const restored = await restorePurchases();

    if (restored) {
      // Verify cached receipt on next state load
      // Push the new state to subscribed screens (the paywall closes, Pro unlocks).
      notifySubscriptionChanged();
      return {
        success: true,
        message: 'Subscription restored successfully',
      };
    }

    return {
      success: false,
      message: 'No active subscription found to restore',
    };
  } catch (error) {
    console.error('[Subscription] Restore failed:', error);
    return {
      success: false,
      message: error.message || 'Restore failed',
    };
  }
}

/**
 * Verify subscription status on app launch.
 * Checks cached receipt and validates with StoreKit.
 */
export async function verifySubscriptionOnLaunch() {
  try {
    const status = await getSubscriptionStatus();
    if (status !== 'pro') return;

    // "Pro but no cached receipt" must NOT silently downgrade the user. The
    // receipt cache can legitimately be empty (reinstall, cleared storage,
    // AsyncStorage hiccup) while the subscription itself is perfectly valid —
    // the old code turned that into an instant downgrade to free.
    // Ask StoreKit instead, and only downgrade on a POSITIVE "owns nothing"
    // answer — never on a native/network error.
    const cached = await getCachedReceipt();
    if (cached) {
      console.log('[Subscription] Pro status verified with cached receipt');
      return;
    }

    console.warn('[Subscription] Pro status without a cached receipt — asking StoreKit…');
    const found = await syncEntitlement('verify-on-launch');
    if (found) {
      console.log('[Subscription] Pro status verified against StoreKit:', found.productId);
      return;
    }

    const last = getLastEntitlementResult();
    if (last && last.stage === 'no-entitlement') {
      console.warn('[Subscription] StoreKit reports no entitlement — downgrading to free');
      await saveSubscriptionStatus('free');
    } else {
      console.warn('[Subscription] Entitlement check inconclusive — keeping Pro:', last?.stage);
    }
  } catch (error) {
    console.error('[Subscription] Verify on launch failed:', error);
  }
}

/**
 * Reconcile Pro state with StoreKit. Safe to call when the paywall opens or
 * after a failed purchase — it will not prompt the user on StoreKit 2.
 * @param {string} reason - diagnostics label
 * @returns {Promise<boolean>} true if the user currently owns a subscription
 */
export async function syncProEntitlement(reason = 'paywall') {
  try {
    if (!isIAPAvailable()) return await isProUser();
    // On StoreKit 1, getAvailablePurchases() calls restoreCompletedTransactions(),
    // which pops an Apple-ID login sheet. A passive reconcile (paywall focus) must
    // never do that, so only run the native reconciliation on StoreKit 2 — where
    // it reads Transaction.currentEntitlements locally with no prompt. On Sk1 we
    // keep the locally-stored status (the purchase/restore flows handle Sk1).
    const mode = getStoreKitMode().mode;
    if (mode === 'sk2') {
      const found = await syncEntitlement(reason);
      if (found) return true;
    }
    // No entitlement found (or Sk1 / the check errored) — fall back to whatever
    // we already had locally rather than downgrading the user.
    return await isProUser();
  } catch (e) {
    console.error('[Subscription] syncProEntitlement failed:', e);
    return await isProUser();
  }
}

/**
 * Cancel / expire subscription.
 * Called when subscription is detected as expired.
 */
export async function expireSubscription() {
  await saveSubscriptionStatus('free');
  await clearCachedReceipt();
  console.log('[Subscription] Subscription expired, downgraded to free');
}

/**
 * Clean up IAP resources.
 * Call on app unmount.
 */
export function cleanupIAPResources() {
  cleanupIAP();
}

/**
 * Export product IDs for UI use.
 */
export { PRODUCT_IDS };

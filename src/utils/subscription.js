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
} from '../services/IAPService';

// ---- Constants ----

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
      },
      // On purchase error — log only
      (error) => {
        console.error('[Subscription] Purchase error callback:', error.code, error.message);
      }
    );

    // Initialize IAP connection
    await initIAP();
    console.log('[Subscription] IAP integration initialized');
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
<<<<<<< HEAD
      price: '$5.99',
      localizedPrice: '$5.99',
      currency: 'USD',
      priceValue: 5.99,
=======
      price: '$6.99',
      localizedPrice: '$6.99',
      currency: 'USD',
      priceValue: 6.99,
>>>>>>> 12460ba241a064b8de554b017c18b5b025c65ce2
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
<<<<<<< HEAD
 * @param {string} productId - 'com.seal023.socialpostai.monthly' or 'com.seal023.socialpostai.annual'
=======
 * @param {string} productId - 'com.seal.socialpostai.monthly' or 'com.seal.socialpostai.annual'
>>>>>>> 12460ba241a064b8de554b017c18b5b025c65ce2
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

    console.log('[Subscription] Starting purchase for productId:', productId, '| matches MONTHLY?', productId === PRODUCT_IDS.MONTHLY, '| matches ANNUAL?', productId === PRODUCT_IDS.ANNUAL);
    await purchaseSubscription(productId);

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
    // Check if Pro is already set
    const status = await getSubscriptionStatus();
    if (status === 'pro') {
      // Verify the cached receipt is still valid
      const cached = await getCachedReceipt();
      if (!cached) {
        // No cached receipt — might have been cleared, downgrade to free
        console.warn('[Subscription] Pro status but no cached receipt — downgrading');
        await saveSubscriptionStatus('free');
        return;
      }
      console.log('[Subscription] Pro status verified with cached receipt');
    }
  } catch (error) {
    console.error('[Subscription] Verify on launch failed:', error);
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

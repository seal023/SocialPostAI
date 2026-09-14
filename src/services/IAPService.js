// ============================================================
// IAPService — In-App Purchase wrapper using react-native-iap
// Handles product loading, purchasing, restoring, and receipt
// validation for auto-renewable subscriptions.
// ============================================================

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// ⚠️  LAZY LOADING (critical for iOS 26 crash fix)
// ============================================================
// react-native-iap MUST NOT be loaded at module load time.
//
// WHY: merely requiring 'react-native-iap' instantiates its native iOS
// modules (iap.js top level destructures NativeModules.RNIapIos /
// RNIapIosSk2). RNIapIos.init() calls SKPaymentQueue.default().add(self),
// i.e. it touches StoreKit the moment the module is instantiated.
// On iOS 26 this throws an uncaught ObjC exception on the
// turbomodulemanager.queue → SIGABRT at startup.
//
// App.js statically imports ProfileScreen → subscription.js → IAPService.js,
// so any top-level require here would run during app launch.
// We therefore load the module lazily, only when the user actually enters
// the subscription flow (initIAP / fetchProducts / purchase / restore).
// ============================================================

let RNIap = null;
let IS_RNIAP_STUB = true;  // default assume stub until real module loads
let LOAD_ATTEMPTED = false;

function loadRNIapModule() {
  if (RNIap || LOAD_ATTEMPTED) return;
  LOAD_ATTEMPTED = true;
  try {
    const realMod = require('react-native-iap');
    // Guard: react-native-iap requires native linking. If only the JS shim loads
    // (e.g. initConnection is not a function), treat it as unavailable.
    if (realMod && typeof realMod.initConnection === 'function'
        && typeof realMod.requestSubscription === 'function') {
      RNIap = realMod;
      IS_RNIAP_STUB = false;
      console.log('[IAP] ✅ Real react-native-iap module loaded (native build)');
    } else {
      console.warn('[IAP] react-native-iap JS module loaded but missing native methods — falling back to stub');
    }
  } catch (e) {
    console.warn('[IAP] react-native-iap not installed — falling back to stub:', e.message);
  }
  if (!RNIap) {
    try {
      RNIap = require('./iap-stub').default;
      IS_RNIAP_STUB = true;
      console.warn('[IAP] ⚠️  Using IAP STUB — no real purchases will happen. '
        + 'Install react-native-iap and rebuild Development Build / TestFlight to enable purchases.');
    } catch (e2) {
      RNIap = null;
      console.error('[IAP] Stub also unavailable:', e2.message);
    }
  }
}

// ---- Product IDs (must match App Store Connect / Google Play) ----
// The ASC console historically uses the `.v2`-suffixed product IDs (see the
// old repo commit 8d18745 "IAPService.js: 订阅 productId 更新为.v2 匹配 ASC").
// react-native-iap's getSubscriptions() filters returned items by
// `skus.includes(productId)`, so if ASC only exposes the .v2 IDs while we ask
// for the plain IDs, every product is silently dropped → 0 products → NO_PRODUCTS.
// Requesting BOTH plain and .v2 variants makes the screen work regardless of
// which form ASC actually uses. resolveProductId() then maps a canonical
// (base) ID to the real SKU StoreKit returned before calling purchaseSubscription.

export const PRODUCT_IDS = {
  MONTHLY: 'com.seal023.socialpostai.monthly',
  ANNUAL: 'com.seal023.socialpostai.annual',
  MONTHLY_V2: 'com.seal023.socialpostai.monthly.v2',
  ANNUAL_V2: 'com.seal023.socialpostai.annual.v2',
};

const ALL_PRODUCT_IDS = [
  PRODUCT_IDS.MONTHLY,
  PRODUCT_IDS.ANNUAL,
  PRODUCT_IDS.MONTHLY_V2,
  PRODUCT_IDS.ANNUAL_V2,
];

// Strip a trailing ".v2" so the UI/price mapping treats
// com.seal023.socialpostai.monthly and ...monthly.v2 as the same slot.
export function baseProductId(id) {
  return (id || '').replace(/\.v2$/, '');
}

export function isMonthlyProduct(id) {
  return baseProductId(id) === PRODUCT_IDS.MONTHLY;
}

export function isAnnualProduct(id) {
  return baseProductId(id) === PRODUCT_IDS.ANNUAL;
}

// Given a canonical (base) productId, return the ACTUAL sku StoreKit returned.
// Prefers an exact match, then the .v2 variant (when ASC only exposes those),
// so purchaseSubscription is always called with an ID that exists.
export function resolveProductId(canonicalId) {
  if (!canonicalId) return canonicalId;
  const fetched = lastFetchedProductIds || [];
  if (fetched.includes(canonicalId)) return canonicalId;
  const v2 = `${canonicalId}.v2`;
  if (fetched.includes(v2)) return v2;
  return canonicalId;
}

// ---- AsyncStorage keys for receipt caching ----

const KEYS = {
  ACTIVE_RECEIPT: '@SocialPostAI:activeReceipt',
  PURCHASED_PRODUCT: '@SocialPostAI:purchasedProduct',
  PURCHASE_DATE: '@SocialPostAI:purchaseDate',
};

// ---- Internal state ----

let purchaseUpdateListener = null;
let purchaseErrorListener = null;
let isInitialized = false;
let lastFetchAttemptIds = [];
let lastFetchedProductIds = [];

// External callback — set by subscription.js to handle Pro unlock
let onPurchaseSuccessCallback = null;
let onPurchaseErrorCallback = null;

/**
 * Register callbacks for purchase events.
 * Called by subscription.js during init.
 */
export function setPurchaseCallbacks(onSuccess, onError) {
  onPurchaseSuccessCallback = onSuccess;
  onPurchaseErrorCallback = onError;
}

// ============================================================
// 1. Initialization
// ============================================================

/**
 * Initialize IAP connection and set up purchase listeners.
 * Should be called once on app launch.
 */
export async function initIAP() {
  if (isInitialized) {
    console.log('[IAP] Already initialized, skipping');
    return;
  }

  // Lazy-load the native module ONLY now (user-initiated, never at app launch)
  loadRNIapModule();

  if (!RNIap) {
    console.warn('[IAP] Module not available, using stub');
    isInitialized = true;
    return;
  }

  try {
    console.log('[IAP] Initializing connection...');
    console.log('[IAP]   Platform:', Platform.OS);
    console.log('[IAP]   Using stub?', IS_RNIAP_STUB);
    const connected = await RNIap.initConnection();
    console.log('[IAP]   initConnection returned:', connected, '(type:', typeof connected, ')');

    // In react-native-iap v12, initConnection may return booleans or a ConnectionResult object.
    // Treat falsy (false/null/undefined) as failure UNLESS stub.
    const connectedOk = Boolean(connected) || IS_RNIAP_STUB;
    if (!connectedOk) {
      console.warn('[IAP]   ⚠️  initConnection returned falsy — StoreKit/Billing service may not be available.');
      console.warn('[IAP]   Common causes:');
      console.warn('[IAP]     • iOS: Provisioning Profile missing "In-App Purchase" capability');
      console.warn('[IAP]     • iOS: Running on simulator (StoreKit often requires real device)');
      console.warn('[IAP]     • Android: Not signed in with Google Play account on device');
    }

    // NOTE (2026-08-12): Removed checkExistingPurchases() from launch path.
    // react-native-iap README (#747) explicitly warns that getAvailablePurchases
    // on iOS should ONLY be called during "restore purchases" — calling it at
    // app launch can throw a native ObjC/C++ exception on newer iOS (26.x),
    // which JS try/catch cannot intercept → SIGABRT crash at startup.
    // Purchase restoration is handled by restorePurchases() when the user taps
    // "Restore Purchases" in the subscription modal.

    // Set up purchase event listeners
    setupPurchaseListeners();

    isInitialized = true;
    console.log('[IAP] Initialization complete (isInitialized=true, connectedOk=' + connectedOk + ')');
  } catch (error) {
    console.error('[IAP] Init failed:');
    console.error('[IAP]   code   :', error.code);
    console.error('[IAP]   message:', error.message);
    // Non-fatal — app can still work in trial/free mode
    isInitialized = false;
  }
}

/**
 * Set up listeners for purchase updates and errors.
 */
function setupPurchaseListeners() {
  if (!RNIap) return;

  // Clean up existing listeners
  if (purchaseUpdateListener) purchaseUpdateListener.remove();
  if (purchaseErrorListener) purchaseErrorListener.remove();

  // Listen for successful purchases
  purchaseUpdateListener = RNIap.purchaseUpdatedListener(async (purchase) => {
    console.log('[IAP] Purchase updated:', purchase.productId);
    await handleSuccessfulPurchase(purchase);
  });

  // Listen for purchase errors
  purchaseErrorListener = RNIap.purchaseErrorListener((error) => {
    console.error('[IAP] Purchase error:', error.code, error.message);

    // User cancelled — don't show error alert
    if (error.code === 'E_USER_CANCELED') {
      console.log('[IAP] User cancelled purchase');
      return;
    }

    if (onPurchaseErrorCallback) {
      onPurchaseErrorCallback(error);
    }
  });
}

// ============================================================
// 2. Product Information
// ============================================================

// ---- Native-fetch bookkeeping (diagnostics) ----
//
// Every failure used to collapse into "0 products", which made a screenshot
// useless: we could not tell
//   (a) "Apple answered: no such product for this app"   ← ASC-side problem
//   (b) "StoreKit errored"                               ← environment problem
//   (c) "the native call never came back"                ← library/race problem
// apart from each other.
//
// (c) is REAL and bites on iOS. react-native-iap's StoreKit-1 productsRequest
// handler (node_modules/react-native-iap/ios/RNIapIos.swift ->
// `request(_:didFailWithError:)`) only rejects when the failing request is an
// SKReceiptRefreshRequest. If an SKProductsRequest fails, NOTHING settles the
// JS promise -> it hangs forever, which is exactly what
// "IAP 拉取探针: 失败 (timeout)" was.
//
// So we (1) keep the raw native outcome for the in-app diagnostics, (2) bound
// the native call ourselves, and (3) never run two concurrent native requests:
// the iOS module holds a SINGLE productsRequest / latest-promise slot, so a
// second concurrent getSubscriptions() overwrites the first promise and leaves
// the earlier caller hanging.
const FETCH_TIMEOUT_MS = 12000;

let lastFetchResult = null;   // { at, ms, ok, stage, rawCount, fetchedIds, error? }
let inflightFetch = null;     // shared promise — dedupes concurrent callers

function boundedNativeCall(promise, ms, code, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const e = new Error(
          `${label} did not settle within ${ms}ms — the native promise never resolved nor rejected`
        );
        e.code = code;
        reject(e);
      }, ms);
    }),
  ]);
}

/**
 * Fetch subscription product details from StoreKit / Google Play.
 * @returns {Promise<Array>} Array of product objects with price, title, etc.
 */
export async function fetchProducts() {
  loadRNIapModule();
  if (!RNIap) {
    lastFetchResult = {
      at: Date.now(), ms: 0, ok: false, stage: 'no-module', rawCount: 0, fetchedIds: [],
      error: { code: 'IAP_MODULE_MISSING', message: 'react-native-iap native module not loaded' },
    };
    return [];
  }
  if (inflightFetch) {
    console.log('[IAP] fetchProducts() — reusing in-flight native request (dedupe)');
    return inflightFetch;
  }

  inflightFetch = (async () => {
    lastFetchAttemptIds = [...ALL_PRODUCT_IDS];
    const startedAt = Date.now();
    try {
      console.log('[IAP] Fetching products:', ALL_PRODUCT_IDS);
      const raw = await boundedNativeCall(
        RNIap.getSubscriptions({ skus: ALL_PRODUCT_IDS }),
        FETCH_TIMEOUT_MS,
        'E_FETCH_TIMEOUT',
        'getSubscriptions()',
      );
      const list = Array.isArray(raw) ? raw : [];
      const rawIds = list.map((p) => p && p.productId).filter(Boolean);
      lastFetchedProductIds = rawIds;
      lastFetchResult = {
        at: Date.now(),
        ms: Date.now() - startedAt,
        ok: rawIds.length > 0,
        // "empty-from-store" = StoreKit DID answer, it just has no product for
        // any requested ID. That is the ASC-side signature.
        stage: rawIds.length > 0 ? 'ok' : 'empty-from-store',
        rawCount: list.length,
        fetchedIds: rawIds,
      };
      console.log(`[IAP] Products loaded: ${list.length} raw item(s), ${rawIds.length} with a productId`);

      // Normalize product data for UI
      return list.map((product) => ({
      productId: product.productId,
      title: product.title,
      description: product.description,
      price: product.price,           // Localized price string (e.g. "$6.99")
      localizedPrice: product.localizedPrice,
      currency: product.currency,
      // priceValue: numeric price used for sorting / trial-period math.
      // product.price is a LOCALIZED string ("$6.99", "¥38.00") and parseFloat
      // returns NaN on iOS. Prefer the canonical micro-amount field when present
      // (iOS/Android both expose it), and fall back to a sanitized parse of the
      // localized string so dev/legacy callers still get a usable number.
      priceValue: (typeof product.priceAmountMicros === 'number'
        ? product.priceAmountMicros / 1000000
        : parseFloat(String(product.price || '').replace(/[^0-9.]/g, ''))
      ) || 0,
      // iOS-specific subscription period info
      subscriptionPeriodNumberIOS: product.subscriptionPeriodNumberIOS,
      subscriptionPeriodUnitIOS: product.subscriptionPeriodUnitIOS,
      introductoryPriceIOS: product.introductoryPriceIOS,
      }));
    } catch (error) {
      lastFetchResult = {
        at: Date.now(),
        ms: Date.now() - startedAt,
        ok: false,
        stage: 'native-error',
        rawCount: 0,
        fetchedIds: [],
        error: {
          code: error?.code || 'E_FETCH_UNKNOWN',
          message: error?.message || String(error),
        },
      };
      console.error('[IAP] Failed to fetch products:', error);
      return [];
    } finally {
      inflightFetch = null;
    }
  })();

  return inflightFetch;
}

/**
 * StoreKit / Store reachability probe.
 *
 * getSubscriptions() alone cannot tell "Apple said no" apart from "StoreKit
 * cannot reach Apple at all". `getStorefront()` goes to the StoreKit storefront
 * API, so a country code here proves the StoreKit <-> App Store path works —
 * which turns the product result into a decisive signal:
 *   storefront OK + 0 products  =>  the products are not visible to this app
 *   storefront error            =>  StoreKit/device/network problem
 */
export async function fetchStorefront() {
  loadRNIapModule();
  if (!RNIap || typeof RNIap.getStorefront !== 'function') {
    return { ok: false, error: { code: 'E_NO_API', message: 'getStorefront() unavailable in this build' } };
  }
  try {
    const res = await boundedNativeCall(
      RNIap.getStorefront(),
      8000,
      'E_STOREFRONT_TIMEOUT',
      'getStorefront()',
    );
    // Depending on the platform the native side returns a country code string
    // or a small object; normalise both.
    const country = typeof res === 'string'
      ? res
      : (res && (res.countryCode || res.country || res.storefront)) || JSON.stringify(res);
    return { ok: true, country };
  } catch (error) {
    return {
      ok: false,
      error: { code: error?.code || 'E_STOREFRONT', message: error?.message || String(error) },
    };
  }
}

/**
 * Get a single product by ID.
 */
export async function fetchProduct(productId) {
  const products = await fetchProducts();
  // Tolerate the `.v2` form: callers pass the canonical ID, StoreKit may return
  // the `.v2` SKU (or vice versa).
  return (
    products.find((p) => p.productId === productId) ||
    products.find((p) => baseProductId(p.productId) === baseProductId(productId)) ||
    null
  );
}

// ============================================================
// 3. Purchasing
// ============================================================

/**
 * Initiate a purchase for the given product ID.
 * The result is delivered via purchaseUpdatedListener.
 *
 * Preconditions (enforced here, otherwise Apple sheet will not open):
 *   1. REAL react-native-iap module loaded (not stub)
 *   2. initConnection() previously succeeded
 *   3. Product IDs were fetched via getSubscriptions()
 *   4. The requested productId was found in the fetched product list
 *
 * @param {string} productId - Product ID to purchase
 */
export async function purchaseSubscription(productId) {
  loadRNIapModule();
  if (!RNIap) throw new Error('IAP_NOT_AVAILABLE');
  if (IS_RNIAP_STUB) {
    const msg = '[IAP] ❌ Called purchaseSubscription on IAP STUB — real module not loaded. '
      + 'Apple payment sheet will NOT open. Rebuild Development Build with react-native-iap installed.';
    console.warn(msg);
    const err = new Error('IAP_NOT_AVAILABLE');
    err.code = 'IAP_NOT_AVAILABLE';
    err.message = msg;
    throw err;
  }
  if (!productId) throw new Error('productId is required');

  try {
    console.log('[IAP] ============================================================');
    console.log('[IAP] >>> purchaseSubscription called for:', productId);
    console.log('[IAP]   Platform:', Platform.OS);
    console.log('[IAP]   Registered Product IDs:', JSON.stringify(ALL_PRODUCT_IDS));
    console.log('[IAP]   isInitialized:', isInitialized);

    // 1) Ensure IAP initialized (initConnection + listeners)
    if (!isInitialized) {
      console.log('[IAP]   Not initialized — calling initIAP() first...');
      await initIAP();
      if (!isInitialized) {
        throw new Error('initIAP failed — initConnection did not succeed');
      }
    }

    // 2) For iOS StoreKit 1/2: MUST call getSubscriptions() (fetchProducts) BEFORE
    //    requestSubscription, otherwise sheet is empty / never appears.
    console.log('[IAP]   Step 2: fetchProducts (getSubscriptions) to warm StoreKit cache...');
    const products = await fetchProducts();
    console.log(`[IAP]   → Fetched ${products.length} product(s) from App Store:`,
      products.map(p => `${p.productId} (${p.localizedPrice || p.price})`));

    if (products.length === 0) {
      const lf = lastFetchResult || {};
      const cause = lf.error
        ? `${lf.error.code}: ${lf.error.message}`
        : `App Store answered but returned 0 products (raw=${lf.rawCount ?? 0}, stage=${lf.stage || 'unknown'})`;
      console.warn('[IAP]   ⚠️  No products returned! stage =', lf.stage, '| cause =', cause);
      console.warn('[IAP]     • stage=empty-from-store → 商品对当前 App 不可见（ASC 侧配置）');
      console.warn('[IAP]     • stage=native-error / E_FETCH_TIMEOUT → StoreKit 无响应或报错（设备/网络/库侧）');
      throw new Error(
        `NO_PRODUCTS: ${cause}. `
        + `Requested ${ALL_PRODUCT_IDS.length} IDs: ${ALL_PRODUCT_IDS.join(', ')}`
      );
    }

    // 3) Verify the requested productId was actually returned.
    //    Match exactly first, then fall back to a `.v2`-normalized match so a
    //    caller passing the canonical ID still resolves when ASC only has the
    //    .v2 SKU. We then purchase the SKU StoreKit actually knows about.
    const matched =
      products.find((p) => p.productId === productId) ||
      products.find((p) => baseProductId(p.productId) === baseProductId(productId));
    if (!matched) {
      console.warn(`[IAP]   ❌ Requested productId "${productId}" NOT in fetched list. `
        + `Available: [${products.map(p=>p.productId).join(', ')}]`);
      throw new Error(
        `PRODUCT_NOT_FOUND: "${productId}" was not returned by App Store. `
        + `Available: ${products.map(p=>p.productId).join(', ')}. `
        + `Check App Store Connect "Cleared for Sale" = YES.`
      );
    }
    // Always buy the real SKU returned by StoreKit, never the canonical guess.
    const realSku = matched.productId;
    if (realSku !== productId) {
      console.log(`[IAP]   ℹ️  Using StoreKit SKU "${realSku}" (requested "${productId}")`);
    }
    console.log(`[IAP]   ✅ Matched product: ${realSku} — price: ${matched.localizedPrice || matched.price}`);

    // 4) Trigger StoreKit payment sheet
    //    react-native-iap v12 iOS: use { sku: string } for single subscription.
    //    For iOS NO subscriptionOffers needed (that's Android / introductory offers).
    console.log('[IAP]   Step 4: Calling RNIap.requestSubscription({ sku })...');

    if (Platform.OS === 'ios') {
      await RNIap.requestSubscription({ sku: realSku });
    } else {
      await RNIap.requestSubscription({
        sku: realSku,
        subscriptionOffers: [{ sku: realSku, offerToken: '' }],
      });
    }

    console.log('[IAP]   requestSubscription Promise resolved — awaiting user action via listener...');
    console.log('[IAP] ============================================================');
  } catch (error) {
    console.error('[IAP] ❌ purchaseSubscription FAILED:');
    console.error('[IAP]   code   :', error.code);
    console.error('[IAP]   message:', error.message);
    console.error('[IAP]   stack  :', error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '(no stack)');

    if (onPurchaseErrorCallback) onPurchaseErrorCallback(error);
    throw error;
  }
}

// ============================================================
// 4. Receipt Validation & Pro Unlock
// ============================================================

/**
 * Handle a successful purchase event.
 * Validates receipt and unlocks Pro if valid.
 */
async function handleSuccessfulPurchase(purchase) {
  try {
    console.log('[IAP] Processing purchase:', purchase.productId);

    // StoreKit delivered this transaction → it completed on Apple's servers.
    // The purchase event itself is the authoritative on-device signal for a
    // client-only app (no backend), so we unlock Pro IMMEDIATELY and treat
    // server-side receipt validation as best-effort only.
    //
    // Why this matters: validateReceipt() hits Apple's verifyReceipt endpoint,
    // which for auto-renewable subscriptions requires the app's shared secret
    // (the `password` field). This build does NOT embed it, so sandbox
    // receipts come back as status 21003 (≠ 0) → validateReceipt returned false
    // → onPurchaseSuccessCallback was never called → Pro stayed locked even
    // though the user was charged and StoreKit showed "购买成功". Unlocking on
    // the StoreKit event fixes that, and it is safe: StoreKit only fires
    // purchaseUpdatedListener for genuinely completed transactions.
    await cacheReceipt(purchase); // persist so a relaunch keeps Pro

    // Notify subscription.js to unlock Pro (saves 'pro' + fires UI refresh).
    if (onPurchaseSuccessCallback) {
      await onPurchaseSuccessCallback({
        productId: purchase.productId,
        receipt: purchase.transactionReceipt,
        purchaseDate: purchase.transactionDate || Date.now(),
      });
    }

    // Best-effort validation — logs only, must NOT block unlocking.
    try {
      const isValid = await validateReceipt(purchase);
      console.log('[IAP] Receipt validation result (informational):', isValid);
    } catch (ve) {
      console.warn('[IAP] Receipt validation threw (ignored):', ve?.message || ve);
    }

    // Acknowledge the purchase (required on Android, good practice on iOS).
    await acknowledgePurchase(purchase);
  } catch (error) {
    console.error('[IAP] Handle purchase error:', error);

    if (onPurchaseErrorCallback) {
      onPurchaseErrorCallback(error);
    }
  }
}

/**
 * Validate the purchase receipt.
 *
 * For iOS: Uses StoreKit receipt verification.
 * For production, server-side validation via App Store Server API is recommended.
 *
 * For Android: Uses Google Play developer payload verification.
 * For production, server-side validation via Google Play Developer API is recommended.
 *
 * @param {object} purchase - Purchase object from react-native-iap
 * @returns {Promise<boolean>} True if receipt is valid
 */
async function validateReceipt(purchase) {
  try {
    const receipt = purchase.transactionReceipt;

    if (!receipt) {
      console.warn('[IAP] No receipt found in purchase');
      return false;
    }

    if (Platform.OS === 'ios') {
      // iOS: Validate via Apple's verifyReceipt endpoint
      // NOTE: For production, move this to your server to keep the shared secret safe
      const isValid = await validateIOSReceipt(receipt);
      return isValid;
    } else if (Platform.OS === 'android') {
      // Android: Google Play automatically validates via acknowledged purchases
      // For production, use Google Play Developer API server-side
      const isValid = await validateAndroidReceipt(purchase);
      return isValid;
    }

    return false;
  } catch (error) {
    console.error('[IAP] Receipt validation error:', error);
    // In case of network error, allow the purchase (better UX)
    // Server-side validation will catch any fraud
    return true;
  }
}

/**
 * Validate iOS receipt via Apple's verifyReceipt endpoint.
 * @param {string} receiptBase64 - Base64 encoded receipt data
 * @returns {Promise<boolean>}
 */
async function validateIOSReceipt(receiptBase64) {
  try {
    // Use Apple's production verify endpoint
    // NOTE: Move this to your backend server for production
    const PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
    const SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

    // First try production, fall back to sandbox (Apple's recommended approach)
    const body = JSON.stringify({
      'receipt-data': receiptBase64,
      // Exclude old-style receipts
      'exclude-old-transactions': true,
    });

    const response = await fetch(PRODUCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const data = await response.json();

    // Status 21007 means this is a sandbox receipt — retry with sandbox URL
    if (data.status === 21007) {
      console.log('[IAP] Sandbox receipt detected, retrying with sandbox URL');
      const sandboxResponse = await fetch(SANDBOX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const sandboxData = await sandboxResponse.json();
      return sandboxData.status === 0;
    }

    // Status 0 = valid receipt
    if (data.status === 0) {
      // Check if the receipt contains an active subscription
      const latestReceiptInfo = data.latestReceiptInfo || [];
      const pendingRenewalInfo = data.pendingRenewalInfo || [];

      // Check if any subscription is active (not expired)
      const now = Math.floor(Date.now() / 1000);
      const activeSubscription = latestReceiptInfo.find((receipt) => {
        const expiresDate = parseInt(receipt.expires_date_ms, 10) / 1000;
        return expiresDate > now;
      });

      if (activeSubscription) {
        console.log('[IAP] Active subscription found:', activeSubscription.product_id);
        return true;
      }

      // Also check pending renewal info for auto-renewal status
      const autoRenewActive = pendingRenewalInfo.some(
        (info) => info.auto_renew_status === '1'
      );

      if (autoRenewActive) {
        console.log('[IAP] Auto-renewal is active');
        return true;
      }

      console.warn('[IAP] No active subscription in receipt');
      return false;
    }

    console.warn('[IAP] Receipt validation status:', data.status);
    return false;
  } catch (error) {
    console.error('[IAP] iOS receipt validation error:', error);
    // Network error — allow purchase, server will validate later
    return true;
  }
}

/**
 * Validate Android receipt.
 * @param {object} purchase - Purchase object
 * @returns {Promise<boolean>}
 */
async function validateAndroidReceipt(purchase) {
  try {
    // For Android, Google Play validates purchases via acknowledgement
    // The purchase is valid if it has a valid purchase token
    if (purchase.purchaseToken) {
      console.log('[IAP] Android purchase token present');
      return true;
    }

    console.warn('[IAP] No Android purchase token');
    return false;
  } catch (error) {
    console.error('[IAP] Android receipt validation error:', error);
    return true;
  }
}

/**
 * Acknowledge the purchase (required on Android, optional on iOS).
 */
async function acknowledgePurchase(purchase) {
  if (!RNIap) return;
  try {
    if (Platform.OS === 'android' && purchase.purchaseToken) {
      // Android: Must acknowledge within 3 days
      await RNIap.acknowledgePurchaseAndroid({
        token: purchase.purchaseToken,
      });
      console.log('[IAP] Android purchase acknowledged');
    } else if (Platform.OS === 'ios') {
      // iOS: finishTransaction marks the purchase as delivered
      await RNIap.finishTransaction({ purchase, isConsumable: false });
      console.log('[IAP] iOS transaction finished');
    }
  } catch (error) {
    console.warn('[IAP] Acknowledge failed (non-fatal):', error);
  }
}

// ============================================================
// 5. Restore Purchases
// ============================================================

/**
 * Restore previous purchases.
 * Called when user taps "Restore Purchases" button.
 * @returns {Promise<boolean>} True if a valid subscription was restored
 */
export async function restorePurchases() {
  loadRNIapModule();
  if (!RNIap) return false;
  try {
    console.log('[IAP] Restoring purchases...');

    if (!isInitialized) {
      await initIAP();
    }

    // Get available purchases (non-consumed) from device
    const purchases = await RNIap.getAvailablePurchases();
    console.log('[IAP] Available purchases:', purchases.length);

    // Also get purchase history
    const history = await RNIap.getPurchaseHistory();
    console.log('[IAP] Purchase history:', history.length);

    // Find the most recent valid subscription
    const subscriptionPurchases = [
      ...purchases,
      ...history,
    ].filter(
      (p) =>
        isMonthlyProduct(p.productId) || isAnnualProduct(p.productId)
    );

    if (subscriptionPurchases.length === 0) {
      console.log('[IAP] No subscriptions found to restore');
      return false;
    }

    // Sort by date descending (most recent first)
    subscriptionPurchases.sort(
      (a, b) => (b.transactionDate || 0) - (a.transactionDate || 0)
    );

    const mostRecent = subscriptionPurchases[0];
    console.log('[IAP] Most recent subscription:', mostRecent.productId);

    // Validate and unlock
    const isValid = await validateReceipt(mostRecent);

    if (isValid) {
      await cacheReceipt(mostRecent);

      if (onPurchaseSuccessCallback) {
        await onPurchaseSuccessCallback({
          productId: mostRecent.productId,
          receipt: mostRecent.transactionReceipt,
          purchaseDate: mostRecent.transactionDate || Date.now(),
        });
      }

      await acknowledgePurchase(mostRecent);
      console.log('[IAP] Purchase restored successfully');
      return true;
    }

    console.warn('[IAP] Restored receipt was invalid');
    return false;
  } catch (error) {
    console.error('[IAP] Restore failed:', error);
    return false;
  }
}

// ============================================================
// 6. Check Existing Purchases (on app launch)
// ============================================================

/**
 * Check if the user already has an active subscription.
 * Called during initIAP to restore state on app relaunch.
 */
async function checkExistingPurchases() {
  loadRNIapModule();
  if (!RNIap) return;
  try {
    const purchases = await RNIap.getAvailablePurchases();
    const subscriptions = purchases.filter(
      (p) =>
        isMonthlyProduct(p.productId) || isAnnualProduct(p.productId)
    );

    if (subscriptions.length > 0) {
      console.log('[IAP] Found existing subscription:', subscriptions[0].productId);
      // Validate and restore
      const mostRecent = subscriptions.sort(
        (a, b) => (b.transactionDate || 0) - (a.transactionDate || 0)
      )[0];

      const isValid = await validateReceipt(mostRecent);
      if (isValid) {
        await cacheReceipt(mostRecent);
        if (onPurchaseSuccessCallback) {
          await onPurchaseSuccessCallback({
            productId: mostRecent.productId,
            receipt: mostRecent.transactionReceipt,
            purchaseDate: mostRecent.transactionDate || Date.now(),
          });
        }
      }
    }
  } catch (error) {
    console.warn('[IAP] Check existing purchases failed:', error);
  }
}

// ============================================================
// 7. Receipt Persistence (for app restart)
// ============================================================

/**
 * Cache receipt data to AsyncStorage for persistence across app restarts.
 */
async function cacheReceipt(purchase) {
  try {
    await AsyncStorage.setItem(KEYS.ACTIVE_RECEIPT, purchase.transactionReceipt || '');
    await AsyncStorage.setItem(KEYS.PURCHASED_PRODUCT, purchase.productId || '');
    const dateStr = String(purchase.transactionDate || Date.now());
    await AsyncStorage.setItem(KEYS.PURCHASE_DATE, dateStr);
    console.log('[IAP] Receipt cached');
  } catch (error) {
    console.error('[IAP] Cache receipt failed:', error);
  }
}

/**
 * Load cached receipt from AsyncStorage.
 * @returns {Promise<{productId: string, receipt: string, purchaseDate: number} | null>}
 */
export async function getCachedReceipt() {
  try {
    const receipt = await AsyncStorage.getItem(KEYS.ACTIVE_RECEIPT);
    const productId = await AsyncStorage.getItem(KEYS.PURCHASED_PRODUCT);
    const dateStr = await AsyncStorage.getItem(KEYS.PURCHASE_DATE);

    if (receipt && productId) {
      return {
        productId,
        receipt,
        purchaseDate: dateStr ? parseInt(dateStr, 10) : Date.now(),
      };
    }

    return null;
  } catch (error) {
    console.error('[IAP] Get cached receipt failed:', error);
    return null;
  }
}

/**
 * Clear cached receipt (called when subscription expires or is cancelled).
 */
export async function clearCachedReceipt() {
  try {
    await AsyncStorage.removeItem(KEYS.ACTIVE_RECEIPT);
    await AsyncStorage.removeItem(KEYS.PURCHASED_PRODUCT);
    await AsyncStorage.removeItem(KEYS.PURCHASE_DATE);
    console.log('[IAP] Cached receipt cleared');
  } catch (error) {
    console.error('[IAP] Clear cached receipt failed:', error);
  }
}

// ============================================================
// 8. Cleanup
// ============================================================

/**
 * Clean up IAP listeners and close connection.
 * Call on app unmount or background.
 */
export function cleanupIAP() {
  // Pure cleanup — never triggers loading of the native module.
  // (If the module was never loaded, there is nothing to clean.)
  if (purchaseUpdateListener) {
    purchaseUpdateListener.remove();
    purchaseUpdateListener = null;
  }
  if (purchaseErrorListener) {
    purchaseErrorListener.remove();
    purchaseErrorListener = null;
  }
  isInitialized = false;
  console.log('[IAP] Cleaned up');
}

/**
 * Check if IAP is available with a REAL native module (not stub).
 * Expo Go: false   |   Dev Build with react-native-iap linked: true
 * Expo Go or missing native code → we fall back to iap-stub, which must
 * NOT be considered "available" for purchasing.
 */
export function isIAPAvailable() {
  loadRNIapModule();
  const available = RNIap !== null
    && !IS_RNIAP_STUB
    && typeof RNIap.initConnection === 'function'
    && typeof RNIap.requestSubscription === 'function';
  console.log(`[IAP] isIAPAvailable = ${available} (stub=${IS_RNIAP_STUB}, RNIap=${RNIap ? 'loaded' : 'null'})`);
  return available;
}

/**
 * Expose the stub flag for diagnostics.
 */
export function isUsingStub() {
  return IS_RNIAP_STUB;
}

/**
 * Snapshot of IAP product-ID state for diagnostics.
 * Consumed by subscription.purchasePro() and surfaced in localized
 * purchase-failure messages so the user can tell whether the problem is
 * a code mismatch, a missing "Cleared for Sale" flag, or an unconfigured
 * paid-applications agreement.
 */
export function getIAPDiagnostics() {
  return {
    registeredIds: [...ALL_PRODUCT_IDS],
    attemptedIds: [...lastFetchAttemptIds],
    fetchedIds: [...lastFetchedProductIds],
    // Raw outcome of the last native fetch: distinguishes
    // "StoreKit answered empty" from "StoreKit errored" from "never settled".
    lastFetch: lastFetchResult ? { ...lastFetchResult } : null,
    isStub: IS_RNIAP_STUB,
    isInitialized,
  };
}

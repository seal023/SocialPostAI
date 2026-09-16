// ============================================================
// IAPService — In-App Purchase wrapper using react-native-iap
// Handles product loading, purchasing, restoring, and receipt
// validation for auto-renewable subscriptions.
// ============================================================

import { Platform, NativeModules } from 'react-native';
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

// ============================================================
// StoreKit mode selection (iOS) — 'sk2' | 'sk1' | 'stub' | 'unknown'
// ============================================================
// react-native-iap v12 ships BOTH native implementations (RNIapIos =
// StoreKit 1, RNIapIosSk2 = StoreKit 2) and lets us choose at runtime with
// setup({ storekitMode }). We use STOREKIT_HYBRID_MODE — StoreKit 2 on iOS >= 15,
// StoreKit 1 only on older devices.
//
// NOTE (2026-09-14, verified on device): an earlier change tried to revert this to
// STOREKIT1_MODE, believing Sk2 could not return the still-unsubmitted `.v2`
// subscriptions. That belief was WRONG, and the revert never actually reached the
// line below — only the comment and the diagnostics labels changed, so every build
// has been running StoreKit 2 all along. On-device evidence with Sk2 active:
//   "商品拉取: store returned 2 raw item(s), stage=ok"
//   + the TestFlight sandbox sheet opened with the real price (¥328.00/年).
// The earlier "0 items / never-settled" fetch was a SIGNED-OUT App Store account —
// with no account StoreKit never answers a products request — NOT a Sk2 limitation.
// Staying on Sk2 also avoids Sk1's iOS 26 SKPaymentQueue main-thread crash.
//
// Why this is the fix for three separate on-device failures:
//
//  1. Sk1 `getItems()` (SKProductsRequest) can FAIL WITHOUT EVER CALLING BACK
//     on iOS 26. RNIapIos.swift's `request(_:didFailWithError:)` only rejects
//     promises for SKReceiptRefreshRequest — a failed *products* request leaves
//     the JS promise pending forever. Observed on device as:
//     "E_FETCH_TIMEOUT: getSubscriptions() did not settle within 12000ms".
//     Sk2's `getItems()` is `try await Product.products(for:)` — it resolves or
//     THROWS, so the real Apple error now reaches JS and the diagnostics panel.
//
//  2. Sk1 needs SKPaymentQueue.default().add(self), which throws an uncaught
//     ObjC exception off the main thread on iOS 26 (SIGABRT at launch) — that is
//     what scripts/patch-rniap-ios-init.js works around. Sk2 observes
//     `Transaction.updates` and touches no SKPaymentQueue.
//
//  3. Sk2 `getAvailableItems(onlyIncludeActiveItems: true)` reads
//     `Transaction.currentEntitlements` — a LOCAL query with no sign-in prompt
//     and no `restoreCompletedTransactions()`. That lets us reconcile an
//     already-owned subscription safely (the "已经购买了却仍显示升级到 Pro" bug),
//     which was impossible on Sk1 without the restore sheet.
let IAP_STOREKIT_MODE = 'unknown';
let IAP_SETUP_ERROR = null;

// ============================================================
// User-cancellation predicate — THE root cause of a bad alert
// ============================================================
// react-native-iap reports a user cancel as `E_USER_CANCELLED` with TWO L's on
// both platforms:
//   ios/IapTypes.swift:20  case E_USER_CANCELLED = "E_USER_CANCELLED"
//   ios/RNIapIos.swift:536 / ios/RNIapIosSk2.swift:779   (Sk1 + Sk2)
//   android/.../PromiseUtils.kt:52
// Earlier code here compared against `E_USER_CANCELED` (ONE L), which NEVER
// matched. A cancel therefore fell through to the generic failure path and the
// user saw a bogus, alarming alert while nothing was actually broken:
//   "购买失败 PRODUCT_NOT_FOUND: E_USER_CANCELLED: User cancelled the purchase
//    | 商品拉取: store returned 2 raw item(s), stage=ok
//    | 可能原因: 商品拉取失败：请检查 App Store 账号与商品配置"
// i.e. a false "product fetch failed" claim on a fetch that had succeeded.
// One predicate, used everywhere, so the spelling can never drift again.
const CANCEL_CODES = new Set([
  'E_USER_CANCELLED',
  'E_USER_CANCELED',
  'E_USER_CANCEL',
  'USER_CANCELLED',
  'USER_CANCELED',
]);

/**
 * True when the failure is simply "the user dismissed Apple's sheet".
 * @param {any} err - an Error, a plain {code,message}, or a string
 * @returns {boolean}
 */
export function isUserCancelled(err) {
  if (!err) return false;
  const code = String(err.code || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (CANCEL_CODES.has(code)) return true;
  const message = String(err.message || (typeof err === 'string' ? err : ''));
  return /user\s*cancel/i.test(message) || /E_USER_CANCELLED/i.test(message);
}

function enableBestStoreKit() {
  if (!RNIap || IS_RNIAP_STUB) {
    IAP_STOREKIT_MODE = 'stub';
    return;
  }
  if (Platform.OS !== 'ios') {
    IAP_STOREKIT_MODE = 'sk1'; // Android/Play path — mode flag is iOS-only
    return;
  }
  try {
    if (typeof RNIap.setup === 'function') {
      RNIap.setup({ storekitMode: 'STOREKIT_HYBRID_MODE' });
    }
    const usingSk2 = typeof RNIap.isIosStorekit2 === 'function' && RNIap.isIosStorekit2();
    IAP_STOREKIT_MODE = usingSk2 ? 'sk2' : 'sk1';
    console.log(`[IAP] StoreKit mode = ${IAP_STOREKIT_MODE}`
      + (usingSk2 ? ' (StoreKit 2 — native products request can no longer hang silently)' : ' (StoreKit 1 fallback)'));
  } catch (e) {
    IAP_SETUP_ERROR = e?.message || String(e);
    IAP_STOREKIT_MODE = 'sk1';
    console.warn('[IAP] setup({storekitMode}) failed — staying on StoreKit 1:', IAP_SETUP_ERROR);
  }
}

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
      // Must run BEFORE initConnection()/getSubscriptions() so every later
      // native call is routed to the chosen module.
      enableBestStoreKit();
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
  purchaseErrorListener = RNIap.purchaseErrorListener(async (error) => {
    console.error('[IAP] Purchase error:', error.code, error.message);

    // User cancelled — don't show error alert (two-L spelling, see isUserCancelled)
    if (isUserCancelled(error)) {
      console.log('[IAP] User cancelled purchase');
      return;
    }

    // "Already subscribed" is NOT really an error: StoreKit refuses the purchase
    // BECAUSE the entitlement already exists. Reconcile before we surface a
    // failure, otherwise the user sees an error while being a paying customer.
    // (On device: second tap → Apple's "你目前已订阅此项" → app still said Free.)
    try {
      const found = await syncEntitlement('purchase-error');
      if (found) {
        console.log('[IAP] Purchase error was actually an existing entitlement — Pro unlocked');
        return;
      }
    } catch (e) { /* fall through to the error callback */ }

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
// the Sk1 module holds a SINGLE productsRequest / latest-promise slot, so a
// second concurrent getSubscriptions() overwrites the first promise and leaves
// the earlier caller hanging.
//
// 2026-09-14: we additionally RETRY once. On device the very first products
// request after launch came back E_FETCH_TIMEOUT while a later identical request
// resolved — i.e. a cold StoreKit start-up problem, not a bad product ID.
// A single retry makes that transient failure invisible to the user.
//
// 2026-09-14 (later, same day, on device): the retry window was 6000ms while the
// SAME request succeeded in 8618ms a moment later. A retry window shorter than
// the real latency can NEVER win — the retry is guaranteed to fail, so a slow
// but perfectly healthy StoreKit got reported as dead and the purchase aborted
// with "getSubscriptions() did not settle within 6000ms" and never opened
// Apple's sheet. Both windows are now generous: StoreKit 2's getItems() re-hits
// the network on every call and ~9s is normal on a slow storefront, so anything
// below ~15s is a guaranteed false negative.
const FETCH_TIMEOUT_MS = 20000;
const FETCH_RETRY_TIMEOUT_MS = 15000;

let lastFetchResult = null;   // { at, ms, ok, stage, rawCount, fetchedIds, attempts, error? }
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
export async function fetchProducts({ retries = 1, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
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
    const maxAttempts = Math.max(1, retries + 1);
    let attempts = 0;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      // First attempt gets the long cold-start window; the retry gets a slightly
      // shorter but still generous one (see FETCH_RETRY_TIMEOUT_MS — a retry
      // window below the real latency is a guaranteed false negative).
      const bound = attempt === 1 ? timeoutMs : FETCH_RETRY_TIMEOUT_MS;
      try {
        console.log(`[IAP] Fetching products (attempt ${attempt}/${maxAttempts}, mode=${IAP_STOREKIT_MODE}):`,
          ALL_PRODUCT_IDS);
        const raw = await boundedNativeCall(
          RNIap.getSubscriptions({ skus: ALL_PRODUCT_IDS }),
          bound,
          'E_FETCH_TIMEOUT',
          'getSubscriptions()',
        );
        const list = Array.isArray(raw) ? raw : [];
        const rawIds = list.map((p) => p && p.productId).filter(Boolean);
        lastFetchedProductIds = rawIds;

        if (rawIds.length === 0) {
          // "empty-from-store" = StoreKit DID answer, it just has no product for
          // any requested ID. That is the ASC-side signature. Retry anyway —
          // cheap, and a transient empty answer right after launch is common.
          lastFetchResult = {
            at: Date.now(),
            ms: Date.now() - startedAt,
            ok: false,
            stage: 'empty-from-store',
            rawCount: list.length,
            fetchedIds: rawIds,
            attempts,
          };
          lastError = null;
          if (attempt < maxAttempts) continue;
          console.warn('[IAP] StoreKit answered with 0 products for every requested ID');
          return [];
        }

        lastFetchResult = {
          at: Date.now(),
          ms: Date.now() - startedAt,
          ok: true,
          stage: 'ok',
          rawCount: list.length,
          fetchedIds: rawIds,
          attempts,
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
        lastError = error;
        console.warn(`[IAP] Fetch attempt ${attempt}/${maxAttempts} failed:`,
          error?.code, error?.message);
        if (attempt < maxAttempts) continue;
      }
    }

    // Every attempt failed with a real error. NOTE (StoreKit 2): the error here
    // is a genuine Apple error surfaced by `try await Product.products(for:)`,
    // not the StoreKit-1 "promise never settles" black hole.
    lastFetchResult = {
      at: Date.now(),
      ms: Date.now() - startedAt,
      ok: false,
      stage: 'native-error',
      rawCount: 0,
      fetchedIds: [],
      attempts,
      error: {
        code: lastError?.code || 'E_FETCH_UNKNOWN',
        message: lastError?.message || String(lastError),
      },
    };
    console.error(`[IAP] Failed to fetch products after ${attempts} attempt(s):`, lastError);
    return [];
  })();

  try {
    return await inflightFetch;
  } finally {
    inflightFetch = null;
  }
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

    // 2) Ensure the native product cache is warm. BOTH StoreKit paths need this
    //    before a purchase can start — Sk1 looks the SKU up in `validProducts`,
    //    Sk2 in `productStore`, and neither will open a sheet for an unknown SKU.
    //
    //    A failed fetch is NO LONGER a hard stop (that was the "第一次购买直接报
    //    NO_PRODUCTS，Apple 支付面板根本没弹出" bug). If we end up with no product
    //    list we still ATTEMPT the purchase with the candidate SKUs. Every outcome
    //    is then readable:
    //      • the native store happened to be warm → Apple sheet opens ✅
    //      • the store really is cold → the native layer rejects with a specific
    //        error (E_DEVELOPER_ERROR / "Invalid product ID"), which we surface
    //        instead of a self-invented NO_PRODUCTS message.
    //
    //    First choice: REUSE the last successful catalog fetch. StoreKit 2's
    //    getItems() re-hits the network on EVERY call (~9s on a slow storefront)
    //    but the native cache it fills stays warm — so re-fetching right before a
    //    purchase only adds latency and one more chance to time out (which is
    //    exactly what stopped the sheet from opening on 2026-09-14).
    const CATALOG_FRESH_MS = 120000;
    let products = [];
    const lastF = lastFetchResult;
    if (lastF && lastF.ok && lastFetchedProductIds.length > 0
        && Date.now() - (lastF.at || 0) < CATALOG_FRESH_MS) {
      console.log(`[IAP]   Step 2: reusing recent catalog fetch (age ${Date.now() - lastF.at}ms):`,
        lastFetchedProductIds.join(', '));
      products = lastFetchedProductIds.map((id) => ({ productId: id }));
    } else {
      console.log('[IAP]   Step 2: fetchProducts (getSubscriptions) to warm StoreKit cache...');
      // fetchProducts() already retries once internally (2 attempts), so a second
      // nested retry call here would only add latency, never reliability.
      products = await fetchProducts();
      console.log(`[IAP]   → Fetched ${products.length} product(s) from App Store:`,
        products.map((p) => `${p.productId} (${p.localizedPrice || p.price || ''})`));
    }

    // 3) Resolve which SKU to buy.
    //    Match exactly first, then fall back to a `.v2`-normalized match so a
    //    caller passing the canonical ID still resolves when ASC only has the
    //    .v2 SKU.
    const matched =
      products.find((p) => p.productId === productId) ||
      products.find((p) => baseProductId(p.productId) === baseProductId(productId));

    const candidates = [];
    if (matched) candidates.push(matched.productId);
    if (productId && !candidates.includes(productId)) candidates.push(productId);
    const v2Sku = `${baseProductId(productId)}.v2`;
    if (!candidates.includes(v2Sku)) candidates.push(v2Sku);

    if (!matched) {
      const lf = lastFetchResult || {};
      const cause = lf.error
        ? `${lf.error.code}: ${lf.error.message}`
        : `App Store answered but returned 0 products (raw=${lf.rawCount ?? 0}, stage=${lf.stage || 'unknown'})`;
      console.warn('[IAP]   ⚠️  No product matched the request. stage =', lf.stage, '| cause =', cause);
      console.warn('[IAP]     • stage=empty-from-store → 商品对当前 App 不可见（ASC 侧：Cleared for Sale / 付费协议 / 商品归属）');
      console.warn('[IAP]     • stage=native-error / E_FETCH_TIMEOUT → StoreKit 报错或超时（设备/账号/网络）');
      console.warn('[IAP]     → Attempting purchase anyway with candidate SKUs:', candidates.join(', '));
    } else {
      console.log(`[IAP]   ✅ Matched product: ${matched.productId} — price: ${matched.localizedPrice || matched.price || ''}`);
      if (matched.productId !== productId) {
        console.log(`[IAP]   ℹ️  Using StoreKit SKU "${matched.productId}" (requested "${productId}")`);
      }
    }

    // 4) Trigger the StoreKit payment sheet. Try the candidates in order of
    //    likelihood; the first SKU StoreKit accepts is the one we keep. A
    //    rejection means "this SKU is not in the native cache" → try the next.
    //    react-native-iap v12 iOS: { sku } for a single subscription.
    console.log('[IAP]   Step 4: Calling RNIap.requestSubscription({ sku })...');
    let lastError = null;
    for (const sku of candidates) {
      try {
        if (Platform.OS === 'ios') {
          await RNIap.requestSubscription({ sku });
        } else {
          await RNIap.requestSubscription({
            sku,
            subscriptionOffers: [{ sku, offerToken: '' }],
          });
        }
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        // User cancelled → propagate immediately; do not retry other SKUs.
        // (Must use isUserCancelled: the native code is E_USER_CANCELLED, 2 L's.)
        if (isUserCancelled(e)) throw e;
        console.warn(`[IAP]   requestSubscription("${sku}") rejected:`, e?.code, e?.message);
      }
    }
    if (lastError) {
      // A cancellation is NOT a product problem. If it slips through with an
      // unexpected code, rethrow it untouched rather than dressing it up as
      // PRODUCT_NOT_FOUND — that false alert is exactly what confused this bug.
      if (isUserCancelled(lastError)) throw lastError;
      // Every candidate failed — this is the ASC / product-configuration case.
      // Include the fetch evidence so the on-screen alert is actionable.
      const lf = lastFetchResult || {};
      const fetchCause = lf.error
        ? `${lf.error.code}: ${lf.error.message}`
        : `store returned ${lf.rawCount ?? 0} raw item(s), stage=${lf.stage || 'unknown'}`;
      // Classify the failure so the on-screen alert tells the user WHAT TO FIX:
      //   ok                 → products WERE returned; the failure was the purchase itself
      //   empty-from-store   → the product itself is not live (ASC side)
      //   timeout/native-error → StoreKit never answered (account / network / sandbox)
      let hint;
      if (lf.ok && !lf.error) {
        // The catalog was fetched fine (e.g. "store returned 2 raw item(s),
        // stage=ok"), so do NOT blame the product configuration.
        hint = '商品已正常取到，购买未完成：可能是授权被中断 / 支付未完成 / 网络中断，可直接重试';
      } else if (lf.stage === 'empty-from-store') {
        hint = '商品未在 App Store 生效：请确认订阅处于"准备提交"且元数据完整、Bundle ID 与 App 记录一致、付费 App 协议/银行税务有效';
      } else if (lf.error && lf.error.code === 'E_FETCH_TIMEOUT') {
        hint = 'StoreKit 无响应：请确认设备已登录 App Store 账号（TestFlight 包用你 iPhone 上的 Apple ID 即可，无需沙盒账号），且设备地区与商品可售地区一致';
      } else if (lf.stage === 'native-error') {
        hint = 'StoreKit 报错：可能是账号状态或沙盒环境问题，请重试并检查 App Store 登录';
      } else {
        hint = '购买未完成：请重试；若持续失败，再检查 App Store 账号与商品配置';
      }
      const err = new Error(
        `PRODUCT_NOT_FOUND: ${lastError.code || 'E_UNKNOWN'}: ${lastError.message} `
        + `| 商品拉取: ${fetchCause} `
        + `| 可能原因: ${hint} `
        + `| 已尝试 SKU: ${candidates.join(', ')} `
        + `| StoreKit 模式: ${IAP_STOREKIT_MODE}`
      );
      err.code = lastError.code || 'PRODUCT_NOT_FOUND';
      throw err;
    }

    console.log('[IAP]   requestSubscription Promise resolved — awaiting user action via listener...');
    console.log('[IAP] ============================================================');
  } catch (error) {
    console.error('[IAP] ❌ purchaseSubscription FAILED:');
    console.error('[IAP]   code   :', error.code);
    console.error('[IAP]   message:', error.message);
    console.error('[IAP]   stack  :', error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '(no stack)');

    // A cancellation is not a failure: no entitlement check, no error callback,
    // but the caller gets the code back so it can stay silent instead of
    // popping a "purchase failed" alert for something the user chose.
    if (isUserCancelled(error)) {
      console.log('[IAP] purchaseSubscription: user cancelled the sheet — reporting as cancel');
      throw error;
    }

    // A "failure" here often just means "you already own this subscription"
    // (or the transaction was already delivered in an earlier session). Ask
    // StoreKit what the user actually owns before reporting a hard failure —
    // that is what turns "第二次购买提示已订阅，但 App 仍显示升级到 Pro" into a
    // real Pro unlock.
    try { await syncEntitlement('purchase-failed'); } catch (e) { /* non-fatal */ }

    if (onPurchaseErrorCallback) onPurchaseErrorCallback(error);
    throw error;
  }
}

// ============================================================
// 4a. Entitlement reconciliation
// ============================================================
// One shared question drives three on-device symptoms:
//   1. after a purchase the paywall did not close / Pro stayed locked
//   2. tapping 订阅 again showed Apple's "你目前已订阅此项"
//   3. relaunching still showed 升级到 Pro although the subscription exists
// ...all three are "the app never asked StoreKit what the user owns".
//
// StoreKit 2 gives us a safe way to ask: `getAvailableItems(onlyIncludeActiveItems:
// true)` reads `Transaction.currentEntitlements` — a LOCAL query, no sign-in
// prompt, no restore sheet. (On StoreKit 1 the same call ends up in
// `restoreCompletedTransactions()`, which on iOS 26 is the call that could throw
// a native exception at launch — hence the old "never call it at launch" rule.)
//
// IMPORTANT Sk2 detail: auto-renewable entitlements are filtered against the
// NATIVE product cache (`productStore`), which is only filled by a successful
// getItems(). So we warm the cache first; without it currentEntitlements can
// legitimately come back empty for a subscription the user really owns.
let lastEntitlementResult = null;

const ENTITLEMENT_TIMEOUT_MS = 10000;

/**
 * Reconcile local Pro state with what StoreKit says the user owns.
 * @param {string} reason - label for diagnostics ('launch' | 'paywall' | 'restore' | ...)
 * @returns {Promise<object|null>} the entitlement purchase found, or null
 */
/**
 * A subscription is "currently active" only if its expiry is in the FUTURE.
 * We must NEVER let a transaction whose subscription has already lapsed
 * re-grant Pro — that was the "restore shows Pro for an expired / 'production
 * sandbox' subscription" bug. If the purchase object carries no expiry
 * (non-consumable, or a platform where the field is absent), we trust it
 * rather than deny a legitimate entitlement.
 * @param {object} p - a react-native-iap purchase/transaction object
 * @returns {boolean}
 */
function isActiveSubscription(p) {
  if (!p) return false;
  const exp =
    p.expirationDate ?? p.expiresDate ?? p.expiryDate ??
    p.expirationDateMs ?? p.expiresDateMs;
  if (exp == null) return true;
  const expMs = typeof exp === 'number' ? exp : Date.parse(String(exp));
  if (!Number.isFinite(expMs)) return true;
  return expMs > Date.now();
}

/**
 * Single rigorous gate before we trust a transaction to unlock Pro:
 * it must match ONE OF OUR subscription product IDs AND be currently active
 * (unexpired). This is what turns "restore / verify" into a real Apple-account
 * check instead of a loose product-id match.
 */
function isOurActiveSubscription(p) {
  if (!p) return false;
  if (!(isMonthlyProduct(p.productId) || isAnnualProduct(p.productId))) return false;
  return isActiveSubscription(p);
}

export async function syncEntitlement(reason = 'manual') {
  loadRNIapModule();
  if (!RNIap || IS_RNIAP_STUB) {
    lastEntitlementResult = { at: Date.now(), reason, ok: false, stage: 'no-module', mode: IAP_STOREKIT_MODE };
    return null;
  }

  if (!isInitialized) {
    try { await initIAP(); } catch (e) { /* recorded below */ }
  }

  // Warm the native product cache (see the Sk2 note above). Best-effort.
  try { await fetchProducts({ retries: 0, timeoutMs: FETCH_RETRY_TIMEOUT_MS }); } catch (e) { /* ignore */ }

  // --------------------------------------------------------------------------
  // AUTHORITATIVE check — only CURRENTLY ACTIVE, Apple-verified entitlements.
  // On StoreKit 2 this reads Transaction.currentEntitlements: Apple populates
  // it ONLY after the Apple ID is authenticated AND the entitlement is valid
  // right now. This IS the "Apple account verification" — a local flag, a stale
  // receipt cache, or a years-old / expired purchase must never re-grant Pro.
  // --------------------------------------------------------------------------
  let activeError = null;
  if (typeof RNIap.getAvailablePurchases === 'function') {
    try {
      const raw = await boundedNativeCall(
        RNIap.getAvailablePurchases({ onlyIncludeActiveItems: true }),
        ENTITLEMENT_TIMEOUT_MS,
        'E_ENTITLEMENT_TIMEOUT',
        'getAvailablePurchases()',
      );
      const list = Array.isArray(raw) ? raw : [];
      // Rigorous gate: OUR product id AND still unexpired. An expired /
      // "production sandbox"-lapsed subscription is NOT a valid entitlement.
      const subs = list.filter(isOurActiveSubscription);
      if (subs.length > 0) {
        subs.sort((a, b) => (b.transactionDate || 0) - (a.transactionDate || 0));
        const best = subs[0];
        console.log(`[IAP] ✅ Active entitlement verified with Apple (${reason}):`, best.productId);

        await cacheReceipt(best);
        if (onPurchaseSuccessCallback) {
          await onPurchaseSuccessCallback({
            productId: best.productId,
            receipt: best.transactionReceipt,
            purchaseDate: best.transactionDate || Date.now(),
          });
        }
        lastEntitlementResult = {
          at: Date.now(), reason, ok: true, stage: 'found', mode: IAP_STOREKIT_MODE,
          via: 'currentEntitlements(active)', productId: best.productId, count: subs.length,
          // The entitlement's OWN transaction timestamp. Callers use it to tell a
          // genuinely NEW purchase (txDate ≈ now) apart from merely re-detecting a
          // subscription the user already owned — e.g. tapping 订阅 on an
          // auto-renew-cancelled sub that is still inside its paid period (Apple
          // returns the existing transaction instead of selling a duplicate).
          transactionDate: best.transactionDate ?? null,
        };
        return best;
      }
      console.log(`[IAP] Entitlement check (active, ${reason}): no CURRENT subscription found`);
    } catch (e) {
      activeError = e;
      console.warn(`[IAP] Entitlement check (getAvailablePurchases, ${reason}) failed:`, e?.code, e?.message);
    }
  }

  // --------------------------------------------------------------------------
  // DIAGNOSTIC-only check — purchase HISTORY (expired / refunded / lapsed
  // "production sandbox" subs included). We read it only to tell the user WHAT
  // Apple sees; it must NEVER grant Pro.
  // --------------------------------------------------------------------------
  let historyInfo = null;
  if (typeof RNIap.getPurchaseHistory === 'function') {
    try {
      const raw = await boundedNativeCall(
        RNIap.getPurchaseHistory({ onlyIncludeActiveItems: false }),
        ENTITLEMENT_TIMEOUT_MS,
        'E_ENTITLEMENT_TIMEOUT',
        'getPurchaseHistory()',
      );
      const list = Array.isArray(raw) ? raw : [];
      const pastSubs = list.filter(
        (p) => p && (isMonthlyProduct(p.productId) || isAnnualProduct(p.productId))
      );
      if (pastSubs.length > 0) {
        historyInfo = {
          count: pastSubs.length,
          productIds: pastSubs.map((s) => s.productId),
          note: 'HISTORICAL_ONLY_NOT_GRANTED',
        };
        console.log(`[IAP] Purchase history shows ${pastSubs.length} past subscription transaction(s) — NOT used to grant Pro (may be expired/refunded/lapsed).`);
      }
    } catch (e) {
      console.warn(`[IAP] getPurchaseHistory (${reason}) failed:`, e?.code, e?.message);
    }
  }

  // ── Was StoreKit actually answering? ─────────────────────────────────────
  // An EMPTY entitlement list is only meaningful if StoreKit is demonstrably
  // alive — i.e. the catalog fetch above returned our products. When it did NOT
  // (device signed OUT of the App Store account → getSubscriptions() times out;
  // or the products are invisible to this build → 'empty-from-store'), StoreKit 2
  // filters currentEntitlements against the native product cache, so a REAL
  // subscriber would also come back empty. Treating that as "Apple says you own
  // nothing" is what wrongly downgraded a paying user to free the moment they
  // signed out of the App Store account (2026-09-16) — which then made the UI
  // contradict itself ("已订阅 Pro" while 语音输入 stayed locked). Classify it as
  // inconclusive instead, so reconcileWithStoreKit never downgrades on it.
  const storeReachable = !!(lastFetchResult && lastFetchResult.ok === true);
  lastEntitlementResult = {
    at: Date.now(), reason, ok: false, mode: IAP_STOREKIT_MODE,
    stage: historyInfo
      ? 'historical-only'
      : (activeError || !storeReachable ? 'native-error' : 'no-entitlement'),
    store: lastFetchResult ? lastFetchResult.stage : 'unknown',
    history: historyInfo,
    error: activeError ? { code: activeError.code, message: activeError.message } : null,
  };
  return null;
}

/**
 * Snapshot of the last entitlement reconciliation (for diagnostics).
 */
export function getLastEntitlementResult() {
  return lastEntitlementResult ? { ...lastEntitlementResult } : null;
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

    // Reconcile once more. This normalizes the stored product id to the SKU
    // StoreKit actually knows (base vs `.v2`) so a later currentEntitlements
    // lookup can always match it, and it covers the "listener fired but the
    // success callback above threw" case.
    try { await syncEntitlement('purchase-success'); } catch (e) { /* non-fatal */ }
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

    // Everything (which native API to call, which entitlement to prefer, caching
    // and unlocking Pro) now lives in syncEntitlement(). Two reasons we no
    // longer do it inline here:
    //
    //  1. `validateReceipt()` used to GATE the unlock. For an auto-renewable
    //     subscription Apple's verifyReceipt requires the app's shared secret
    //     (`password`); this build embeds none, so Apple answers 21003 (≠ 0)
    //     → validateReceipt() false → "No active subscription found to restore"
    //     even for a user who genuinely IS subscribed. For a client-only app
    //     StoreKit's own answer (an unexpired transaction in
    //     `Transaction.currentEntitlements`) is authoritative, so we trust that
    //     and keep verifyReceipt purely informational.
    //
    //  2. On StoreKit 2 the products must be warm in the NATIVE cache before
    //     currentEntitlements reports auto-renewable entitlements —
    //     syncEntitlement() handles that ordering.
    const found = await syncEntitlement('restore');
    if (found) {
      await acknowledgePurchase(found);
      console.log('[IAP] Purchase restored successfully:', found.productId);
      return true;
    }

    console.warn('[IAP] No active subscription found to restore');
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
    // 'sk2' = StoreKit 2 in use (real errors, no silent hang), 'sk1' = fallback.
    storekitMode: IAP_STOREKIT_MODE,
    setupError: IAP_SETUP_ERROR,
    // Result of the last "what does the user actually own?" reconciliation.
    lastEntitlement: lastEntitlementResult ? { ...lastEntitlementResult } : null,
    isStub: IS_RNIAP_STUB,
    isInitialized,
  };
}

/**
 * Snapshot of the StoreKit mode only (cheap — never loads the native module).
 */
export function getStoreKitMode() {
  return { mode: IAP_STOREKIT_MODE, setupError: IAP_SETUP_ERROR };
}

/**
 * Open Apple's IN-APP "Manage Subscriptions" sheet.
 *
 * WHY THIS EXISTS
 * A subscription bought from a TestFlight build under a REAL Apple ID lives in
 * the "production sandbox": it does NOT appear under Settings → Subscriptions,
 * it cannot be cleared from App Store Connect (no sandbox tester to clear), and
 * it auto-renews every 24h (≤6 renewals, then it self-cancels). Apple's own
 * engineers confirm the ONLY in-app way to cancel/manage such a subscription is
 * to present `AppStore.showManageSubscriptions(in:)` from inside the app:
 *   https://developer.apple.com/forums/thread/802551
 *
 * HOW WE CALL IT
 * react-native-iap v12 wraps that native method as
 * `RNIapIosSk2.showManageSubscriptions()` (ios/RNIapIosSk2.swift →
 * AppStore.showManageSubscriptions(in:)), but does NOT re-export it from the
 * package root (`src/modules/index.ts` only re-exports `./ios`). So we reach
 * the native module directly. If StoreKit 2 isn't the active module we fall
 * back to react-native-iap's `deepLinkToSubscriptions()`, which merely opens
 * https://apps.apple.com/account/subscriptions for the user.
 *
 * @returns {Promise<{success: boolean, via?: string, error?: string, message?: string}>}
 */
export async function manageSubscriptions() {
  if (Platform.OS !== 'ios') {
    return { success: false, error: 'UNSUPPORTED_PLATFORM' };
  }
  try {
    const sk2 = NativeModules.RNIapIosSk2;
    if (sk2 && typeof sk2.showManageSubscriptions === 'function') {
      await sk2.showManageSubscriptions();
      return { success: true, via: 'sk2-sheet' };
    }
    // StoreKit 1 active / Sk2 module not linked — open the App Store page.
    loadRNIapModule();
    if (RNIap && typeof RNIap.deepLinkToSubscriptions === 'function') {
      await RNIap.deepLinkToSubscriptions({});
      return { success: true, via: 'deeplink' };
    }
    return { success: false, error: 'MANAGE_SUBS_UNAVAILABLE' };
  } catch (e) {
    console.warn('[IAP] manageSubscriptions failed:', e?.message || e);
    return {
      success: false,
      error: e?.code || 'MANAGE_SUBS_FAILED',
      message: e?.message,
    };
  }
}

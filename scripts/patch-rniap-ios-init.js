/**
 * patch-rniap-ios-init.js
 * --------------------------------------------
 * iOS 26 StoreKit crash fix (native side, two layers).
 *
 * Layer 1 — module init():
 *   react-native-iap's RNIapIos.swift calls SKPaymentQueue.default().add(self)
 *   inside its module `init()`. In React Native 0.81 (New Architecture) merely
 *   loading the JS package instantiates the native TurboModule, which runs
 *   init() → touches StoreKit during app launch. On iOS 26 this throws an
 *   uncaught ObjC exception on turbomodulemanager.queue → SIGABRT at startup.
 *
 * Layer 2 — main-thread requirement:
 *   TurboModule exported methods also execute on turbomodulemanager.queue
 *   (a background serial queue). SKPaymentQueue.default().add(self) throws an
 *   uncaught ObjC exception on a background thread on iOS 26, so even calling
 *   it from initConnection() (user taps the paywall) crashes with the same
 *   SIGABRT stack (performVoidMethodInvocation → objc_exception_rethrow).
 *   Both add/remove of the observer are therefore dispatched to the main
 *   thread. Purchasing behaviour is unchanged.
 *
 * Idempotent: safe to run repeatedly (fresh npm install or already patched).
 * Runs automatically via `postinstall` (see package.json) so EAS cloud
 * builds get the fix too.
 */

const fs = require('fs');
const path = require('path');

const swiftPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-iap',
  'ios',
  'RNIapIos.swift'
);

if (!fs.existsSync(swiftPath)) {
  console.log('[patch-rniap-ios-init] RNIapIos.swift not found, skipping');
  process.exit(0);
}

let src = fs.readFileSync(swiftPath, 'utf8');
let changed = false;

// ---- Step 1: remove StoreKit from init() (defer to initConnection) ----
const initBefore = `        super.init()
        addTransactionObserver()`;
const initAfter = `        super.init()
        // [iOS 26 crash fix] Do NOT touch StoreKit at module-init time.
        // SKPaymentQueue.default().add(self) during TurboModule instantiation
        // can throw an uncaught ObjC exception on iOS 26 -> SIGABRT at launch.
        // The observer is added lazily in initConnection().
        // addTransactionObserver()`;

if (src.includes(initBefore)) {
  src = src.split(initBefore).join(initAfter);
  changed = true;
  console.log('[patch-rniap-ios-init] init() patched — StoreKit deferred to initConnection()');
}

// ---- Step 2: addTransactionObserver must run on the main thread ----
const addBefore = `    func addTransactionObserver() {
        if !hasTransactionObserver {
            hasTransactionObserver = true
            SKPaymentQueue.default().add(self)
        }
    }`;
const addAfter = `    func addTransactionObserver() {
        // [iOS 26 crash fix] TurboModule methods execute on turbomodulemanager.queue
        // (background thread). SKPaymentQueue.default().add(self) throws an uncaught
        // ObjC exception there on iOS 26 -> SIGABRT. Dispatch to the main thread.
        DispatchQueue.main.async {
            if !self.hasTransactionObserver {
                self.hasTransactionObserver = true
                SKPaymentQueue.default().add(self)
            }
        }
    }`;

if (src.includes(addBefore)) {
  src = src.split(addBefore).join(addAfter);
  changed = true;
  console.log('[patch-rniap-ios-init] addTransactionObserver() -> main thread');
}

// ---- Step 3: removeTransactionObserver must run on the main thread ----
const removeBefore = `    func removeTransactionObserver() {
        if hasTransactionObserver {
            hasTransactionObserver = false
            SKPaymentQueue.default().remove(self)
        }
    }`;
const removeAfter = `    func removeTransactionObserver() {
        // [iOS 26 crash fix] Same main-thread requirement as add().
        DispatchQueue.main.async {
            if self.hasTransactionObserver {
                self.hasTransactionObserver = false
                SKPaymentQueue.default().remove(self)
            }
        }
    }`;

if (src.includes(removeBefore)) {
  src = src.split(removeBefore).join(removeAfter);
  changed = true;
  console.log('[patch-rniap-ios-init] removeTransactionObserver() -> main thread');
}

if (!changed) {
  console.log('[patch-rniap-ios-init] nothing to patch (already patched or changed upstream)');
} else {
  fs.writeFileSync(swiftPath, src, 'utf8');
  console.log('[patch-rniap-ios-init] RNIapIos.swift patched successfully');
}

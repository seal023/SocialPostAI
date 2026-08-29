// ============================================================
// IAP Stub — used when the real react-native-iap native module
// is NOT linked (e.g. Expo Go / Dev Build built without RNIap).
//
// ⚠️  This stub provides NO-OP implementations. Any attempt to
//     purchase / restore will log a WARNING and NOT open Apple's
//     payment sheet. To test real IAP:
//       1. npm install react-native-iap@^12.15.0
//       2. Rebuild Development Build (npx expo run:ios)
//       3. Use a real device with App Store Sandbox Tester signed in
// ============================================================

const STUB_WARN = (method) => {
  console.warn(
    `[IAP:STUB] ⚠️  "${method}" called on IAP STUB. `
    + 'react-native-iap native module not available. '
    + 'Install react-native-iap and rebuild Dev Build / TestFlight. '
    + 'No real purchase flow will run in this build.'
  );
};

const noop = (...args) => { STUB_WARN('noop(' + args.slice(0,1) + ')'); };

export default {
  initConnection: async () => { STUB_WARN('initConnection'); return false; },
  closeConnection: (...a) => { STUB_WARN('closeConnection'); },
  purchaseUpdatedListener: () => {
    STUB_WARN('purchaseUpdatedListener (noop, no events will fire)');
    return { remove: () => {} };
  },
  purchaseErrorListener: () => {
    STUB_WARN('purchaseErrorListener (noop, no events will fire)');
    return { remove: () => {} };
  },
  getSubscriptions: async () => { STUB_WARN('getSubscriptions'); return []; },
  getProducts: async () => { STUB_WARN('getProducts'); return []; },
  requestSubscription: async (...args) => {
    STUB_WARN('requestSubscription ' + JSON.stringify(args.slice(0,1)));
    throw Object.assign(new Error('IAP_STUB — requestSubscription not available'), {
      code: 'IAP_NOT_AVAILABLE',
    });
  },
  requestPurchase: async (...args) => {
    STUB_WARN('requestPurchase');
    throw Object.assign(new Error('IAP_STUB — requestPurchase not available'), {
      code: 'IAP_NOT_AVAILABLE',
    });
  },
  restorePurchases: async () => { STUB_WARN('restorePurchases'); return []; },
  getAvailablePurchases: async () => { STUB_WARN('getAvailablePurchases'); return []; },
  getPurchaseHistory: async () => { STUB_WARN('getPurchaseHistory'); return []; },
  acknowledgePurchaseAndroid: async () => { STUB_WARN('acknowledgePurchaseAndroid'); },
  finishTransaction: async () => { STUB_WARN('finishTransaction'); },
  consumePurchaseAndroid: async () => { STUB_WARN('consumePurchaseAndroid'); },
};

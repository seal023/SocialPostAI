// ============================================================
// Build stamp — updated on every release/fix commit.
//
// This value is baked into the JS bundle at build time and surfaced
// in the in-app "诊断自检" panel. If the panel shows a stamp older
// than the latest commit, the installed build is stale (TestFlight
// did not pick up the new build).
// ============================================================
export const BUILD_STAMP = 'ascAppId→6801996062 + dev-tools __DEV__ gate · 2026-09-14';

// Git commit / branch this build was cut from (informational)
export const BUILD_COMMIT = 'main@iap-v2-fix+iapdiag2';

// QA-only tools (e.g. the quota-reset entry + the 诊断自检 panel in Profile).
// These must be HIDDEN in the production App Store build.
//
// Gate logic (keyed off __DEV__, NOT an env var):
//   - Dev builds (`__DEV__ === true`: Expo Go / dev client / local) → true  (visible)
//   - Production builds (`__DEV__ === false`: Xcode Cloud Release)     → false (hidden)
//   - Force-enable in a production build by setting EXPO_PUBLIC_SHOW_DEV_TOOLS=true
//     (e.g. a debug TestFlight build).
//
// WHY __DEV__ AND NOT eas.json env: Xcode Cloud runs its own bundling and
// NEVER reads `eas.json` `build.production.env`, so EXPO_PUBLIC_SHOW_DEV_TOOLS
// set there is inert for Xcode Cloud builds. With the old `!== 'false'` check the
// var was `undefined` in Xcode Cloud → tools stayed VISIBLE in the App Store build.
// `__DEV__` is reliably false in a Release build, so the gate is correct everywhere.
export const TEST_TOOLS_ENABLED =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_SHOW_DEV_TOOLS === 'true';

// Bump this string on every meaningful fix commit so we can tell
// builds apart from the device without reading logs.
export function getBuildStamp() {
  return BUILD_STAMP;
}

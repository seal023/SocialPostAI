// ============================================================
// Build stamp — updated on every release/fix commit.
//
// This value is baked into the JS bundle at build time and surfaced
// in the in-app "诊断自检" panel. If the panel shows a stamp older
// than the latest commit, the installed build is stale (TestFlight
// did not pick up the new build).
// ============================================================
export const BUILD_STAMP = 'iap-v2-fix+iapdiag2 · 2026-09-14 · +diag+IAPdiag+ASRkey+cul';

// Git commit / branch this build was cut from (informational)
export const BUILD_COMMIT = 'main@iap-v2-fix+iapdiag2';

// QA-only tools (e.g. the quota-reset entry + the 诊断自检 panel in Profile).
// These must be HIDDEN in the production App Store build.
//
// Controlled by the build env var EXPO_PUBLIC_SHOW_DEV_TOOLS:
//   - not set (dev / TestFlight / preview)  → true  (tools visible)
//   - set to 'false' in the production build → false (tools hidden)
// `eas.json` sets it to 'false' under build.production. So the same code base
// shows the QA tools while testing and hides them once submitted.
export const TEST_TOOLS_ENABLED =
  process.env.EXPO_PUBLIC_SHOW_DEV_TOOLS !== 'false';

// Bump this string on every meaningful fix commit so we can tell
// builds apart from the device without reading logs.
export function getBuildStamp() {
  return BUILD_STAMP;
}

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

// QA-only tools (e.g. the quota-reset entries in Profile / the daily-limit
// dialog). Flip this to false BEFORE submitting to the App Store — while it is
// true a user can bypass the free 3/day generation limit.
export const TEST_TOOLS_ENABLED = true;

// Bump this string on every meaningful fix commit so we can tell
// builds apart from the device without reading logs.
export function getBuildStamp() {
  return BUILD_STAMP;
}

// ============================================================
// Build stamp — updated on every release/fix commit.
//
// This value is baked into the JS bundle at build time and surfaced
// in the in-app "诊断自检" panel. If the panel shows a stamp older
// than the latest commit, the installed build is stale (TestFlight
// did not pick up the new build).
// ============================================================
export const BUILD_STAMP = 'sync-main-20260913 · +diag + IAPdiag · e018fe4';

// Git commit / branch this build was cut from (informational)
export const BUILD_COMMIT = 'master@e018fe4 → origin/main';

// Bump this string on every meaningful fix commit so we can tell
// builds apart from the device without reading logs.
export function getBuildStamp() {
  return BUILD_STAMP;
}

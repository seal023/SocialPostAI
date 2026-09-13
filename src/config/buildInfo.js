// ============================================================
// Build stamp — updated on every release/fix commit.
//
// This value is baked into the JS bundle at build time and surfaced
// in the in-app "诊断自检" panel. If the panel shows a stamp older
// than the latest commit, the installed build is stale (TestFlight
// did not pick up the new build).
// ============================================================
export const BUILD_STAMP = 'asr-sgkey-privatews · 2026-09-13 · +diag+IAPdiag+ASRkey+final';

// Git commit / branch this build was cut from (informational)
export const BUILD_COMMIT = 'main@asr-sgkey-privatews (pushed)';

// Bump this string on every meaningful fix commit so we can tell
// builds apart from the device without reading logs.
export function getBuildStamp() {
  return BUILD_STAMP;
}

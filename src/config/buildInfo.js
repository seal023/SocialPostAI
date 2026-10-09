// ============================================================
// Build stamp — updated on every release/fix commit.
//
// This value is baked into the JS bundle at build time and surfaced
// in the in-app "诊断自检" panel. If the panel shows a stamp older
// than the latest commit, the installed build is stale (TestFlight
// did not pick up the new build).
// ============================================================
export const BUILD_STAMP = 'ascAppId→6801996062 · 2026-10-09 · iap-sk2 + restore-verify + clean-prod + diag-entry-gated + zh-placeholder-fix + unlimited-label + restore-modal-bigger + pro-hint + login-persist + paywall-footer + status-sync + entitlement-downgrade + tier-single-source + verified-purchase + purchase-freshness + ipad-letterbox-frame + delete-account-5.1.1 + uiscene-ios27 + iap-coldstart-retry';

// Git commit / branch this build was cut from (informational)
export const BUILD_COMMIT = 'main@diagentrygated+zhplaceholderfix+unlimitedlabel';

// QA-only tools (e.g. the quota-reset entry + the 诊断自检 panel in Profile).
// These must be HIDDEN in EVERY production build — TestFlight AND App Store.
//
// Gate logic (keyed off __DEV__ ONLY — no env override, by design):
//   - Dev builds (`__DEV__ === true`: Expo Go / dev client / local) → true  (visible)
//   - Production builds (`__DEV__ === false`: ALL Xcode Cloud Release builds)
//                                                                         → false (hidden)
//
// WHY __DEV__-ONLY (no EXPO_PUBLIC_SHOW_DEV_TOOLS override):
// An earlier build leaked the 诊断自检 / 恢复测试额度 entries into TestFlight
// because EXPO_PUBLIC_SHOW_DEV_TOOLS=true was baked via the tracked
// `.env.production` file (loaded by @expo/env at bundle time). To GUARANTEE a
// clean production app — independent of any Xcode Cloud env var or a stray
// `.env*` file — the gate is now __DEV__-only. A Release build can NEVER show
// QA tools, no matter what. To debug a Release build, run a dev client / Expo Go
// instead (where __DEV__ is true). This is the "准确、干净的 app" guarantee.
export const TEST_TOOLS_ENABLED = (typeof __DEV__ !== 'undefined' && __DEV__);

// Bump this string on every meaningful fix commit so we can tell
// builds apart from the device without reading logs.
export function getBuildStamp() {
  return BUILD_STAMP;
}

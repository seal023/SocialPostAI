// ============================================================
// asrConfig — realtime speech-to-text (ASR) configuration.
//
// WHY THIS FILE EXISTS (root cause of the "voice network error")
// -------------------------------------------------------------
// EXPO_PUBLIC_* values are inlined into the JS bundle by Metro, which reads
// .env at bundle time. The Xcode Cloud CI script
// (ios/ci_scripts/ci_post_clone.sh) used to regenerate .env with
//
//     printf '...' > .env
//
// which REPLACED the whole file and silently deleted EXPO_PUBLIC_ASR_API_KEY.
// Voice input then fell back to the US-region text-generation key, and because
// realtime ASR is only served from cn-beijing / ap-southeast-1 (keys are
// region-specific) every handshake failed with 401 / timeout — while the
// diagnostic still showed the correct endpoint and model.
//
// The Singapore workspace key is therefore committed HERE as the source of
// truth, so the value is guaranteed to be present in the bundle no matter what
// CI does with .env. A value set in the environment still wins, so the key can
// be rotated from Xcode Cloud workflow variables without editing code.
//
// Verified 2026-09-13 with a live handshake from the dev machine:
//   wss://ws-6f52kltpls7886bp.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/inference
//   + Authorization: Bearer <this key> + model fun-asr-realtime
//   -> {"event":"task-started"}   (HTTP 101 upgrade OK)
// ============================================================

// Singapore (ap-southeast-1) workspace-scoped key for the private MaaS endpoint.
const BUILTIN_ASR_KEY =
  'sk-ws-H.DHIHXXL.3giR.MEUCIQC41E-YOOg88dJgczuRrfvaX3BwV2glwfKPYbk8oVB7LAIgeCECVLRplDh3gDL19HwPLThV0zdhfv13G9UfPeI0BkE';

const ENV_ASR_KEY = process.env.EXPO_PUBLIC_ASR_API_KEY || '';
const ENV_TEXT_KEY =
  process.env.EXPO_PUBLIC_BAILIAN_API_KEY ||
  process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY ||
  '';

// Realtime ASR endpoint: the PRIVATE MaaS workspace (NOT the public intl
// gateway — this key is workspace-scoped and only works against this host).
export const ASR_WS_URL =
  process.env.EXPO_PUBLIC_PARAFORMER_WS_URL ||
  'wss://ws-6f52kltpls7886bp.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/inference';

// fun-asr-realtime is the realtime model served in the Singapore region.
export const ASR_MODEL =
  process.env.EXPO_PUBLIC_PARAFORMER_MODEL || 'fun-asr-realtime';

export const ASR_API_KEY = ENV_ASR_KEY || BUILTIN_ASR_KEY || ENV_TEXT_KEY;

// Where the key in use came from — surfaced in the in-app diagnostics so a
// regression (falling back to the US key) is visible in one screenshot.
export const ASR_KEY_SOURCE = ENV_ASR_KEY
  ? 'EXPO_PUBLIC_ASR_API_KEY (env)'
  : BUILTIN_ASR_KEY
    ? 'built-in SG key (src/config/asrConfig.js)'
    : 'FALLBACK BAILIAN/DASHSCOPE (US key → realtime ASR will fail)';

// True only when a region-matched (SG/Beijing) key is actually in use.
export const ASR_KEY_REGION_MATCHED = Boolean(ENV_ASR_KEY || BUILTIN_ASR_KEY);

// Masked form for logs / diagnostics — never print the full key.
export function maskAsrKey(key) {
  if (!key) return '(empty)';
  if (key.length <= 12) return `${key.slice(0, 2)}•••${key.slice(-2)} (len=${key.length})`;
  return `${key.slice(0, 8)}…${key.slice(-4)} (len=${key.length})`;
}

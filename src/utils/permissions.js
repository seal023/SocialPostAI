// ============================================================
// Permissions — Feature access control based on subscription tier
// Trial: all features except avatar/username editing, no Pro badge
// Pro: everything unlocked + Pro badge
// Free: limited features, 3 generations/day, 7-day history
// ============================================================

import { getSubscriptionStatus } from './storage';
import { getSubscriptionState } from './subscription';

/**
 * Get the current permission set based on subscription status.
 * @returns {Promise<{tier: string, canEditProfile: boolean, canUseVoice: boolean, canUseBrandVoice: boolean, canUseCulturalCheck: boolean, canFavorite: boolean, historyRetentionDays: number, showProBadge: boolean, dailyLimit: number}>}
 */
export async function getPermissions() {
  // ── Single source of truth for the tier ──────────────────────────────────
  // Derive from getSubscriptionState() — the SAME function the home-screen plan
  // chip and the trial banner render from — instead of reading the RAW stored
  // status.
  //
  // Why: getSubscriptionState() RE-DERIVES the 30-day trial from the install
  // date, so it reports 'trial' even when the raw stored value is 'free' (which
  // is exactly what a Pro downgrade writes). Reading the raw value here made the
  // feature gates disagree with the UI: on device the home screen showed
  // "免费试用·剩余7天" while 语音输入 stayed locked with "此功能需要 Pro 版本"
  // (2026-09-16). Deriving both from the same state object makes "what the UI
  // says" and "what is actually unlocked" impossible to drift apart.
  let status;
  try {
    status = (await getSubscriptionState())?.status;
  } catch (e) {
    status = null;
  }
  if (!status) {
    try {
      status = await getSubscriptionStatus();
    } catch (e) {
      status = 'free';
    }
  }

  // Trial — 7 days, all features except profile editing / Pro badge
  if (status === 'trial') {
    return {
      tier: 'trial',
      canEditProfile: false,
      canUseVoice: true,
      canUseBrandVoice: true,
      canUseCulturalCheck: true,
      canFavorite: true,
      historyRetentionDays: 0, // 0 = unlimited
      showProBadge: false,
      dailyLimit: 999,
    };
  }

  // Pro — everything unlocked
  if (status === 'pro') {
    return {
      tier: 'pro',
      canEditProfile: true,
      canUseVoice: true,
      canUseBrandVoice: true,
      canUseCulturalCheck: true,
      canFavorite: true,
      historyRetentionDays: 0,
      showProBadge: true,
      dailyLimit: 999,
    };
  }

  // Free — limited
  return {
    tier: 'free',
    canEditProfile: false,
    canUseVoice: false,
    canUseBrandVoice: false,
    canUseCulturalCheck: false,
    canFavorite: false,
    historyRetentionDays: 7,
    showProBadge: false,
    dailyLimit: 3,
  };
}

/**
 * Filter history items based on retention policy.
 * Free tier: only keep items from last 7 days.
 * Trial/Pro: keep all.
 * @param {Array} history - Array of history items with createdAt field
 * @param {Object} permissions - Permission object from getPermissions()
 * @returns {Array} Filtered history
 */
export function filterHistoryByRetention(history, permissions) {
  if (permissions.historyRetentionDays === 0) {
    return history;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - permissions.historyRetentionDays);
  const cutoffStr = cutoff.toISOString();

  return history.filter((item) => {
    if (!item.createdAt) return true;
    return item.createdAt >= cutoffStr;
  });
}

/**
 * Quick check: can user edit profile (avatar/username)?
 */
export async function canEditProfile() {
  const perms = await getPermissions();
  return perms.canEditProfile;
}

/**
 * Quick check: can user use voice input?
 */
export async function canUseVoice() {
  const perms = await getPermissions();
  return perms.canUseVoice;
}

/**
 * Quick check: can user use brand voice learning?
 */
export async function canUseBrandVoice() {
  const perms = await getPermissions();
  return perms.canUseBrandVoice;
}

/**
 * Quick check: can user use cultural adaptation?
 */
export async function canUseCulturalCheck() {
  const perms = await getPermissions();
  return perms.canUseCulturalCheck;
}

/**
 * Quick check: can user favorite items?
 */
export async function canFavorite() {
  const perms = await getPermissions();
  return perms.canFavorite;
}

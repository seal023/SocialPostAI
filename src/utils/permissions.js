// ============================================================
// Permissions — Feature access control based on subscription tier
// Trial: all features except avatar/username editing, no Pro badge
// Pro: everything unlocked + Pro badge
// Free: limited features, 3 generations/day, 7-day history
// ============================================================

import { getSubscriptionStatus } from './storage';

/**
 * Get the current permission set based on subscription status.
 * @returns {Promise<{tier: string, canEditProfile: boolean, canUseVoice: boolean, canUseBrandVoice: boolean, canUseCulturalCheck: boolean, canFavorite: boolean, historyRetentionDays: number, showProBadge: boolean, dailyLimit: number}>}
 */
export async function getPermissions() {
  const status = await getSubscriptionStatus();

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

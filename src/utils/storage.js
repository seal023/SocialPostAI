// ============================================================
// AsyncStorage wrapper for SocialPostAI_V2
// Persists history, favorites, and user preferences
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  HISTORY: '@SocialPostAI:history',
  FAVORITES: '@SocialPostAI:favorites',
  PREFERENCES: '@SocialPostAI:preferences',
  BRAND_VOICE: '@SocialPostAI:brandVoice',
  INSTALL_DATE: '@SocialPostAI:installDate',
  SUBSCRIPTION_STATUS: '@SocialPostAI:subscriptionStatus',
  DAILY_USAGE: '@SocialPostAI:dailyUsage',
  USER_PROFILE: '@SocialPostAI:userProfile',
  API_KEYS: '@SocialPostAI:apiKeys',
};

// ---- History operations ----

export async function saveHistory(record) {
  try {
    const existing = await getHistory();
    const updated = [record, ...existing];
    await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

export async function getHistory() {
  try {
    const data = await AsyncStorage.getItem(KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get history:', error);
    return [];
  }
}

export async function deleteHistory(id) {
  try {
    const existing = await getHistory();
    const updated = existing.filter((item) => item.id !== id);
    await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to delete history:', error);
  }
}

export async function deleteHistoryBatch(ids) {
  try {
    const existing = await getHistory();
    const idSet = new Set(ids);
    // Only delete unfavorited items that match the IDs
    const updated = existing.filter((item) => {
      if (!idSet.has(item.id)) return true;
      if (item.isFavorite) return true; // Keep favorited items
      return false; // Delete only unfavorited matched items
    });
    const deletedCount = existing.length - updated.length;
    await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
    return deletedCount;
  } catch (error) {
    console.error('Failed to delete history batch:', error);
    return 0;
  }
}

export async function clearHistory() {
  try {
    const existing = await getHistory();
    const unfavorited = existing.filter((item) => !item.isFavorite);
    const favorited = existing.filter((item) => item.isFavorite);
    // Only clear unfavorited items; keep favorites intact
    await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(favorited));
    return { deletedCount: unfavorited.length, keptCount: favorited.length };
  } catch (error) {
    console.error('Failed to clear history:', error);
    return { deletedCount: 0, keptCount: 0 };
  }
}

export async function updateHistory(id, updates) {
  try {
    const existing = await getHistory();
    const updated = existing.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to update history:', error);
  }
}

// ---- Favorites operations ----

export async function toggleFavorite(id) {
  try {
    const existing = await getHistory();
    const item = existing.find((entry) => entry.id === id);
    if (!item) return;

    const newFavoriteStatus = !item.isFavorite;
    const updated = existing.map((entry) =>
      entry.id === id ? { ...entry, isFavorite: newFavoriteStatus } : entry
    );
    await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));

    // Sync favorites key
    const favorites = updated.filter((entry) => entry.isFavorite);
    await AsyncStorage.setItem(KEYS.FAVORITES, JSON.stringify(favorites));
  } catch (error) {
    console.error('Failed to toggle favorite:', error);
  }
}

export async function getFavorites() {
  try {
    // Always derive favorites from HISTORY to ensure consistency
    const history = await getHistory();
    return history.filter((item) => item.isFavorite);
  } catch (error) {
    console.error('Failed to get favorites:', error);
    return [];
  }
}

// ---- Preferences operations ----

const DEFAULT_PREFERENCES = {
  theme: 'pink',
  style: 'lively',
  tone: 5,
  wordCount: 180,
};

export async function savePreference(preferences) {
  try {
    const existing = await getPreference();
    const merged = { ...existing, ...preferences };
    await AsyncStorage.setItem(KEYS.PREFERENCES, JSON.stringify(merged));
  } catch (error) {
    console.error('Failed to save preference:', error);
  }
}

export async function getPreference() {
  try {
    const data = await AsyncStorage.getItem(KEYS.PREFERENCES);
    return data ? { ...DEFAULT_PREFERENCES, ...JSON.parse(data) } : DEFAULT_PREFERENCES;
  } catch (error) {
    console.error('Failed to get preference:', error);
    return DEFAULT_PREFERENCES;
  }
}

// ---- Usage stats ----

export async function getUsageStats() {
  try {
    const history = await getHistory();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const today = history.filter((item) => item.createdAt >= todayStart).length;
    const month = history.filter((item) => item.createdAt >= monthStart).length;
    const total = history.length;

    return { today, month, total };
  } catch (error) {
    console.error('Failed to get usage stats:', error);
    return { today: 0, month: 0, total: 0 };
  }
}

export async function getRemainingCount() {
  // Delegated to subscription.js — kept for backward compatibility
  const { getRemainingCount: subGetRemaining } = require('./subscription');
  return subGetRemaining();
}

// ---- Subscription data operations ----

export async function getInstallDate() {
  try {
    return await AsyncStorage.getItem(KEYS.INSTALL_DATE);
  } catch (error) {
    console.error('Failed to get install date:', error);
    return null;
  }
}

export async function saveInstallDate(dateStr) {
  try {
    await AsyncStorage.setItem(KEYS.INSTALL_DATE, dateStr);
  } catch (error) {
    console.error('Failed to save install date:', error);
  }
}

export async function getSubscriptionStatus() {
  try {
    const data = await AsyncStorage.getItem(KEYS.SUBSCRIPTION_STATUS);
    return data || 'trial';
  } catch (error) {
    console.error('Failed to get subscription status:', error);
    return 'trial';
  }
}

export async function saveSubscriptionStatus(status) {
  try {
    await AsyncStorage.setItem(KEYS.SUBSCRIPTION_STATUS, status);
  } catch (error) {
    console.error('Failed to save subscription status:', error);
  }
}

export async function getDailyUsage() {
  try {
    const data = await AsyncStorage.getItem(KEYS.DAILY_USAGE);
    return data ? JSON.parse(data) : { date: '', count: 0 };
  } catch (error) {
    console.error('Failed to get daily usage:', error);
    return { date: '', count: 0 };
  }
}

export async function saveDailyUsage(usageObj) {
  try {
    await AsyncStorage.setItem(KEYS.DAILY_USAGE, JSON.stringify(usageObj));
  } catch (error) {
    console.error('Failed to save daily usage:', error);
  }
}

export async function getUserProfile() {
  try {
    const data = await AsyncStorage.getItem(KEYS.USER_PROFILE);
    return data ? JSON.parse(data) : { avatarUri: '', username: '' };
  } catch (error) {
    console.error('Failed to get user profile:', error);
    return { avatarUri: '', username: '' };
  }
}

export async function saveUserProfile(profile) {
  try {
    const existing = await getUserProfile();
    const merged = { ...existing, ...profile };
    await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(merged));
  } catch (error) {
    console.error('Failed to save user profile:', error);
  }
}

// ---- Brand Voice Learning operations ----

/**
 * Save brand voice samples (3-5 copy examples that define the user's tone)
 * @param {string[]} samples - Array of copy text strings
 */
export async function saveBrandVoiceSamples(samples) {
  try {
    // Validate: keep only non-empty strings, max 5
    const valid = samples.filter((s) => typeof s === 'string' && s.trim().length > 5).slice(0, 5);
    await AsyncStorage.setItem(KEYS.BRAND_VOICE, JSON.stringify(valid));
    return true;
  } catch (error) {
    console.error('Failed to save brand voice samples:', error);
    return false;
  }
}

/**
 * Get saved brand voice samples
 * @returns {Promise<string[]>} Array of sample texts (empty array if none)
 */
export async function getBrandVoiceSamples() {
  try {
    const data = await AsyncStorage.getItem(KEYS.BRAND_VOICE);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get brand voice samples:', error);
    return [];
  }
}

/**
 * Clear all brand voice samples
 */
export async function clearBrandVoiceSamples() {
  try {
    await AsyncStorage.removeItem(KEYS.BRAND_VOICE);
    return true;
  } catch (error) {
    console.error('Failed to clear brand voice samples:', error);
    return false;
  }
}

/**
 * Check if brand voice is configured (has at least 2 samples)
 * @returns {Promise<boolean>}
 */
export async function hasBrandVoiceConfigured() {
  const samples = await getBrandVoiceSamples();
  return samples.length >= 2;
}

export default {};

// ---- Runtime API Key storage (dev/testing only) ----
// Allows overriding EXPO_PUBLIC_* env vars at runtime without rebuilding

export async function saveApiKey(provider, apiKey) {
  try {
    const existing = await getApiKeys();
    const updated = { ...existing, [provider]: apiKey };
    await AsyncStorage.setItem(KEYS.API_KEYS, JSON.stringify(updated));
    console.log(`[Storage] Saved API key for "${provider}" (len=${apiKey?.length || 0})`);
    return true;
  } catch (error) {
    console.error('Failed to save API key:', error);
    return false;
  }
}

export async function getApiKeys() {
  try {
    const data = await AsyncStorage.getItem(KEYS.API_KEYS);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Failed to get API keys:', error);
    return {};
  }
}

export async function getApiKey(provider) {
  const keys = await getApiKeys();
  return keys[provider] || '';
}

export async function clearApiKey(provider) {
  try {
    const existing = await getApiKeys();
    delete existing[provider];
    await AsyncStorage.setItem(KEYS.API_KEYS, JSON.stringify(existing));
    return true;
  } catch (error) {
    console.error('Failed to clear API key:', error);
    return false;
  }
}

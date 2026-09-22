// ============================================================
// AppleAuthService — Sign in with Apple integration
// Uses expo-apple-authentication for identity verification
// Stores identityToken and userIdentifier in AsyncStorage
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEYS = {
  APPLE_IDENTITY_TOKEN: '@SocialPostAI:appleIdentityToken',
  APPLE_USER_ID: '@SocialPostAI:appleUserId',
  APPLE_EMAIL: '@SocialPostAI:appleEmail',
  APPLE_NAME: '@SocialPostAI:appleName',
  APPLE_LOGIN_DATE: '@SocialPostAI:appleLoginDate',
  // Explicit session marker. Written on every successful sign-in; the single
  // source of truth for "this device already linked an Apple ID" so a session
  // can never be lost because an optional field came back null.
  APPLE_LOGGED_IN: '@SocialPostAI:appleLoggedIn',
};

// Dynamic import — expo-apple-authentication only works on iOS with dev build
let AppleAuth = null;
try {
  AppleAuth = require('expo-apple-authentication');
} catch (e) {
  AppleAuth = null;
}

/**
 * Check if Apple Authentication is available.
 * Requires iOS and expo-apple-authentication module.
 */
export function isAppleAuthAvailable() {
  return Platform.OS === 'ios' && AppleAuth !== null;
}

/**
 * Sign in with Apple.
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function signInWithApple() {
  if (!isAppleAuthAvailable()) {
    return {
      success: false,
      error: 'Apple Authentication is only available on iOS devices.',
    };
  }

  try {
    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });

    // ⚠️ Root cause (2026-09-16) — "每次打开 App 都要重新刷脸登录":
    // expo-apple-authentication returns the stable Apple user identifier in
    // `credential.user`. There is NO `userIdentifier` field on
    // AppleAuthenticationCredential (see
    // node_modules/expo-apple-authentication/build/AppleAuthentication.types.d.ts:117).
    // The old code read `credential.userIdentifier` → always undefined → we
    // persisted '' → getAppleAuthState() saw an empty user id and reported
    // "not logged in" on EVERY relaunch, forcing a fresh Face ID sign-in.
    const userId = credential.user || credential.userIdentifier || '';

    // email / fullName are delivered ONLY on the user's FIRST authorization;
    // every later sign-in returns null for both. Never clobber what we have.
    const prevEmail = await AsyncStorage.getItem(KEYS.APPLE_EMAIL);
    const prevName = await AsyncStorage.getItem(KEYS.APPLE_NAME);
    const email = credential.email || prevEmail || '';
    const fullName = credential.fullName
      ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
      : (prevName || '');

    const userInfo = {
      identityToken: credential.identityToken || '',
      userIdentifier: userId,
      email,
      fullName,
      loginDate: Date.now(),
    };

    // Persist to AsyncStorage
    await AsyncStorage.setItem(KEYS.APPLE_IDENTITY_TOKEN, userInfo.identityToken);
    await AsyncStorage.setItem(KEYS.APPLE_USER_ID, userInfo.userIdentifier);
    await AsyncStorage.setItem(KEYS.APPLE_EMAIL, userInfo.email);
    await AsyncStorage.setItem(KEYS.APPLE_NAME, userInfo.fullName);
    await AsyncStorage.setItem(KEYS.APPLE_LOGIN_DATE, String(userInfo.loginDate));
    await AsyncStorage.setItem(KEYS.APPLE_LOGGED_IN, '1');

    console.log('[AppleAuth] Sign in successful, user:', userInfo.userIdentifier);
    return { success: true, user: userInfo };
  } catch (error) {
    console.error('[AppleAuth] Sign in failed:', error);

    // User cancelled — don't show error
    if (error.code === 'ERR_AUTH_CANCELED') {
      return { success: false, error: 'cancelled' };
    }

    return {
      success: false,
      error: error.message || 'Sign in failed',
    };
  }
}

/**
 * Get the current Apple ID login state.
 * @returns {Promise<{isLoggedIn: boolean, user?: object}>}
 */
export async function getAppleAuthState() {
  try {
    const userId = await AsyncStorage.getItem(KEYS.APPLE_USER_ID);
    const loggedInFlag = await AsyncStorage.getItem(KEYS.APPLE_LOGGED_IN);
    // Legacy fallback: builds before 2026-09-16 stored the user id under a
    // non-existent field (''), but did persist the identityToken. Accept it so
    // upgrading users are not forced through one more sign-in.
    const identityToken = await AsyncStorage.getItem(KEYS.APPLE_IDENTITY_TOKEN);

    // A session is valid when we hold a stable Apple user id, the explicit
    // logged-in marker, or (legacy) an identity token. `identityToken` must NOT
    // be *required* on its own terms: Apple returns null for it on repeat
    // authorizations, and requiring both fields is what made the app forget the
    // login on every launch.
    const hasSession =
      (typeof userId === 'string' && userId.length > 0) ||
      loggedInFlag === '1' ||
      (typeof identityToken === 'string' && identityToken.length > 0);

    if (hasSession) {
      return {
        isLoggedIn: true,
        user: {
          identityToken: identityToken || '',
          userIdentifier: userId || '',
          email: await AsyncStorage.getItem(KEYS.APPLE_EMAIL) || '',
          fullName: await AsyncStorage.getItem(KEYS.APPLE_NAME) || '',
          loginDate: parseInt(await AsyncStorage.getItem(KEYS.APPLE_LOGIN_DATE) || '0', 10),
        },
      };
    }

    return { isLoggedIn: false };
  } catch (error) {
    console.error('[AppleAuth] Get auth state failed:', error);
    return { isLoggedIn: false };
  }
}

/**
 * Sign out — clears stored Apple ID credentials.
 */
export async function signOutApple() {
  try {
    await AsyncStorage.removeItem(KEYS.APPLE_IDENTITY_TOKEN);
    await AsyncStorage.removeItem(KEYS.APPLE_USER_ID);
    await AsyncStorage.removeItem(KEYS.APPLE_EMAIL);
    await AsyncStorage.removeItem(KEYS.APPLE_NAME);
    await AsyncStorage.removeItem(KEYS.APPLE_LOGIN_DATE);
    await AsyncStorage.removeItem(KEYS.APPLE_LOGGED_IN);
    console.log('[AppleAuth] Signed out');
  } catch (error) {
    console.error('[AppleAuth] Sign out failed:', error);
  }
}

/**
 * Delete the user's account and ALL associated local data.
 *
 * Apple Guideline 5.1.1(v) requires apps that support account creation to
 * offer an in-app account-deletion path — signing out is NOT sufficient.
 * This app has NO cloud backend (all state lives in AsyncStorage), so deleting
 * the account means wiping every `@SocialPostAI:*` key on the device: Apple
 * credentials, subscription/receipt cache, Pro status, history, favorites,
 * brand voice, preferences, diagnostics, etc. This is a full, irreversible
 * reset that returns the app to a first-launch state.
 *
 * Note: an active App Store subscription is managed by Apple, not by this
 * local data; deletion does NOT cancel it. The caller must surface that to the
 * user (see delete_account_confirm copy).
 *
 * @returns {Promise<{success: boolean, cleared?: number, error?: string}>}
 */
export async function deleteAppleAccount() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const appKeys = (allKeys || []).filter(
      (k) => typeof k === 'string' && k.startsWith('@SocialPostAI:')
    );
    if (appKeys.length > 0) {
      await AsyncStorage.multiRemove(appKeys);
    }
    console.log('[AppleAuth] Account deleted, cleared local keys:', appKeys.length);
    return { success: true, cleared: appKeys.length };
  } catch (error) {
    console.error('[AppleAuth] Delete account failed:', error);
    return { success: false, error: error?.message || 'Delete account failed' };
  }
}

/**
 * Get the Apple ID user identifier (for unique user identification).
 * @returns {Promise<string|null>}
 */
export async function getAppleUserId() {
  try {
    return await AsyncStorage.getItem(KEYS.APPLE_USER_ID);
  } catch (error) {
    console.error('[AppleAuth] Get user ID failed:', error);
    return null;
  }
}

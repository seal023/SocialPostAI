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

    const userInfo = {
      identityToken: credential.identityToken,
      userIdentifier: credential.userIdentifier,
      email: credential.email || '',
      fullName: credential.fullName
        ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
        : '',
      loginDate: Date.now(),
    };

    // Persist to AsyncStorage
    await AsyncStorage.setItem(KEYS.APPLE_IDENTITY_TOKEN, userInfo.identityToken || '');
    await AsyncStorage.setItem(KEYS.APPLE_USER_ID, userInfo.userIdentifier || '');
    await AsyncStorage.setItem(KEYS.APPLE_EMAIL, userInfo.email || '');
    await AsyncStorage.setItem(KEYS.APPLE_NAME, userInfo.fullName || '');
    await AsyncStorage.setItem(KEYS.APPLE_LOGIN_DATE, String(userInfo.loginDate));

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
    const token = await AsyncStorage.getItem(KEYS.APPLE_IDENTITY_TOKEN);
    const userId = await AsyncStorage.getItem(KEYS.APPLE_USER_ID);

    if (token && userId) {
      return {
        isLoggedIn: true,
        user: {
          identityToken: token,
          userIdentifier: userId,
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
    console.log('[AppleAuth] Signed out');
  } catch (error) {
    console.error('[AppleAuth] Sign out failed:', error);
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

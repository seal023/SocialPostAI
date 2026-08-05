// ============================================================
// LoginScreen — Apple ID login gate
// Shown on app launch if user hasn't signed in with Apple ID
// ============================================================

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SHADOWS, getTheme } from '../themes/theme';
import { useLanguage } from '../context/LanguageContext';
import { signInWithApple, isAppleAuthAvailable } from '../services/AppleAuthService';

const TERMS_URL = 'https://seal023.github.io/terms-of-service/';
const PRIVACY_URL = 'https://seal023.github.io/privacy-policy/';

export default function LoginScreen({ onLoginSuccess, themeName }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const theme = getTheme(themeName || 'pink');

  const handleSignIn = async () => {
    if (!agreed) return;
    setLoading(true);
    try {
      const result = await signInWithApple();
      if (result.success) {
        onLoginSuccess();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        {/* App Title */}
        <Text style={[styles.title, { color: theme.title }]}>
          {t('login_title')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.placeholder }]}>
          {t('login_subtitle')}
        </Text>

        {/* Agreement Checkbox */}
        <View style={styles.agreementRow}>
          <TouchableOpacity
            style={[
              styles.checkbox,
              {
                borderColor: agreed ? theme.primary : theme.border,
                backgroundColor: agreed ? theme.primary : 'transparent',
              },
            ]}
            onPress={() => setAgreed(!agreed)}
            activeOpacity={0.7}
          >
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
          <Text style={[styles.agreementText, { color: theme.placeholder }]}>
            By continuing, you agree to our{' '}
            <Text
              style={{ color: theme.primary }}
              onPress={() => Linking.openURL(TERMS_URL)}
            >
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text
              style={{ color: theme.primary }}
              onPress={() => Linking.openURL(PRIVACY_URL)}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>

        {/* Apple Sign In Button */}
        {isAppleAuthAvailable() ? (
          <TouchableOpacity
            style={[
              styles.appleBtn,
              !agreed && { backgroundColor: '#CCCCCC' },
            ]}
            onPress={handleSignIn}
            disabled={loading || !agreed}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.appleIcon}></Text>
                <Text style={styles.appleBtnText}>
                  {t('sign_in_with_apple')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.appleBtn,
              { backgroundColor: agreed ? theme.primary : '#CCCCCC' },
            ]}
            onPress={agreed ? onLoginSuccess : undefined}
            disabled={!agreed}
            activeOpacity={0.7}
          >
            <Text style={styles.appleBtnText}>
              {t('login_subtitle')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Privacy & Terms */}
        <Text style={[styles.termsText, { color: theme.placeholder }]}>
          {t('login_terms')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    marginBottom: SPACING.xxl,
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    maxWidth: 320,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    marginTop: 2,
    marginRight: SPACING.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  agreementText: {
    fontSize: 13,
    flex: 1,
    flexWrap: 'wrap',
    lineHeight: 18,
  },
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    minWidth: 240,
    ...SHADOWS.card,
  },
  appleIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  appleBtnText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  termsText: {
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    lineHeight: 16,
  },
});

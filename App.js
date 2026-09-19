// ============================================================
// App.js — SocialPost AI root entry
// 3-Tab navigation (Generate / History / Profile)
// Global theme + language state synced across all screens
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Platform, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS, setStyleTheme, getTheme } from './src/themes/theme';
import { getPreference, savePreference } from './src/utils/storage';
import {
  initSubscription,
  getSubscriptionState,
  verifySubscriptionOnLaunch,
  cleanupIAPResources,
} from './src/utils/subscription';
import { initCurrentModel } from './src/services/ModelAdapter';
import { getAppleAuthState } from './src/services/AppleAuthService';
import { LanguageProvider, useLanguage } from './src/context/LanguageContext';
import ErrorBoundary from './src/components/ErrorBoundary';

import GenerateScreen from './src/screens/GenerateScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LoginScreen from './src/screens/LoginScreen';

const Tab = createBottomTabNavigator();

// iPad 上把内容约束为手机宽度并居中、两侧露出背景色（留白），
// 与 App Store 截图的观感一致；iPhone 仍铺满全屏、行为不变。
const TABLET_MAX_WIDTH = 500;

function TabletFrame({ children, bg }) {
  if (!(Platform.OS === 'ios' && Platform.isPad)) {
    return <>{children}</>;
  }
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: TABLET_MAX_WIDTH,
          alignSelf: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

function AppNavigator() {
  const [themeName, setThemeName] = useState('pink');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const { t } = useLanguage();

  // Ref to always access latest t() without re-triggering useEffect
  const tRef = useRef(t);
  tRef.current = t;

  // Ref to show the JS fatal diagnostic alert only once per session
  const jsFatalAlertShownRef = useRef(false);

  // Load saved theme and model on mount (runs once — no t dependency to avoid re-runs)
  useEffect(() => {
    const lt = tRef.current; // capture latest t at mount time
    (async () => {
     try {
      // ---- 1) Restore the Apple ID session FIRST ----
      // This MUST run before any StoreKit/subscription step. On device those can
      // hang indefinitely (StoreKit never settles while no App Store account is
      // signed in) or throw; while they sat ahead of this line, a stuck IAP call
      // meant we never reached it → the app showed the sign-in gate on EVERY
      // launch even though the Apple session was already stored on disk.
      try {
        const authState = await getAppleAuthState();
        setIsLoggedIn(authState.isLoggedIn);
      } catch (authError) {
        console.error('[App] Auth state restore failed:', authError);
      }

      // ---- 2) Subscription bootstrap (best-effort — never gates the login gate) ----
      try {
        // Initialize subscription system
        await initSubscription();

        // NOTE: IAP initialization (initIAPIntegration) removed from launch path.
        // StoreKit calls at startup (initConnection / getAvailablePurchases) throw a
        // native exception on iOS 26 → SIGABRT crash. IAP is now lazily initialized
        // when the user opens the Profile screen (see ProfileScreen loadData).

        // Verify subscription state on relaunch (checks cached receipt)
        await verifySubscriptionOnLaunch();
      } catch (subError) {
        console.error('[App] Subscription bootstrap failed (non-fatal):', subError);
      }

      const prefs = await getPreference();
      if (prefs.theme) {
        // Only map truly legacy names (deepBlue/purple → minimal)
        // 'pink' stays as 'pink' (it's the default legacy theme)
        const legacyMap = { deepBlue: 'minimal', purple: 'minimal' };
        const mappedTheme = legacyMap[prefs.theme] || prefs.theme;
        setStyleTheme(mappedTheme);
        setThemeName(mappedTheme);
        // Persist the mapped theme name
        if (mappedTheme !== prefs.theme) {
          await savePreference({ theme: mappedTheme });
        }
      }
      await initCurrentModel();
      setIsReady(true);

      // ---- JS fatal diagnostic alert (build 9 platform-bug workaround) ----
      // index.js 的 JSFatalGuard 把被拦截的 JS 错误写入了 AsyncStorage。
      // 这里在启动后读取并弹窗展示最新一条，方便在真机上截图反馈错误详情
      // （Release 构建下 console 输出不可见，AsyncStorage 是可靠通道）。
      // NOTE: 只在 __DEV__ 模式显示；生产构建清空历史记录避免旧错误反复弹窗。
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const raw = await AsyncStorage.getItem('@SocialPostAI:jsFatalErrors');
        if (raw) {
          if (__DEV__ && !jsFatalAlertShownRef.current) {
            const list = JSON.parse(raw);
            const latest = Array.isArray(list) && list.length > 0 ? list[0] : null;
            if (latest) {
              jsFatalAlertShownRef.current = true;
              const shortStack = (latest.stack || '')
                .split('\n')
                .slice(0, 8)
                .join('\n');
              setTimeout(() => {
                Alert.alert(
                  'Diagnostic: JS error intercepted',
                  `[${latest.fatal ? 'fatal' : 'soft'}][${latest.via || 'engine'}]\n${latest.name}: ${latest.message}\n\n${shortStack}\n\n(sent via AsyncStorage, shown once)`,
                  [{ text: 'OK' }],
                  { cancelable: false },
                );
              }, 3000);
            }
          }
          // Always clear old errors so they don't show again on next launch
          await AsyncStorage.removeItem('@SocialPostAI:jsFatalErrors');
        }
      } catch (e) {
        // Diagnostics are best-effort; never break startup
      }

      // ---- Native RCTFatal log (from config plugin) ----
      // The native RCTFatalHandler in AppDelegate writes intercepted errors
      // to Documents/rct_fatal_log.json. Read it here and show a diagnostic
      // alert so we can see the actual JS error that was caught.
      // NOTE: only show in __DEV__; in Release, just delete the file silently
      // so old errors never bother end users.
      try {
        const fatalLogUri = FileSystem.documentDirectory + 'rct_fatal_log.json';
        const fileInfo = await FileSystem.getInfoAsync(fatalLogUri);
        if (fileInfo.exists) {
          if (__DEV__ && !jsFatalAlertShownRef.current) {
            const content = await FileSystem.readAsStringAsync(fatalLogUri);
            const nativeError = JSON.parse(content);
            jsFatalAlertShownRef.current = true;
            setTimeout(() => {
              Alert.alert(
                'Diagnostic: Native RCTFatal intercepted',
                `[${nativeError.via || 'native'}]\n${nativeError.message || '(no message)'}\n\n${(nativeError.formatted || '').slice(0, 500)}\n\n(from rct_fatal_log.json, shown once)`,
                [{ text: 'OK' }],
                { cancelable: false },
              );
            }, 3500);
          }
          // Always delete the file (both DEV and Release) so it doesn't show again
          await FileSystem.deleteAsync(fatalLogUri, { idempotent: true });
        }
      } catch (e) {
        // Best-effort
      }

      // ---- Tiered trial expiry reminder (TRIAL_DAYS = 7) ----
      //  days = 7,6,5,4 → no alert popup (the profile badge already shows countdown)
      //  days = 3,2,1   → alert popup (remind later + upgrade pro)
      //  days = 0       → FORCE alert popup (cancelable=false, only upgrade pro)
      const subState = await getSubscriptionState();
      if (subState.status === 'trial') {
        const days = subState.trialDaysLeft;
        console.log('[App] Trial state — daysLeft:', days);

        if (days === 0) {
          // --- Last day ---  force alert, cannot be dismissed
          setTimeout(() => {
            Alert.alert(
              lt('trial_expired_title'),
              lt('trial_remind_last_day'),
              [
                {
                  text: lt('upgrade_pro'),
                },
              ],
              { cancelable: false },
            );
          }, 2500);
        } else if (days <= 3 && days >= 1) {
          // --- 3, 2, 1 days left --- normal alert, can postpone
          setTimeout(() => {
            Alert.alert(
              lt('trial_expired_title'),
              lt('trial_remind_3_1', { days }),
              [
                {
                  text: lt('remind_later'),
                  style: 'cancel',
                },
                {
                  text: lt('upgrade_pro'),
                },
              ],
              { cancelable: true },
            );
          }, 2500);
        }
        // days 4..7: silent (user sees the "X days left" badge in ProfileScreen)
      }

      // Check trial expired — show popup on first open after trial ends
      if (subState.status === 'free' && !prefs.trialExpiredShown) {
        setTimeout(() => {
          Alert.alert(
            lt('trial_expired_title'),
            lt('trial_expired_desc'),
            [
              {
                text: lt('continue_free'),
                style: 'cancel',
                onPress: async () => {
                  await savePreference({ trialExpiredShown: true });
                },
              },
              {
                text: lt('upgrade_pro'),
                onPress: async () => {
                  await savePreference({ trialExpiredShown: true });
                },
              },
            ],
            { cancelable: false },
          );
        }, 2000);
      }

      // Show data storage notice on first launch (before AI disclaimer)
      if (!prefs.dataStorageNoticeShown) {
        setTimeout(() => {
          Alert.alert(
            lt('data_storage_title'),
            lt('data_storage_desc'),
            [
              {
                text: lt('data_storage_ok'),
                onPress: async () => {
                  await savePreference({ dataStorageNoticeShown: true });

                  // After data storage notice, show AI disclaimer
                  if (!prefs.aiDisclaimerShown) {
                    setTimeout(() => {
                      Alert.alert(
                        lt('ai_disclaimer_title'),
                        lt('ai_disclaimer_desc'),
                        [
                          {
                            text: lt('ai_disclaimer_ok'),
                            onPress: async () => {
                              await savePreference({ aiDisclaimerShown: true });
                            },
                          },
                        ],
                        { cancelable: false },
                      );
                    }, 500);
                  }
                },
              },
            ],
            { cancelable: false },
          );
        }, 1000);
      } else if (!prefs.aiDisclaimerShown) {
        // Show AI disclaimer on first launch (if data storage notice already shown)
        setTimeout(() => {
          Alert.alert(
            lt('ai_disclaimer_title'),
            lt('ai_disclaimer_desc'),
            [
              {
                text: lt('ai_disclaimer_ok'),
                onPress: async () => {
                  await savePreference({ aiDisclaimerShown: true });
                },
              },
            ],
            { cancelable: false },
          );
        }, 1000);
      }
     } catch (startupError) {
       // Catch-all: any unhandled rejection in the startup chain would otherwise
       // bubble to React 19 onUncaughtError → ExceptionsManager.reportException
       // → RCTFatal → crash (on iOS 26 + Release). Log it and proceed.
       console.error('[App] Startup error caught:', startupError);
       // Ensure the app still renders instead of hanging on a blank screen
       setIsReady(true);
     }
    })();

    // Cleanup IAP listeners on unmount
    return () => {
      cleanupIAPResources();
    };
  }, []);

  // Theme change handler
  const handleThemeChange = useCallback(async (newTheme) => {
    const STYLE_NAMES = ['sciFi', 'dreamy', 'cartoon', 'minimal'];
    if (STYLE_NAMES.includes(newTheme)) {
      setStyleTheme(newTheme);
    }
    setThemeName(newTheme);
    await savePreference({ theme: newTheme });
  }, []);

  const theme = getTheme(themeName);

  // Show login screen if not logged in
  if (isReady && !isLoggedIn) {
    return (
      <TabletFrame bg={theme.background}>
        <LoginScreen
          themeName={themeName}
          onLoginSuccess={() => setIsLoggedIn(true)}
        />
      </TabletFrame>
    );
  }

  return (
    <TabletFrame bg={theme.background}>
    <NavigationContainer
      theme={{
        dark: theme.isDark || false,
        colors: {
          primary: theme.primary,
          background: theme.background,
          card: theme.card,
          text: theme.title,
          border: theme.border,
          notification: theme.primary,
        },
        fonts: {
          medium: { fontFamily: 'System', fontWeight: '600' },
          regular: { fontFamily: 'System', fontWeight: '400' },
          bold: { fontFamily: 'System', fontWeight: '700' },
        },
      }}
    >
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            if (route.name === 'Generate') {
              iconName = focused ? 'sparkles' : 'sparkles-outline';
            } else if (route.name === 'History') {
              iconName = focused ? 'time' : 'time-outline';
            } else if (route.name === 'Profile') {
              iconName = focused ? 'person' : 'person-outline';
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.isDark ? theme.textTertiary || '#556688' : '#B0B0B8',
          tabBarStyle: {
            backgroundColor: theme.isDark ? theme.cardAlt || theme.card : '#FFFFFF',
            borderTopWidth: 0,
            height: 60,
            paddingBottom: 8,
            paddingTop: 4,
            borderRadius: 20,
            marginHorizontal: 16,
            marginBottom: 8,
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 0,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 5,
          },
          headerShown: false,
        })}
      >
        <Tab.Screen
          name="Generate"
          options={{ tabBarLabel: t('tab_generate') }}
        >
          {(props) => (
            <GenerateScreen {...props} themeName={themeName} />
          )}
        </Tab.Screen>
        <Tab.Screen
          name="History"
          options={{ tabBarLabel: t('tab_history') }}
        >
          {(props) => (
            <HistoryScreen {...props} themeName={themeName} />
          )}
        </Tab.Screen>
        <Tab.Screen
          name="Profile"
          options={{ tabBarLabel: t('tab_profile') }}
        >
          {(props) => (
            <ProfileScreen
              {...props}
              themeName={themeName}
              onThemeChange={handleThemeChange}
              onSignOut={() => setIsLoggedIn(false)}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
    </TabletFrame>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AppNavigator />
        </ErrorBoundary>
      </SafeAreaProvider>
    </LanguageProvider>
  );
}

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
import { Alert } from 'react-native';
import { COLORS, setStyleTheme, getTheme } from './src/themes/theme';
import { getPreference, savePreference } from './src/utils/storage';
import {
  initSubscription,
  getSubscriptionState,
  initIAPIntegration,
  verifySubscriptionOnLaunch,
  cleanupIAPResources,
} from './src/utils/subscription';
import { initCurrentModel } from './src/services/ModelAdapter';
import { getAppleAuthState } from './src/services/AppleAuthService';
import { LanguageProvider, useLanguage } from './src/context/LanguageContext';

import GenerateScreen from './src/screens/GenerateScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LoginScreen from './src/screens/LoginScreen';

const Tab = createBottomTabNavigator();

function AppNavigator() {
  const [themeName, setThemeName] = useState('pink');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const { t } = useLanguage();

  // Ref to always access latest t() without re-triggering useEffect
  const tRef = useRef(t);
  tRef.current = t;

  // Load saved theme and model on mount (runs once — no t dependency to avoid re-runs)
  useEffect(() => {
    const lt = tRef.current; // capture latest t at mount time
    (async () => {
      // Initialize subscription system
      await initSubscription();

      // Initialize IAP integration (registers callbacks + connects to StoreKit / Google Play)
      // Non-fatal if it fails — app continues to work in trial/free mode
      await initIAPIntegration();

      // Verify subscription state on relaunch (checks cached receipt)
      await verifySubscriptionOnLaunch();

      // Check Apple ID login status
      const authState = await getAppleAuthState();
      setIsLoggedIn(authState.isLoggedIn);

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
      <LoginScreen
        themeName={themeName}
        onLoginSuccess={() => setIsLoggedIn(true)}
      />
    );
  }

  return (
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
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </LanguageProvider>
  );
}

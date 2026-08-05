// ============================================================
// LanguageContext — global language state with AsyncStorage
// Provides: language (interface), outputLanguage
// Usage: const { language, outputLanguage, setLanguage, setOutputLanguage, t } = useLanguage();
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t as translate, DEFAULT_LANGUAGE } from '../i18n/i18n';

const LANGUAGE_KEY = '@SocialPostAI:language';
const OUTPUT_LANGUAGE_KEY = '@SocialPostAI:outputLanguage';

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  outputLanguage: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  setOutputLanguage: () => {},
  t: (key, params) => key,
});

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);
  const [outputLanguage, setOutputLanguageState] = useState(DEFAULT_LANGUAGE);

  // Load saved language preferences on mount
  useEffect(() => {
    (async () => {
      try {
        const savedLang = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (savedLang === 'zh' || savedLang === 'en') {
          setLanguageState(savedLang);
        }
        const savedOutput = await AsyncStorage.getItem(OUTPUT_LANGUAGE_KEY);
        if (savedOutput === 'zh' || savedOutput === 'en') {
          setOutputLanguageState(savedOutput);
        }
      } catch (error) {
        console.error('Failed to load language preference:', error);
      }
    })();
  }, []);

  // Switch interface language and persist
  const setLanguage = useCallback(async (newLang) => {
    if (newLang !== 'en' && newLang !== 'zh') return;
    setLanguageState(newLang);
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, newLang);
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  }, []);

  // Switch output language and persist
  const setOutputLanguage = useCallback(async (newLang) => {
    if (newLang !== 'en' && newLang !== 'zh') return;
    setOutputLanguageState(newLang);
    try {
      await AsyncStorage.setItem(OUTPUT_LANGUAGE_KEY, newLang);
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  }, []);

  // Translation function bound to current interface language
  const t = useCallback((key, params) => {
    return translate(language, key, params);
  }, [language]);

  return (
    <LanguageContext.Provider
      value={{
        language,
        outputLanguage,
        setLanguage,
        setOutputLanguage,
        t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to access language context.
 * @returns {{ language: string, outputLanguage: string, setLanguage: Function, setOutputLanguage: Function, t: Function }}
 */
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export default LanguageContext;

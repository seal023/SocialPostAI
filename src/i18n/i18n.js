// ============================================================
// i18n — language configuration and translation utility
// Supports: en (default), zh
// ============================================================

import en from './locales/en';
import zh from './locales/zh';

const translations = { en, zh };

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'zh', label: '中文', nativeLabel: '中文' },
];

export const DEFAULT_LANGUAGE = 'en';

/**
 * Get a translated string by key.
 * Supports interpolation: t('remaining_today', { count: 8 }) → "Remaining 8 times / Today"
 *
 * @param {string} lang - Language code ('en' or 'zh')
 * @param {string} key - Translation key
 * @param {Object} [params] - Interpolation parameters
 * @returns {string} Translated string (falls back to English if key missing)
 */
export function t(lang, key, params) {
  const dict = translations[lang] || translations[DEFAULT_LANGUAGE];
  let text = dict[key];

  // Fallback to English if key not found in current language
  if (text === undefined) {
    text = translations[DEFAULT_LANGUAGE][key];
  }

  // Fallback to key itself if not found anywhere
  if (text === undefined) {
    return key;
  }

  // Interpolation: replace {param} with values
  if (params) {
    Object.keys(params).forEach((paramKey) => {
      text = text.replace(`{${paramKey}}`, params[paramKey]);
    });
  }

  return text;
}

/**
 * Get all translation keys for a language (useful for debugging)
 * @param {string} lang
 * @returns {Object}
 */
export function getTranslations(lang) {
  return translations[lang] || translations[DEFAULT_LANGUAGE];
}

export default { t, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE };

// ============================================================
// Model configuration — centralized provider registry
// Switch models by changing `current` or via ProfileScreen UI
// Adding a new model: ① create provider file ② register here
// ============================================================

export const MODEL_CONFIG = {
  // Currently active provider key — can be changed at runtime
  current: 'bailian',

providers: {
    bailian: {
      name: 'Alibaba Bailian',
      label: '阿里百炼',
      model: 'qwen3.7-plus',
      endpoint: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-746292e90c864a959c48e36e23b9912f',
      enabled: true,
      icon: '🟠',
      fallback: 'openai',
    },

    openai: {
      name: 'OpenAI',
      label: 'OpenAI',
      model: 'gpt-4.1',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY || '',
      enabled: false,
      icon: '🟢',
      fallback: 'deepseek',
    },

    claude: {
      name: 'Anthropic Claude',
      label: 'Claude',
      model: 'claude-sonnet-4-20250514',
      endpoint: 'https://api.anthropic.com/v1/messages',
      apiKey: process.env.EXPO_PUBLIC_CLAUDE_API_KEY || '',
      enabled: false,
      icon: '🟣',
      fallback: 'openai',
    },

    deepseek: {
      name: 'DeepSeek',
      label: 'DeepSeek',
      model: 'deepseek-chat',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY || '',
      enabled: false,
      icon: '🔵',
      fallback: 'bailian',
    },
  },
};

/**
 * Get the currently active provider config.
 * @returns {Object} Provider config object
 */
export function getCurrentProvider() {
  const key = MODEL_CONFIG.current;
  return MODEL_CONFIG.providers[key] || MODEL_CONFIG.providers.bailian;
}

/**
 * Set the current provider at runtime.
 * @param {string} providerKey - e.g., 'bailian', 'openai', 'claude', 'deepseek'
 */
export function setCurrentProvider(providerKey) {
  if (MODEL_CONFIG.providers[providerKey]) {
    MODEL_CONFIG.current = providerKey;
  } else {
    console.warn(`[Config] Unknown provider: ${providerKey}`);
  }
}

/**
 * Get all enabled providers for UI listing.
 * @returns {Array<{key: string, ...providerConfig}>}
 */
export function getEnabledProviders() {
  return Object.entries(MODEL_CONFIG.providers)
    .filter(([, config]) => config.enabled)
    .map(([key, config]) => ({ key, ...config }));
}

export default MODEL_CONFIG;

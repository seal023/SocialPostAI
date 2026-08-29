// ============================================================
// ModelAdapter — unified interface for all AI providers
// Business code only calls generateCopy() here.
// Switching models = changing config, zero business code changes.
// Auto-fallback to next provider on failure.
// ============================================================

import { MODEL_CONFIG, getCurrentProvider } from '../config/models';
import { getPreference } from '../utils/storage';
import { BailianProvider } from './providers/BailianProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { ClaudeProvider } from './providers/ClaudeProvider';
import { DeepSeekProvider } from './providers/DeepSeekProvider';

// Provider registry — maps config key → provider class
const PROVIDER_MAP = {
  bailian: BailianProvider,
  openai: OpenAIProvider,
  claude: ClaudeProvider,
  deepseek: DeepSeekProvider,
};

/**
 * Load saved model preference from AsyncStorage and sync to MODEL_CONFIG.
 * Also load runtime API key overrides from AsyncStorage (dev/testing).
 * Call this once on app startup (e.g., in App.js useEffect).
 */
export async function initCurrentModel() {
  try {
    // Import here to avoid circular dependency
    const { getApiKeys } = require('../utils/storage');

    const prefs = await getPreference();
    if (prefs.currentModel && MODEL_CONFIG.providers[prefs.currentModel]) {
      MODEL_CONFIG.current = prefs.currentModel;
      console.log(`[ModelAdapter] Loaded model preference: ${prefs.currentModel}`);
    }

    // ── Runtime API key override ──
    // If EXPO_PUBLIC_* env vars were empty at build time, try runtime keys from AsyncStorage.
    const runtimeKeys = await getApiKeys();
    const envFallbackMap = {
      bailian: ['EXPO_PUBLIC_BAILIAN_API_KEY', 'EXPO_PUBLIC_DASHSCOPE_API_KEY'],
      openai: ['EXPO_PUBLIC_OPENAI_API_KEY'],
      claude: ['EXPO_PUBLIC_CLAUDE_API_KEY'],
      deepseek: ['EXPO_PUBLIC_DEEPSEEK_API_KEY'],
    };

    Object.entries(MODEL_CONFIG.providers).forEach(([key, cfg]) => {
      const envKeys = envFallbackMap[key] || [];
      let envHasKey = envKeys.some(envName => {
        const v = process.env[envName];
        return v && v.length > 10;
      });

      if (!envHasKey && runtimeKeys[key] && runtimeKeys[key].length > 5) {
        cfg.apiKey = runtimeKeys[key];
      }
    });
  } catch (error) {
    console.error('[ModelAdapter] Failed to load model preference:', error);
  }
}

/**
 * Get a provider instance by key.
 * @param {string} providerKey
 * @returns {Object|null} Provider instance with generate() method
 */
function getProvider(providerKey) {
  const ProviderClass = PROVIDER_MAP[providerKey];
  if (!ProviderClass) {
    console.error(`[ModelAdapter] No provider class for key: ${providerKey}`);
    return null;
  }
  const config = MODEL_CONFIG.providers[providerKey];
  if (!config) {
    console.error(`[ModelAdapter] No config for key: ${providerKey}`);
    return null;
  }
  return new ProviderClass(config);
}

/**
 * Build the system prompt for social media copy generation.
 * Shared across all providers — ensures consistent prompt engineering.
 *
 * @param {string[]} platforms - Platform IDs
 * @param {string} style - Style ID
 * @param {number} tone - Tone 0-10
 * @param {number} wordCount - Target char count
 * @param {string[]} [brandVoiceSamples] - Optional brand voice reference texts
 * @returns {string} System prompt
 */
function buildSystemPrompt(platforms, style, tone, wordCount, brandVoiceSamples, outputLanguage = 'en', sceneContext) {
  const isZh = outputLanguage === 'zh';

  // ── Style maps (bilingual) ──
  const styleMap = isZh
    ? {
        formal: '正式、专业、权威',
        lively: '活泼、潮流、热情，使用表情符号和话题标签',
        elegant: '精致、优雅、简约',
        casual: '轻松、友好、像朋友对话',
      }
    : {
        formal: 'formal, professional, authoritative',
        lively: 'energetic, trendy, enthusiastic with emojis and hashtags',
        elegant: 'refined, tasteful, minimalist language',
        casual: 'relaxed, friendly, conversational like talking to a friend',
      };

  const toneMap = isZh
    ? {
        0: '极度正式，学术风格',
        1: '非常专业',
        2: '专业',
        3: '正式但温暖',
        4: '礼貌且亲切',
        5: '平衡，活泼但不过分',
        6: '潮流，懂网络用语',
        7: '轻松随意',
        8: '非常口语化，像给朋友发消息',
        9: '极度随意，充满俚语',
        10: '纯口语化，接近即兴表达',
      }
    : {
        0: 'highly formal, academic tone',
        1: 'very professional tone',
        2: 'professional tone',
        3: 'formal but warm',
        4: 'polite and approachable',
        5: 'balanced, lively but not over the top',
        6: 'trendy, internet-savvy',
        7: 'casual and relaxed',
        8: 'very conversational, like a text to a friend',
        9: 'extremely casual, full of slang',
        10: 'purely conversational, almost spoken-word',
      };

  const platformNames = platforms.map((p) => {
    const zhMap = { tiktok: '抖音/TikTok', instagram: 'Instagram', facebook: 'Facebook', twitter: 'X/Twitter', linkedin: 'LinkedIn' };
    return isZh ? (zhMap[p] || p.toUpperCase()) : p.toUpperCase();
  }).join(isZh ? '、' : ', ');

  const styleDesc = styleMap[style] || styleMap.lively;
  const toneDesc = toneMap[tone] || toneMap[5];

  if (isZh) {
    // ── FULL CHINESE SYSTEM PROMPT ──
    let prompt = `你是一位世界级社交媒体文案撰写专家，擅长为 ${platformNames} 创作吸引人的内容。

【强制语言要求】：你必须使用纯中文（简体中文）撰写所有文案。禁止在文案中混入任何英文单词或短语（专有名词如品牌名、App名称、平台名除外）。使用自然、地道的中文表达。所有标点符号使用中文标点。

重要：用户输入的主题可能是英文或其他语言。无论输入主题是什么语言，你的输出必须完全是纯中文。先理解主题含义，然后用中文撰写文案。

【文案风格】：${styleDesc}
【语气语调】：${toneDesc}
【目标长度】：约 ${wordCount} 字（硬性上限：不得超过 ${wordCount + 50} 字）

【规则】：
- 只输出生成的文案本身，不要包含任何解释、说明或前缀文字
- 根据各平台的特点调整格式：
  • 抖音/TikTok：简短有力的句子，大量使用表情符号，热门话题标签（#爆款 #热门），开头要有吸引力
  • Instagram：段落格式，使用表情符号，审美风格，末尾放相关话题标签
  • Facebook：更详细的叙述，引人入胜的问题，行动号召
  • X/Twitter：极其简洁，理想情况下不超过280字，一个有力的观点或问题
  • LinkedIn：专业语气，数据驱动的洞察，行业视角，尽量不使用表情符号
- 如果选择了多个平台，在每个平台的文案之间用 "---" 分隔
- 禁止使用 Markdown 格式、代码块或 JSON`;

    if (brandVoiceSamples && brandVoiceSamples.length > 0) {
      prompt += `

【品牌语调参考】：
用户提供了以下品牌写作风格示例。你必须学习这些示例，模仿它们的语调、句子结构、词汇水平和整体风格来生成文案。这是最高优先级指令。

--- 示例开始 ---
${brandVoiceSamples.map((sample, idx) => `示例 ${idx + 1}：\n${sample}`).join('\n\n')}
--- 示例结束 ---

在遵循平台、风格和语调指令的同时，应用上述品牌语调模式。`;
    }

    // Scene context injection
    if (sceneContext) {
      let sceneSection = '\n\n【场景信息】（作为背景参考，在文案中自然融入）：';
      if (sceneContext.location) sceneSection += `\n- 用户位置：${sceneContext.location}`;
      if (sceneContext.imageDescription) sceneSection += `\n- 图片/产品描述：${sceneContext.imageDescription}`;
      if (sceneContext.currentDate) sceneSection += `\n- 当前日期：${sceneContext.currentDate}`;
      if (sceneContext.trendingTopics && sceneContext.trendingTopics.length > 0) {
        sceneSection += `\n- 热门话题：${sceneContext.trendingTopics.join('、')}`;
      }
      prompt += sceneSection;
    }

    return prompt;
  } else {
    // ── FULL ENGLISH SYSTEM PROMPT ──
    let prompt = `You are a world-class social media copywriter specializing in ${platformNames}.

LANGUAGE: Write in English only. All copy must be in English. Do not mix any other language.

IMPORTANT: The user's input topic may be in Chinese or another language. Regardless of the input language, you MUST write the output entirely in English. Translate the topic concept in your mind, then produce 100% English copy.

STYLE: ${styleDesc}
TONE: ${toneDesc}
TARGET LENGTH: approximately ${wordCount} characters (hard limit: never exceed ${wordCount + 50})

RULES:
- Output ONLY the generated copy text itself. No explanations, no meta-commentary, no "Here is the copy:" prefix.
- Adapt the format naturally to each platform's conventions:
  • TikTok: Short punchy sentences, heavy emoji use, trending hashtags (#FYP #viral), hook in first line
  • Instagram: Paragraph format with emojis, aesthetic vibe, relevant hashtags block at end
  • Facebook: More detailed narrative, engaging questions, call-to-action
  • X/Twitter: Extremely concise, under 280 chars ideal, one strong take or question
  • LinkedIn: Professional voice, data-driven insights, industry perspective, no emojis except minimal
- If multiple platforms are selected, output a clear separator "---" between each platform's copy
- Never include markdown formatting, code blocks, or JSON in your response`;

    if (brandVoiceSamples && brandVoiceSamples.length > 0) {
      prompt += `

BRAND VOICE REFERENCE:
The user has provided the following examples of their brand's writing style. You MUST study these examples and mimic their voice, sentence structure, vocabulary level, and overall tone in your generated copy. This is the highest priority instruction.

--- EXAMPLE START ---
${brandVoiceSamples.map((sample, idx) => `Example ${idx + 1}:\n${sample}`).join('\n\n')}
--- EXAMPLE END ---

Apply the brand voice patterns above while still following the platform, style, and tone instructions.`;
    }

    // Scene context injection
    if (sceneContext) {
      let sceneSection = '\n\nSCENE CONTEXT (use as background reference, weave naturally into the copy if relevant):';
      if (sceneContext.location) sceneSection += `\n- User location: ${sceneContext.location}`;
      if (sceneContext.imageDescription) sceneSection += `\n- Image/product description: ${sceneContext.imageDescription}`;
      if (sceneContext.currentDate) sceneSection += `\n- Current date: ${sceneContext.currentDate}`;
      if (sceneContext.trendingTopics && sceneContext.trendingTopics.length > 0) {
        sceneSection += `\n- Trending topics: ${sceneContext.trendingTopics.join(', ')}`;
      }
      prompt += sceneSection;
    }

    return prompt;
  }
}

/**
 * Build the user prompt from the topic.
 * @param {string} topic
 * @param {string[]} platforms
 * @param {object} sceneContext
 * @param {string} outputLanguage - 'en' or 'zh'
 * @returns {string}
 */
function buildUserPrompt(topic, platforms, sceneContext, outputLanguage = 'en') {
  const isZh = outputLanguage === 'zh';

  const platformNames = platforms.map((p) => {
    const zhMap = { tiktok: '抖音/TikTok', instagram: 'Instagram', facebook: 'Facebook', twitter: 'X/Twitter', linkedin: 'LinkedIn' };
    return isZh ? (zhMap[p] || p.toUpperCase()) : p.toUpperCase();
  }).join(isZh ? '、' : ', ');

  if (isZh) {
    let prompt = `请为以下主题创作社交媒体文案："${topic}"

注意：上面的主题可能是英文或其他语言。请先将其翻译理解，然后全部用纯中文（简体）撰写文案。

目标平台：${platformNames}

为每个选定的平台生成一个版本的文案。让每个版本都符合该平台受众的阅读习惯和格式规范。

【再次强调】：所有输出必须为纯中文（简体），禁止混入任何英文单词（专有名词如品牌名、App名称、平台名除外）。即使输入主题是英文，输出也必须完全是中文。`;

    if (sceneContext?.location) {
      prompt += `\n\n用户所在位置：${sceneContext.location}。如相关，请在文案中自然融入当地文化或背景。`;
    }

    return prompt;
  } else {
    let prompt = `Write social media copy about the following topic: "${topic}"

Note: The topic above may be in Chinese or another language. You must translate and understand it, then write the copy ENTIRELY in English.

Target platforms: ${platformNames}

Generate one version of copy per selected platform. Make each version feel native to that platform's audience and format conventions.

[OUTPUT LANGUAGE REQUIREMENT]: All copy must be written entirely in English. Do not include any Chinese characters or other non-English text in your output. Even if the input topic is in Chinese, your response must be 100% English.`;

    if (sceneContext?.location) {
      prompt += `\n\nThe user is located in ${sceneContext.location}. Subtly reference local culture or context if relevant.`;
    }

    return prompt;
  }
}

/**
 * Parse multi-platform raw API response into structured results.
 * @param {string} rawText
 * @param {string[]} platforms
 * @returns {Object} Map of platformId -> copy text
 */
export function parseMultiPlatformResponse(rawText, platforms) {
  if (!rawText || typeof rawText !== 'string') return {};

  let sections = rawText.split(/\s*(?:---+|——+|\*\*\*+)\s*/);
  sections = sections.map((s) => s.trim()).filter((s) => s.length > 0);

  const results = {};
  if (sections.length === 1 && platforms.length === 1) {
    results[platforms[0]] = sections[0];
  } else if (sections.length >= platforms.length) {
    platforms.forEach((pid, idx) => { results[pid] = sections[idx] || ''; });
  } else {
    platforms.forEach((pid) => { results[pid] = rawText; });
  }
  return results;
}

/**
 * Post-process the generated text to enforce output language purity.
 * - For 'en': strip Chinese characters (keep English + punctuation + emojis + hashtags)
 * - For 'zh': strip standalone English words/sentences (keep platform names, brand names, hashtags)
 * @param {string} text - Raw model output
 * @param {string} outputLanguage - 'en' or 'zh'
 * @returns {string} Sanitized text
 */
function enforceOutputLanguage(text, outputLanguage) {
  if (!text || typeof text !== 'string') return text;

  if (outputLanguage === 'en') {
    // Remove Chinese characters (CJK Unified Ideographs + common Chinese punctuation)
    // Keep: English letters, numbers, punctuation, emojis, hashtags, line breaks
    let cleaned = text
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, '') // Chinese characters
      .replace(/[\u3000-\u303f\uff00-\uffef]/g, '') // Chinese punctuation (，。！？etc.)
      .replace(/[【】《》（）""''、；：]/g, '') // Common Chinese brackets/quotes
      .replace(/\n{3,}/g, '\n\n') // Collapse excessive blank lines
      .replace(/^\s*[-•]\s*$/gm, '') // Remove empty bullet points left after stripping
      .trim();

    // Clean up any lines that are now empty or just punctuation
    cleaned = cleaned.split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');

<<<<<<< HEAD
    console.log('[ModelAdapter] enforceOutputLanguage(en): removed Chinese chars, len', text.length, '->', cleaned.length);
    return cleaned;
  } else if (outputLanguage === 'zh') {
    // For Chinese output, aggressively remove English sentences while keeping useful patterns
    let tempText = text;

    // Step 1: Protect hashtags, URLs, and platform names by replacing them with placeholders
    const protectedPatterns = [
      { regex: /#[a-zA-Z0-9_\u4e00-\u9fff]+/g, type: 'hashtag' },      // #hashtags (mixed lang)
      { regex: /https?:\/\/[^\s]+/gi, type: 'url' },                   // URLs
      { regex: /\b(TikTok|Instagram|Facebook|Twitter|LinkedIn|X\/Twitter)\b/gi, type: 'platform' },
      { regex: /@[a-zA-Z0-9_]+/g, type: 'mention' },                    // @mentions
    ];

    const placeholders = [];
    protectedPatterns.forEach(({ regex, type }) => {
      tempText = tempText.replace(regex, (match) => {
        const placeholder = `__PROT_${type}_${placeholders.length}__`;
        placeholders.push({ placeholder, value: match });
        return placeholder;
      });
    });

    // Step 2: Remove lines that are entirely or mostly English (no Chinese chars, 15+ English chars)
    tempText = tempText.split('\n')
      .map((line) => {
        const chineseChars = (line.match(/[\u4e00-\u9fff]/g) || []).length;
        const englishChars = (line.match(/[A-Za-z]/g) || []).length;
        // If line has no Chinese and significant English, it's an English sentence -> remove
        if (chineseChars === 0 && englishChars > 15) {
          return '';
        }
        return line;
      })
      .join('\n');

    // Step 3: Remove sequences of 2+ consecutive English words (sentences, not names)
    // Match: word (2+ letters) + space + word (2+ letters), repeated
    tempText = tempText.replace(/[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})+/g, '');

    // Step 4: Remove isolated English words on lines with mostly Chinese
    // (keep single English words that might be brand names or tech terms)
    tempText = tempText.split('\n')
      .map((line) => {
        const chineseChars = (line.match(/[\u4e00-\u9fff]/g) || []).length;
        const englishChars = (line.match(/[A-Za-z]/g) || []).length;
=======
    console.log('[ModelAdapter] enforceOutputLanguage(en): removed Chinese chars, len', text.length, '→', cleaned.length);
    return cleaned;
  } else if (outputLanguage === 'zh') {
    // For Chinese output, remove standalone English sentences (3+ consecutive English words)
    // But keep: platform names (TikTok, Instagram, etc.), brand names, hashtags, emojis
    const keepPatterns = [
      /TikTok|Instagram|Facebook|Twitter|LinkedIn|X\/Twitter/gi,
      /#[a-zA-Z0-9_]+/g, // Hashtags
      /https?:\/\/[^\s]+/g, // URLs
    ];

    // Save patterns that should be kept
    const placeholders = [];
    let tempText = text;
    keepPatterns.forEach((pattern, idx) => {
      tempText = tempText.replace(pattern, (match) => {
        placeholders.push(match);
        return `__KEEP_${idx}_${placeholders.length - 1}__`;
      });
    });

    // Remove sequences of 3+ consecutive English words (likely sentences, not names)
    // English word = sequence of ASCII letters
    tempText = tempText.replace(/[A-Za-z]{2,}(\s+[A-Za-z]{2,}){2,}/g, '');

    // Remove standalone English sentences (lines that are mostly English)
    tempText = tempText.split('\n')
      .map((line) => {
        const englishChars = (line.match(/[A-Za-z]/g) || []).length;
        const chineseChars = (line.match(/[\u4e00-\u9fff]/g) || []).length;
>>>>>>> 12460ba241a064b8de554b017c18b5b025c65ce2
        // If a line has way more English than Chinese and has 10+ English chars, strip English words
        if (englishChars > 10 && englishChars > chineseChars * 2) {
          return line.replace(/[A-Za-z]{2,}/g, '').trim();
        }
        return line;
      })
      .join('\n');

<<<<<<< HEAD
    // Step 5: Restore protected patterns
    placeholders.forEach(({ placeholder, value }) => {
      tempText = tempText.replace(placeholder, value);
    });

    // Step 6: Clean up formatting
    tempText = tempText
      .replace(/\n{3,}/g, '\n\n')     // Collapse excessive blank lines
      .replace(/\s{2,}/g, ' ')         // Collapse multiple spaces
      .replace(/^\s*[-•]\s*$/gm, '')  // Remove empty bullets
      .trim();

    // Step 7: Remove lines that became empty after cleanup
    tempText = tempText.split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');

    console.log('[ModelAdapter] enforceOutputLanguage(zh): cleaned, len', text.length, '->', tempText.length);
=======
    // Restore kept patterns
    placeholders.forEach((match, idx) => {
      tempText = tempText.replace(`__KEEP_${Math.floor(idx / keepPatterns.length)}_${idx % keepPatterns.length}__`, match);
    });

    // Simpler restore: just replace all placeholders
    let restoreIdx = 0;
    tempText = tempText.replace(/__KEEP_\d+_\d+__/g, () => placeholders[restoreIdx++] || '');

    tempText = tempText.replace(/\n{3,}/g, '\n\n').trim();

    console.log('[ModelAdapter] enforceOutputLanguage(zh): removed English sentences, len', text.length, '→', tempText.length);
>>>>>>> 12460ba241a064b8de554b017c18b5b025c65ce2
    return tempText;
  }

  return text;
}

/**
 * Main entry point — generate social media copy via the current model.
 * Auto-fallback to next provider on failure.
 *
 * @param {Object} params
 * @param {string[]} params.platforms
 * @param {string} params.style
 * @param {number} params.tone
 * @param {number} params.wordCount
 * @param {string} params.topic
 * @param {string[]} [params.brandVoiceSamples]
 * @returns {Promise<{success: boolean, data?: string, error?: string, provider?: string, usage?: object}>}
 */
export async function generateCopy({
  platforms,
  style,
  tone,
  wordCount,
  topic,
  brandVoiceSamples,
  outputLanguage = 'en',
  sceneContext,
}) {
  console.log(`[ModelAdapter] generateCopy — outputLanguage FORCED to: "${outputLanguage}"`);
  const effectiveLang = outputLanguage === 'zh' ? 'zh' : 'en';
  const systemPrompt = buildSystemPrompt(platforms, style, tone, wordCount, brandVoiceSamples, effectiveLang, sceneContext);
  const userPrompt = buildUserPrompt(topic, platforms, sceneContext, effectiveLang);

  const prompt = { system: systemPrompt, user: userPrompt };
  const params = { platforms, style, tone, wordCount, topic };

  // Try current provider, then fallback chain (max 3 attempts)
  const tried = new Set();
  let providerKey = MODEL_CONFIG.current;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (tried.has(providerKey)) {
      // Already tried this one, find next untried enabled provider
      const allKeys = Object.keys(MODEL_CONFIG.providers);
      providerKey = allKeys.find((k) => !tried.has(k) && MODEL_CONFIG.providers[k].enabled) || providerKey;
    }

    tried.add(providerKey);
    const provider = getProvider(providerKey);

    if (!provider) {
      console.warn(`[ModelAdapter] Provider "${providerKey}" not available, trying next...`);
      const config = MODEL_CONFIG.providers[providerKey];
      providerKey = config?.fallback || Object.keys(MODEL_CONFIG.providers)[0];
      continue;
    }

    try {
      console.log(`[ModelAdapter] Attempt ${attempt + 1}/3 — Trying provider: ${providerKey}`);
      console.log(`[ModelAdapter] Provider config: model=${MODEL_CONFIG.providers[providerKey]?.model}, endpoint=${MODEL_CONFIG.providers[providerKey]?.endpoint}`);
      const result = await provider.generate(prompt, params);

      if (result && result.text) {
        console.log(`[ModelAdapter] Provider "${providerKey}" succeeded, raw text length:`, result.text.length);

        // ── Post-process: enforce output language purity ──
        const sanitizedText = enforceOutputLanguage(result.text, effectiveLang);
        console.log(`[ModelAdapter] After language enforcement: length ${sanitizedText.length}`);

<<<<<<< HEAD
        // ── Quality gate: if Chinese output has too little Chinese, reject ──
        if (effectiveLang === 'zh') {
          const chineseChars = (sanitizedText.match(/[\u4e00-\u9fff]/g) || []).length;
          const totalChars = sanitizedText.replace(/\s/g, '').length;
          const ratio = totalChars > 0 ? chineseChars / totalChars : 0;
          console.log(`[ModelAdapter] Chinese char ratio: ${(ratio * 100).toFixed(1)}% (${chineseChars}/${totalChars})`);

          if (ratio < 0.3 && sanitizedText.length > 20) {
            // Output is mostly non-Chinese after cleaning — likely a model hallucination
            console.warn(`[ModelAdapter] Chinese ratio too low (${(ratio * 100).toFixed(1)}%), treating as failed output`);
            throw new Error(`LOW_CHINESE_RATIO: output has only ${(ratio * 100).toFixed(0)}% Chinese characters`);
          }
        }

=======
>>>>>>> 12460ba241a064b8de554b017c18b5b025c65ce2
        return {
          success: true,
          data: sanitizedText.trim(),
          provider: providerKey,
          usage: result.usage || null,
        };
      }

      // Provider returned but no text — treat as failure
      console.warn(`[ModelAdapter] Provider "${providerKey}" returned empty result`);
    } catch (error) {
      console.error(`[ModelAdapter] Provider "${providerKey}" failed:`, error.message);
      console.error(`[ModelAdapter] Error stack:`, error.stack?.split('\n').slice(0, 3).join('\n') || 'N/A');
      if (error.response) {
        console.error(`[ModelAdapter] Error response:`, JSON.stringify(error.response).slice(0, 500));
      }
      if (error.name) {
        console.error(`[ModelAdapter] Error type:`, error.name);
      }
    }

    // Fallback to next provider
    const currentConfig = MODEL_CONFIG.providers[providerKey];
    if (currentConfig?.fallback && !tried.has(currentConfig.fallback)) {
      providerKey = currentConfig.fallback;
    } else {
      // No configured fallback — find any other enabled untried provider
      const nextKey = Object.keys(MODEL_CONFIG.providers).find(
        (k) => !tried.has(k) && MODEL_CONFIG.providers[k].enabled
      );
      if (nextKey) {
        providerKey = nextKey;
      } else {
        break; // All providers exhausted
      }
    }
  }

  // All providers failed
  console.error('[ModelAdapter] All providers exhausted. Tried:', [...tried].join(', '));
  return {
    success: false,
    error: 'ALL_PROVIDERS_FAILED',
    provider: null,
  };
}

export default generateCopy;

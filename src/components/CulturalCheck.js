// ============================================================
// CulturalCheck — Enhanced cultural fit detection (bilingual)
// 4 categories with cross-cultural awareness:
//   1. Emoji cultural meaning (👍🚫🤌 etc.)
//   2. Number cultural sensitivity (4, 13, 420, 666, 911)
//   3. Religious / holiday terms (Christmas→Holiday, Ramadan, etc.)
//   4. Slang / pun cross-cultural ambiguity (sick, lit, fire, etc.)
// Exports runCulturalCheck(text, lang) for external use
//
// i18n: every rule carries both { en, zh } text. The detection rules
// are language-agnostic (emoji + numbers) plus English AND Chinese
// term lists, so the checker works for copy generated in either
// output language. UI strings go through the global i18n dictionary.
//
// One-click fix (applyCulturalFixes):
//   • deterministic swaps  — sensitive emoji / slang / religious terms
//     (both English and Chinese copy)
//   • emoji-overuse trim   — keeps at most 3 key emojis
//   • numbers              — never auto-rewritten (would corrupt
//     prices / counts / dates); returned as manual TODO notes instead
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Alert,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SHADOWS, getTheme } from '../themes/theme';
import { useLanguage } from '../context/LanguageContext';
import { t as translate } from '../i18n/i18n';

// ============================================================
// Detection rule databases — all with cultural context (en + zh)
// ============================================================

/**
 * Category 1: Culturally sensitive emojis
 * Each entry: { emoji, name, regions, issue, suggestion } — all text
 * fields are { en, zh } pairs.
 */
const CULTURALLY_SENSITIVE_EMOJIS = [
  {
    emoji: '👍',
    name: { en: 'Thumbs Up', zh: '点赞手势' },
    regions: { en: 'Middle East, West Africa, Brazil, Germany', zh: '中东、西非、巴西、德国' },
    issue: {
      en: 'In many Middle Eastern and West African countries, 👍 is equivalent to a middle finger. In Germany it can signal "one" rather than approval.',
      zh: '在中东与西非许多国家，👍 相当于竖中指；在德国它也可能被理解为数字「一」，而不是赞同。',
    },
    suggestion: {
      en: 'Replace with ✅ or "Great!" text for global audiences.',
      zh: '面向全球受众建议换成 ✅ 或文字「Great!」。',
    },
  },
  {
    emoji: '🚫',
    name: { en: 'Prohibited', zh: '禁止符号' },
    regions: { en: 'Global (ambiguous meaning)', zh: '全球（含义不够明确）' },
    issue: {
      en: '🚫 means "forbidden/banned" in most contexts, but some readers interpret it as simply "stop" or "no entry" without the severity of prohibition.',
      zh: '🚫 在多数语境下表示「禁止」，但也有读者只理解为「停止」「不可进入」，强度容易被误判。',
    },
    suggestion: {
      en: 'Use clearer text like "Not allowed" or "Banned" to avoid ambiguity.',
      zh: '建议改用更明确的文字，如「Not allowed」或「禁止」，避免歧义。',
    },
  },
  {
    emoji: '🤌',
    name: { en: 'Pinched Fingers', zh: '捏手指手势' },
    regions: { en: 'Italy, Mediterranean vs. Global', zh: '意大利、地中海地区 vs. 全球' },
    issue: {
      en: 'In Italy this means "What do you want?" but globally it can be confused with a gesture meaning "precise" or even something offensive.',
      zh: '在意大利它表示「你想要什么？」，但在其他地区可能被理解为「精确」，甚至带有冒犯意味。',
    },
    suggestion: {
      en: 'Avoid unless targeting an Italian audience who understands the nuance.',
      zh: '除非明确面向理解该手势的意大利受众，否则建议避免使用。',
    },
  },
  {
    emoji: '🤙',
    name: { en: 'Call Me Hand', zh: '打电话手势' },
    regions: { en: 'Hawaii, surf culture vs. Latin America', zh: '夏威夷、冲浪文化 vs. 拉美' },
    issue: {
      en: 'In Hawaii and surf culture this means "hang loose." In parts of Latin America, it can represent a risky or illegal proposition.',
      zh: '在夏威夷和冲浪文化中它表示「放轻松」；但在拉美部分地区，它可能被理解为带有风险或不当暗示的提议。',
    },
    suggestion: {
      en: 'Use only for Hawaiian/surf context; otherwise use ✌️ or 👋.',
      zh: '仅在夏威夷／冲浪语境使用，其他场合建议换成 ✌️ 或 👋。',
    },
  },
  {
    emoji: '✌️',
    name: { en: 'Peace Sign (palm inward)', zh: '比耶手势（手背朝外）' },
    regions: { en: 'UK, Australia, Ireland', zh: '英国、澳大利亚、爱尔兰' },
    issue: {
      en: 'When the back of the hand faces outward (palm inward), this is equivalent to a middle finger in the UK, Australia, and Ireland.',
      zh: '当手背朝外（掌心朝内）时，在英国、澳大利亚和爱尔兰相当于竖中指。',
    },
    suggestion: {
      en: 'Ensure peace sign is palm-outward facing, or use 🕊️ for peace instead.',
      zh: '请确保掌心朝外，或改用 🕊️ 表达和平。',
    },
  },
  {
    emoji: '🤡',
    name: { en: 'Clown Face', zh: '小丑表情' },
    regions: { en: 'Global', zh: '全球' },
    issue: {
      en: 'Often used as an insult ("you are a clown/joke") rather than humor. Can come across as mocking.',
      zh: '常被用来贬低对方（「你就是个笑话」），而非单纯搞笑，容易被读成嘲讽。',
    },
    suggestion: {
      en: 'Use only if intentionally playful/teasing; avoid in professional or sensitive contexts.',
      zh: '仅在明确玩梗、调侃时使用；专业或敏感语境建议避免。',
    },
  },
  {
    emoji: '🐍',
    name: { en: 'Snake', zh: '蛇' },
    regions: { en: 'Global (especially US pop culture)', zh: '全球（尤其美国流行文化）' },
    issue: {
      en: 'In social media culture, 🐍 implies "backstabber" or "traitor" (Taylor Swift drama). Not a neutral animal emoji.',
      zh: '在社媒语境中 🐍 暗指「背后捅刀的人」「叛徒」（源自 Taylor Swift 事件），并非中立的动物表情。',
    },
    suggestion: {
      en: 'Use only if the snake symbolism is intentional; avoid as a casual animal reference.',
      zh: '仅在想表达该隐喻时使用；日常提到动物时建议避开。',
    },
  },
  {
    emoji: '🍑',
    name: { en: 'Peach', zh: '桃子' },
    regions: { en: 'Global', zh: '全球' },
    issue: {
      en: 'Widely understood as a butt reference in social media, not just a fruit. May be inappropriate for brand content.',
      zh: '在社媒上被广泛理解为与臀部相关，而非单纯的水果，品牌内容中使用可能不合适。',
    },
    suggestion: {
      en: 'Avoid in professional or family-friendly brand content. Use 🍎 or 🥝 instead for fruit references.',
      zh: '专业或家庭友好型内容中避免使用；想表达水果建议换成 🍎 或 🥝。',
    },
  },
  {
    emoji: '🫡',
    name: { en: 'Saluting Face', zh: '敬礼表情' },
    regions: { en: 'Military / Authority contexts', zh: '军事／权威语境' },
    issue: {
      en: 'Can be interpreted as respectful or as sarcastic obedience depending on context. Ambiguous in casual use.',
      zh: '既可能被理解为尊敬，也可能被理解为阴阳怪气的服从，随意使用容易歧义。',
    },
    suggestion: {
      en: 'Use with clear context or replace with "Respect" text.',
      zh: '需搭配明确语境，或改用文字「Respect」。',
    },
  },
];

/**
 * Category 2: Culturally sensitive numbers
 * `short` — one-line localized reason used for the manual TODO list.
 * `advisoryOnly` — notable but generally safe (7, 8): never listed as
 * a must-fix item, to avoid noisy false positives.
 */
const CULTURALLY_SENSITIVE_NUMBERS = [
  {
    number: '4',
    regions: { en: 'East Asia (China, Japan, Korea)', zh: '东亚（中国、日本、韩国）' },
    issue: {
      en: 'In many East Asian languages, "4" sounds like the word for "death" (四/死). Considered very unlucky.',
      zh: '在东亚多国语言中，「4」与「死」谐音，被视为不吉利。',
    },
    suggestion: {
      en: 'Avoid pricing at $4, 4-packs, or emphasizing the number 4 when targeting East Asian markets. Use 3 or 5 instead.',
      zh: '面向东亚市场时，避免用 4 定价、4 件装或刻意强调数字 4，可改用 3 或 5。',
    },
    short: { en: 'Unlucky in East Asia (sounds like "death")', zh: '东亚文化中与「死」谐音，不吉利' },
  },
  {
    number: '13',
    regions: { en: 'Western countries (US, Europe)', zh: '西方国家（美国、欧洲）' },
    issue: {
      en: 'Considered unlucky in many Western cultures (triskaidekaphobia). Many buildings skip the 13th floor.',
      zh: '在西方多国被视为不吉利（十三恐惧症），不少建筑甚至不设 13 楼。',
    },
    suggestion: {
      en: 'Avoid using 13 in pricing, discounts, or counts for Western audiences. Use 12 or 14 instead.',
      zh: '面向西方受众时，避免用 13 定价、折扣或数量，可改用 12 或 14。',
    },
    short: { en: 'Unlucky in Western cultures', zh: '西方文化中视为不吉利' },
  },
  {
    number: '420',
    regions: { en: 'North America, increasingly global', zh: '北美，并逐渐全球化' },
    issue: {
      en: 'Strongly associated with cannabis/marijuana culture (April 20th). Using 420 as a price or quantity may be misinterpreted.',
      zh: '与大麻文化（4 月 20 日）强关联，用作价格或数量可能被误读。',
    },
    suggestion: {
      en: 'Avoid 420 as a number in pricing or quantities unless the cannabis reference is intentional.',
      zh: '除非确实想表达该关联，否则避免在价格或数量中使用 420。',
    },
    short: { en: 'Reads as cannabis culture reference', zh: '容易被读成大麻文化梗' },
  },
  {
    number: '666',
    regions: { en: 'Christian-majority countries', zh: '基督教为主的国家' },
    issue: {
      en: 'The "Number of the Beast" from the Book of Revelation. Considered evil or satanic in Christian cultures.',
      zh: '源自《启示录》的「兽名数目」，在基督教文化中被视为邪恶、撒旦的象征。',
    },
    suggestion: {
      en: 'Never use 666 in any marketing context for Western/Christian audiences.',
      zh: '面向西方／基督教受众的任何营销内容都不要使用 666。',
    },
    short: { en: 'Number of the Beast in Christian cultures', zh: '基督教文化中为「兽名数目」，负面' },
  },
  {
    number: '911',
    regions: { en: 'United States', zh: '美国' },
    issue: {
      en: 'The US emergency phone number. Using 911 as a price ($9.11) or in any non-emergency context is considered insensitive.',
      zh: '美国紧急报警电话，用作价格（$9.11）或非紧急语境会被认为不敏感。',
    },
    suggestion: {
      en: 'Avoid 911 as a number in any commercial context for US audiences.',
      zh: '面向美国受众的商业内容中避免出现 911。',
    },
    short: { en: 'US emergency number', zh: '美国紧急报警电话' },
  },
  {
    number: '7',
    advisoryOnly: true,
    regions: { en: 'Global (positive but religious)', zh: '全球（吉利但带宗教色彩）' },
    issue: {
      en: 'While considered lucky in many cultures, 7 has strong religious significance (7 days of creation, 7 heavens in Islam). May unintentionally invoke religious connotations.',
      zh: '在许多文化中是幸运数字，但 7 也有强烈宗教含义（创世七日、伊斯兰教的七重天），可能无意间带上宗教色彩。',
    },
    suggestion: {
      en: 'Generally safe to use, but be aware of religious undertones in faith-diverse audiences.',
      zh: '一般可以放心使用，但面向多信仰受众时留意其宗教联想。',
    },
    short: { en: 'Generally safe, religious undertones', zh: '一般安全，带轻微宗教联想' },
  },
  {
    number: '8',
    advisoryOnly: true,
    regions: { en: 'China', zh: '中国' },
    issue: {
      en: 'In Chinese, "8" (八) sounds like "wealth/prosper" (发). Very auspicious. Using 8 may be seen as trying too hard to appeal to Chinese consumers.',
      zh: '中文里「8」与「发」谐音，非常吉利；但刻意堆砌 8 会显得在硬讨好中国消费者。',
    },
    suggestion: {
      en: 'Using 8 is positive for Chinese markets but should feel natural, not forced.',
      zh: '面向中国市场时用 8 是加分的，但要自然，不要刻意。',
    },
    short: { en: 'Auspicious in China, keep it natural', zh: '中国语境吉利，但别刻意堆积' },
  },
];

/**
 * Category 3: Religious / holiday / culturally specific terms
 * `term` is matched case-insensitively and is NOT word-bounded, so it
 * also covers Chinese terms (圣诞节, 万圣节, 上帝 …).
 */
const RELIGIOUS_HOLIDAY_TERMS = [
  {
    term: 'christmas',
    suggestion: {
      en: 'Consider using "Holiday season" or "Winter holidays" to include non-Christian audiences.',
      zh: '建议改用「节日季」「冬季节日」，以覆盖非基督教受众。',
    },
    regions: { en: 'Global (non-Christian majority countries)', zh: '全球（非基督教为主的国家）' },
    level: 'info',
  },
  {
    term: 'easter',
    suggestion: {
      en: 'Consider using "Spring celebration" for secular contexts or multi-faith audiences.',
      zh: '在非宗教语境或多信仰受众前，建议改用「春季庆典」。',
    },
    regions: { en: 'Global (non-Christian majority countries)', zh: '全球（非基督教为主的国家）' },
    level: 'info',
  },
  {
    term: 'ramadan',
    suggestion: {
      en: 'When referencing Ramadan, ensure respectful tone. Avoid pairing with food/drink promotions.',
      zh: '提及斋月时务必保持尊重语气，避免与餐饮促销搭配。',
    },
    regions: { en: 'Global (non-Muslim audiences may misunderstand)', zh: '全球（非穆斯林受众可能误解）' },
    level: 'warning',
  },
  {
    term: 'halloween',
    suggestion: {
      en: 'Not celebrated in many cultures and may be seen as inappropriate or offensive in conservative regions.',
      zh: '许多文化不过万圣节，在保守地区可能被视为不恰当甚至冒犯。',
    },
    regions: { en: 'Middle East, conservative cultures', zh: '中东及保守文化地区' },
    level: 'info',
  },
  {
    term: 'god',
    suggestion: {
      en: 'May alienate non-religious or polytheistic audiences. Consider "goodness" or remove if not faith-focused.',
      zh: '可能让非宗教或多神信仰受众感到疏离；建议换成「goodness」或在非信仰内容中删除。',
    },
    regions: { en: 'Secular / multi-faith audiences', zh: '世俗／多信仰受众' },
    level: 'info',
  },
  {
    term: 'jesus',
    suggestion: {
      en: 'Specifically Christian reference. Consider removing for general audiences.',
      zh: '明确的基督教专有引用，面向大众受众时建议移除。',
    },
    regions: { en: 'Non-Christian audiences', zh: '非基督教受众' },
    level: 'warning',
  },
  {
    term: 'christ',
    suggestion: {
      en: 'Christian-specific. "Christmas" → "Holiday", "Christian" context should be explicit if used.',
      zh: '基督教专属用词。若使用，语境需要更明确，或改用中性表达。',
    },
    regions: { en: 'Non-Christian audiences', zh: '非基督教受众' },
    level: 'warning',
  },
  {
    term: 'allah',
    suggestion: {
      en: 'Islamic reference. Use with deep respect; avoid casual or commercial usage.',
      zh: '伊斯兰教专有引用，必须保持高度尊重，避免随意或商业化使用。',
    },
    regions: { en: 'Non-Muslim audiences may misinterpret', zh: '非穆斯林受众可能误解' },
    level: 'warning',
  },
  {
    term: 'prayer',
    suggestion: {
      en: 'Has religious connotations. Consider "hope", "wish", or "positive thoughts" for secular contexts.',
      zh: '带宗教含义，世俗语境建议改用「hope」「wish」或「positive thoughts」。',
    },
    regions: { en: 'Secular / multi-faith audiences', zh: '世俗／多信仰受众' },
    level: 'info',
  },
  {
    term: 'blessed',
    suggestion: {
      en: 'Religious undertone. Consider "grateful", "fortunate", or "lucky" for inclusive language.',
      zh: '带宗教色彩，建议改用「grateful」「fortunate」「lucky」等更中性的说法。',
    },
    regions: { en: 'Secular / multi-faith audiences', zh: '世俗／多信仰受众' },
    level: 'info',
  },
  {
    term: 'amen',
    suggestion: {
      en: 'Strongly religious. Avoid in secular marketing copy.',
      zh: '宗教色彩很强，世俗营销文案中建议避免。',
    },
    regions: { en: 'Secular / multi-faith audiences', zh: '世俗／多信仰受众' },
    level: 'warning',
  },
  {
    term: 'holy',
    suggestion: {
      en: 'Religious connotation. Consider "sacred" (more universal) or rephrase entirely.',
      zh: '带宗教含义，可改用更通用的「sacred」，或直接改写。',
    },
    regions: { en: 'Secular / multi-faith audiences', zh: '世俗／多信仰受众' },
    level: 'info',
  },
  {
    term: 'diwali',
    suggestion: {
      en: 'Hindu festival. When referencing, ensure authentic and respectful representation.',
      zh: '印度教节日，引用时需确保表达真实、尊重。',
    },
    regions: { en: 'Non-Hindu audiences', zh: '非印度教受众' },
    level: 'info',
  },
  // ---- Chinese-language terms (so Chinese copy is checked too) ----
  {
    term: '圣诞节',
    suggestion: {
      en: 'Consider "Holiday season" to include non-Christian audiences.',
      zh: '建议改用「节日季」，以覆盖非基督教受众。',
    },
    regions: { en: 'Global (non-Christian majority countries)', zh: '全球（非基督教为主的国家）' },
    level: 'info',
  },
  {
    term: '圣诞快乐',
    suggestion: {
      en: 'Consider "Happy holidays" to include non-Christian audiences.',
      zh: '建议改用「节日快乐」，更包容。',
    },
    regions: { en: 'Global (non-Christian majority countries)', zh: '全球（非基督教为主的国家）' },
    level: 'info',
  },
  {
    term: '复活节',
    suggestion: {
      en: 'Consider "Spring celebration" for secular or multi-faith audiences.',
      zh: '非宗教或多信仰语境建议改用「春季庆典」。',
    },
    regions: { en: 'Global (non-Christian majority countries)', zh: '全球（非基督教为主的国家）' },
    level: 'info',
  },
  {
    term: '万圣节',
    suggestion: {
      en: 'Not celebrated in many cultures; may be seen as inappropriate in conservative regions.',
      zh: '许多文化不过万圣节，在保守地区可能被视为不恰当。',
    },
    regions: { en: 'Middle East, conservative cultures', zh: '中东及保守文化地区' },
    level: 'info',
  },
  {
    term: '斋月',
    suggestion: {
      en: 'Ensure a respectful tone and avoid food/drink promotions during Ramadan.',
      zh: '需保持尊重语气，避免与餐饮促销搭配。',
    },
    regions: { en: 'Non-Muslim audiences may misunderstand', zh: '非穆斯林受众可能误解' },
    level: 'warning',
  },
  {
    term: '上帝',
    suggestion: {
      en: 'Religious reference. Consider neutral wording for secular audiences.',
      zh: '宗教专有引用，面向世俗受众建议改为中性表达。',
    },
    regions: { en: 'Secular / multi-faith audiences', zh: '世俗／多信仰受众' },
    level: 'info',
  },
  {
    term: '耶稣',
    suggestion: {
      en: 'Christian-specific. Consider removing for general audiences.',
      zh: '基督教专有引用，面向大众受众时建议移除。',
    },
    regions: { en: 'Non-Christian audiences', zh: '非基督教受众' },
    level: 'warning',
  },
  {
    term: '真主',
    suggestion: {
      en: 'Islamic reference — use with deep respect only.',
      zh: '伊斯兰教专有引用，务必保持高度尊重。',
    },
    regions: { en: 'Non-Muslim audiences may misinterpret', zh: '非穆斯林受众可能误解' },
    level: 'warning',
  },
  {
    term: '祈祷',
    suggestion: {
      en: 'Religious connotation. Consider "hope" or "wish".',
      zh: '带宗教含义，建议改用「期盼」「希望」。',
    },
    regions: { en: 'Secular / multi-faith audiences', zh: '世俗／多信仰受众' },
    level: 'info',
  },
  {
    term: '阿门',
    suggestion: {
      en: 'Strongly religious. Avoid in secular marketing copy.',
      zh: '宗教色彩很强，世俗文案中建议避免。',
    },
    regions: { en: 'Secular / multi-faith audiences', zh: '世俗／多信仰受众' },
    level: 'warning',
  },
];

/**
 * Category 4: Slang / pun with cross-cultural ambiguity (English copy)
 */
const CULTURALLY_AMBIGUOUS_SLANG = [
  {
    term: 'sick',
    meanings: { us_uk: 'Cool, awesome (positive slang)', other: 'Ill, unwell (negative)' },
    suggestion: {
      en: '"Sick" means "cool" in US/UK slang but "ill" elsewhere. Consider "amazing", "incredible", or "awesome" for global clarity.',
      zh: '「sick」在英美俚语中是「酷」，其他地区却是「生病」。面向全球建议改用 amazing / incredible / awesome。',
    },
    level: 'warning',
  },
  {
    term: 'lit',
    meanings: { us_uk: 'Exciting, excellent', other: 'Intoxicated/drunk (literal), or past tense of "light"' },
    suggestion: {
      en: '"Lit" is trendy English slang but may confuse non-native speakers. Use "amazing" instead.',
      zh: '「lit」是流行英语俚语，非母语读者容易困惑，建议改用 amazing。',
    },
    level: 'info',
  },
  {
    term: 'fire',
    meanings: { us_uk: 'Excellent, amazing', other: 'Literal fire / danger / emergency' },
    suggestion: {
      en: '"Fire" as slang for "great" may be misinterpreted as literal fire. Use "amazing" for clarity.',
      zh: '「fire」表示「很棒」时可能被理解成真的着火，建议改用 amazing。',
    },
    level: 'info',
  },
  {
    term: 'dope',
    meanings: { us_uk: 'Cool, great', other: 'Drugs/narcotics (literal meaning)' },
    suggestion: {
      en: '"Dope" means "cool" in slang but refers to drugs in many cultures. Avoid in health/wellness contexts.',
      zh: '「dope」俚语里是「酷」，但在很多文化中直接指毒品，健康类内容务必避免。',
    },
    level: 'warning',
  },
  {
    term: 'wicked',
    meanings: { us_uk: 'Very/extremely (New England), cool (UK)', other: 'Evil, sinful (literal)' },
    suggestion: {
      en: '"Wicked" as slang may be read as "evil" by non-native speakers. Use "extremely" instead.',
      zh: '「wicked」做俚语时会被非母语读者理解为「邪恶」，建议改用 extremely。',
    },
    level: 'info',
  },
  {
    term: 'bad',
    meanings: { us_uk: 'Good (ironic slang, "badass")', other: 'Of poor quality (literal)' },
    suggestion: {
      en: '"Bad" as positive slang can confuse non-native speakers. Use "incredible" for clarity.',
      zh: '「bad」反用表示「好」时容易让非母语读者误解，建议改用 incredible。',
    },
    level: 'warning',
  },
  {
    term: 'bang',
    meanings: { us_uk: 'Excellent ("bang for your buck")', other: 'Violence/gun sound, sexual slang' },
    suggestion: {
      en: '"Bang" has multiple sensitive connotations globally. Avoid in professional copy; use "great value".',
      zh: '「bang」在全球有多种敏感含义，专业文案中建议避免，可用 great value。',
    },
    level: 'danger',
  },
  {
    term: 'kill it',
    meanings: { us_uk: 'Perform excellently ("you will kill it!")', other: 'Literal violence' },
    suggestion: {
      en: '"Kill it" as encouragement can sound violent to non-native speakers. Use "nail it" or "do great".',
      zh: '「kill it」作鼓励语时，非母语读者会觉得暴力，建议改用 nail it / do great。',
    },
    level: 'warning',
  },
  {
    term: 'crush',
    meanings: { us_uk: 'Dominate/succeed ("crush the competition")', other: 'Romantic infatuation, physical destruction' },
    suggestion: {
      en: '"Crush" has romantic and violent connotations. "Excel" or "outperform" is safer.',
      zh: '「crush」同时有恋爱与破坏的含义，改用 excel / outperform 更稳妥。',
    },
    level: 'info',
  },
  {
    term: 'bloody',
    meanings: { uk_australia: 'Intensifier ("bloody good")', other: 'Literal blood / gory / violent' },
    suggestion: {
      en: '"Bloody" is mild slang in UK/Australia but sounds violent elsewhere. Avoid in global copy.',
      zh: '「bloody」在英澳是轻度加强词，其他地区听起来很血腥，全球文案建议避免。',
    },
    level: 'warning',
  },
  {
    term: 'savage',
    meanings: { us_uk: 'Bold, fierce, impressive (positive slang)', other: 'Uncivilized, violent (colonial connotations)' },
    suggestion: {
      en: '"Savage" has colonial and racial undertones for some audiences. Use "fierce" or "bold".',
      zh: '「savage」对部分受众带有殖民与种族色彩，建议改用 fierce 或 bold。',
    },
    level: 'warning',
  },
];

// Emoji-overuse threshold (was hardcoded as > 5)
const EMOJI_OVERUSE_THRESHOLD = 5;
// How many key emojis the one-click fix keeps
const EMOJI_KEEP_COUNT = 3;

const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pick = (value, lang) => {
  if (value && typeof value === 'object') {
    return value[lang] !== undefined ? value[lang] : value.en;
  }
  return value;
};

export function countEmojis(text) {
  if (!text) return 0;
  return (text.match(EMOJI_RE) || []).length;
}

// ============================================================
// Detection engine — runs all 4 categories
// ============================================================

/**
 * @param {string} text - copy to analyse
 * @param {string} [lang] - 'en' | 'zh' (UI language, drives result wording)
 * @returns {{ risks: Array, score: number }}
 */
export function runCulturalCheck(text, lang = 'en') {
  const T = (key, params) => translate(lang, key, params);
  const isZh = lang === 'zh';

  if (!text || typeof text !== 'string') {
    return { risks: [], score: 100 };
  }

  const risks = [];
  const lowerText = text.toLowerCase();

  // ---- Category 1a: Culturally sensitive emoji detection ----
  const foundEmojiRisks = [];
  CULTURALLY_SENSITIVE_EMOJIS.forEach((rule) => {
    if (text.includes(rule.emoji)) {
      foundEmojiRisks.push(rule);
    }
  });

  if (foundEmojiRisks.length > 0) {
    const emojiNames = foundEmojiRisks.map((r) => r.emoji + ' ' + pick(r.name, lang)).join(', ');
    const worstLevel = foundEmojiRisks.some((r) => r.emoji === '👍' || r.emoji === '🍑')
      ? 'warning'
      : 'info';

    risks.push({
      type: 'emoji_cultural',
      icon: '🌍',
      title: T('cultural_sensitive_emoji'),
      level: worstLevel,
      description: isZh
        ? `发现含义随文化变化的表情：${emojiNames}。它们在部分国家可能被误读。`
        : `Found emojis with different meanings across cultures: ${emojiNames}. These may be misinterpreted in certain regions.`,
      suggestion: foundEmojiRisks
        .map((r) => `• ${r.emoji} ${pick(r.name, lang)}: ${pick(r.suggestion, lang)}`)
        .join('\n'),
      details: foundEmojiRisks,
    });
  }

  // ---- Category 1b: Emoji overuse ----
  const emojiCount = countEmojis(text);
  if (emojiCount > EMOJI_OVERUSE_THRESHOLD) {
    risks.push({
      type: 'emoji_overuse',
      icon: '🎭',
      title: T('emoji_overuse'),
      level: emojiCount > 8 ? 'danger' : 'warning',
      description: T('emoji_overuse_desc', { count: emojiCount }),
      suggestion: T('emoji_overuse_suggestion'),
    });
  }

  // ---- Category 2: Culturally sensitive number detection ----
  const foundNumberRisks = [];
  CULTURALLY_SENSITIVE_NUMBERS.forEach((rule) => {
    // Match the number as a standalone number (not part of a larger number)
    const regex = new RegExp(`(?<!\\d)${escapeRegex(rule.number)}(?!\\d)`, 'g');
    if (regex.test(text)) {
      foundNumberRisks.push(rule);
    }
  });

  if (foundNumberRisks.length > 0) {
    const numList = foundNumberRisks.map((r) => r.number).join(', ');
    const worstLevel = foundNumberRisks.some((r) => r.number === '666' || r.number === '911')
      ? 'danger'
      : 'warning';

    risks.push({
      type: 'number_cultural',
      icon: '🔢',
      title: T('cultural_sensitive_numbers'),
      level: worstLevel,
      description: isZh
        ? `发现带有文化含义的数字：${numList}。它们在特定地区可能产生意料之外的联想。`
        : `Found numbers with cultural significance: ${numList}. These may carry unintended meanings in certain regions.`,
      suggestion: foundNumberRisks
        .map((r) => `• ${isZh ? '数字' : 'Number'} ${r.number}: ${pick(r.suggestion, lang)}`)
        .join('\n'),
      details: foundNumberRisks,
    });
  }

  // ---- Category 3: Religious / holiday terms ----
  const foundReligiousRisks = [];
  RELIGIOUS_HOLIDAY_TERMS.forEach((rule) => {
    if (lowerText.includes(rule.term)) {
      foundReligiousRisks.push(rule);
    }
  });

  if (foundReligiousRisks.length > 0) {
    const termList = foundReligiousRisks.map((r) => `"${r.term}"`).join(', ');
    const worstLevel = foundReligiousRisks.some((r) => r.level === 'warning')
      ? 'warning'
      : 'info';

    risks.push({
      type: 'religious_terms',
      icon: '🙏',
      title: T('religious_references'),
      level: worstLevel,
      description: isZh
        ? `发现带宗教或文化含义的词：${termList}。可能无法覆盖所有受众。`
        : `Found terms with religious or cultural significance: ${termList}. These may not be inclusive of all audiences.`,
      suggestion: foundReligiousRisks
        .map((r) => `• "${r.term}": ${pick(r.suggestion, lang)}`)
        .join('\n'),
      details: foundReligiousRisks,
    });
  }

  // ---- Category 4: Slang / pun cross-cultural ambiguity ----
  const foundSlangRisks = [];
  const seenSlang = new Set();
  CULTURALLY_AMBIGUOUS_SLANG.forEach((rule) => {
    // Use word boundary matching to avoid partial matches.
    // (English-only: \b does not work with CJK, so Chinese terms are
    // handled in the religious/holiday list above.)
    const regex = new RegExp(`\\b${escapeRegex(rule.term)}\\b`, 'i');
    if (regex.test(text) && !seenSlang.has(rule.term)) {
      seenSlang.add(rule.term);
      foundSlangRisks.push(rule);
    }
  });

  if (foundSlangRisks.length > 0) {
    const slangList = foundSlangRisks.map((r) => `"${r.term}"`).join(', ');
    const worstLevel = foundSlangRisks.some((r) => r.level === 'danger')
      ? 'danger'
      : foundSlangRisks.some((r) => r.level === 'warning')
        ? 'warning'
        : 'info';

    risks.push({
      type: 'slang_ambiguity',
      icon: '💬',
      title: T('slang_ambiguity'),
      level: worstLevel,
      description: isZh
        ? `发现跨文化含义不同的俚语：${slangList}。非母语读者可能困惑或被冒犯。`
        : `Found slang terms with different meanings across cultures: ${slangList}. These may confuse or offend non-native English speakers.`,
      suggestion: foundSlangRisks
        .map((r) => `• "${r.term}": ${pick(r.suggestion, lang)}`)
        .join('\n'),
      details: foundSlangRisks,
    });
  }

  // ---- Score calculation ----
  let score = 100;
  risks.forEach((risk) => {
    if (risk.level === 'danger') score -= 30;
    else if (risk.level === 'warning') score -= 15;
    else if (risk.level === 'info') score -= 5;
  });
  score = Math.max(0, Math.min(100, score));

  return { risks, score };
}

// ============================================================
// One-click apply — deterministic safe replacements
// ============================================================
// Tier 1 (auto): sensitive emoji → neutral emoji, slang → plain
//                wording, religious/holiday term → inclusive phrasing.
//                Covers BOTH English and Chinese copy.
// Tier 2 (auto): emoji overuse → keep only the first 3 key emojis.
// Manual      : numbers — rewriting "4 people" as "3 people" would
//                falsify the content, so those stay user-editable.
// ============================================================

const AUTO_REPLACEMENTS = {
  // ---- Sensitive emoji → neutral / safe emoji ----
  '👍': '✅',
  '🍑': '🍎',
  '🤙': '👋',
  // ---- English slang → clear global wording ----
  sick: 'amazing',
  lit: 'amazing',
  fire: 'amazing',
  dope: 'cool',
  wicked: 'extremely',
  bad: 'incredible',
  bang: 'great value',
  'kill it': 'do great',
  crush: 'excel',
  bloody: 'very',
  savage: 'bold',
  // ---- English religious / holiday terms → inclusive phrasing ----
  christmas: 'Holiday season',
  easter: 'Spring celebration',
  god: 'goodness',
  prayer: 'positive thoughts',
  blessed: 'grateful',
  holy: 'sacred',
  // ---- Chinese religious / holiday terms → inclusive phrasing ----
  圣诞快乐: '节日快乐',
  圣诞节: '节日季',
  复活节: '春季庆典',
  万圣节: '秋季庆典',
  上帝: '老天',
  祈祷: '期盼',
};

/**
 * Keep at most `max` emojis (the first N distinct ones), drop the rest.
 * @returns {{ text: string, before: number, after: number, removed: number }}
 */
export function trimExcessiveEmojis(text, max = EMOJI_KEEP_COUNT) {
  const matches = text ? (text.match(EMOJI_RE) || []) : [];
  const before = matches.length;
  if (before <= max) {
    return { text, before, after: before, removed: 0 };
  }

  const keep = [];
  matches.forEach((e) => {
    if (!keep.includes(e) && keep.length < max) keep.push(e);
  });

  const kept = new Set();
  let result = text.replace(EMOJI_RE, (m) => {
    if (keep.includes(m) && !kept.has(m)) {
      kept.add(m);
      return m;
    }
    return '';
  });

  // Tidy up the gaps left behind by removed emojis
  result = result
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');

  const after = countEmojis(result);
  return { text: result, before, after, removed: before - after };
}

/**
 * Items the one-click fix intentionally does NOT rewrite.
 * @returns {Array<{ label: string, note: string }>}
 */
export function collectManualNotes(text, lang = 'en') {
  const notes = [];
  if (!text) return notes;

  // Numbers that are still present (advisory-only ones excluded)
  CULTURALLY_SENSITIVE_NUMBERS.forEach((rule) => {
    if (rule.advisoryOnly) return;
    const regex = new RegExp(`(?<!\\d)${escapeRegex(rule.number)}(?!\\d)`, 'g');
    if (regex.test(text)) {
      notes.push({ label: rule.number, note: pick(rule.short, lang) });
    }
  });

  // Sensitive emojis with no safe swap defined
  CULTURALLY_SENSITIVE_EMOJIS.forEach((rule) => {
    if (!AUTO_REPLACEMENTS[rule.emoji] && text.includes(rule.emoji)) {
      notes.push({
        label: `${rule.emoji} ${pick(rule.name, lang)}`,
        note: pick(rule.suggestion, lang),
      });
    }
  });

  return notes;
}

/**
 * Apply every safe (deterministic) fix to the given text.
 *
 * @param {string} text
 * @param {string} [lang] - 'en' | 'zh', drives the manual-note wording
 * @returns {{
 *   text: string,
 *   changes: Array<{ from: string, to: string }>,
 *   emojiTrim: { before: number, after: number } | null,
 *   manualNotes: Array<{ label: string, note: string }>
 * }}
 */
export function applyCulturalFixes(text, lang = 'en') {
  if (!text) return { text: '', changes: [], emojiTrim: null, manualNotes: [] };

  let result = text;
  const changes = [];

  Object.entries(AUTO_REPLACEMENTS).forEach(([from, to]) => {
    // Word boundaries only make sense for Latin word-like keys
    const wordLike = /^[A-Za-z0-9 ]+$/.test(from);
    const re = wordLike
      ? new RegExp(`\\b${escapeRegex(from)}\\b`, 'gi')
      : new RegExp(escapeRegex(from), 'g');
    let matched = false;
    result = result.replace(re, () => {
      matched = true;
      return to;
    });
    if (matched) changes.push({ from, to });
  });

  // Emoji overuse → keep only the first 3 key emojis
  let emojiTrim = null;
  if (countEmojis(result) > EMOJI_OVERUSE_THRESHOLD) {
    const trimmed = trimExcessiveEmojis(result, EMOJI_KEEP_COUNT);
    if (trimmed.removed > 0) {
      result = trimmed.text;
      emojiTrim = { before: trimmed.before, after: trimmed.after };
    }
  }

  return {
    text: result,
    changes,
    emojiTrim,
    manualNotes: collectManualNotes(result, lang),
  };
}

// ============================================================
// Component — expandable cultural check panel
// ============================================================

export default function CulturalCheck({ text, themeName = 'pink', onApply }) {
  const theme = getTheme(themeName);
  const { t, language } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const { risks, score } = runCulturalCheck(text, language);

  const getScoreColor = () => {
    if (score >= 80) return COLORS.BASE.success;
    if (score >= 50) return COLORS.BASE.warning;
    return COLORS.BASE.danger;
  };

  const getScoreLabel = () => {
    if (score >= 80) return t('cultural_good');
    if (score >= 50) return t('cultural_fair');
    return t('cultural_poor');
  };

  const getScoreIcon = () => {
    if (score >= 80) return '✅';
    if (score >= 50) return '⚠️';
    return '❌';
  };

  const getLevelColor = (level) => {
    if (level === 'danger') return COLORS.BASE.danger;
    if (level === 'warning') return COLORS.BASE.warning;
    return COLORS.BASE.subtitle;
  };

  const getLevelLabel = (level) => {
    if (level === 'danger') return t('level_high_risk');
    if (level === 'warning') return t('level_medium');
    return t('level_info');
  };

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  // One-click apply: preview everything (auto + manual) in a confirm
  // dialog, then write the fixed copy back into the editor.
  const handleApply = useCallback(() => {
    const { text: fixed, changes, emojiTrim, manualNotes } = applyCulturalFixes(text, language);

    const previewLines = changes.map((c) => `• ${c.from} → ${c.to}`);
    if (emojiTrim) {
      previewLines.push(
        '• ' + t('cultural_apply_emoji', { before: emojiTrim.before, after: emojiTrim.after })
      );
    }

    // Manual TODO list (numbers / emojis without a safe swap)
    const manualLines = manualNotes.slice(0, 4).map((n) => `• ${n.label}: ${n.note}`);
    if (manualNotes.length > 4) {
      manualLines.push('• ' + t('cultural_manual_more', { count: manualNotes.length - 4 }));
    }

    // Nothing deterministic to do → still tell the user what to fix
    if (previewLines.length === 0) {
      if (manualLines.length === 0) {
        Alert.alert(t('cultural_no_change'), undefined, [{ text: t('ok') }]);
        return;
      }
      Alert.alert(
        t('cultural_manual_title'),
        `${t('cultural_manual_desc')}\n\n${manualLines.join('\n')}`,
        [{ text: t('ok') }]
      );
      return;
    }

    const body = [
      t('cultural_apply_desc'),
      '',
      previewLines.join('\n'),
      manualLines.length > 0 ? `\n${t('cultural_manual_after')}\n${manualLines.join('\n')}` : '',
    ].join('\n');

    Alert.alert(t('cultural_apply_title'), body, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('cultural_apply'),
        onPress: () => onApply && onApply(fixed),
      },
    ]);
  }, [text, onApply, t, language]);

  if (!text) return null;

  return (
    <View style={[styles.container, { borderColor: COLORS.BASE.border }]}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={handleToggle}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.title, { color: theme.title }]}>
            {t('cultural_fit_check')}
          </Text>
          <View
            style={[
              styles.scoreBadge,
              { backgroundColor: getScoreColor() + '20' },
            ]}
          >
            <Text style={[styles.scoreText, { color: getScoreColor() }]}>
              {getScoreIcon()} {score} · {getScoreLabel()}
            </Text>
          </View>
        </View>
        <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* No risks */}
      {expanded && risks.length === 0 && (
        <View style={styles.noRisksContainer}>
          <Text style={styles.noRisksIcon}>✅</Text>
          <Text style={[styles.noRisksText, { color: COLORS.BASE.success }]}>
            {t('cultural_no_issues')}
          </Text>
          <Text style={[styles.noRisksSubtext, { color: COLORS.BASE.subtitle }]}>
            {t('cultural_safe')}
          </Text>
        </View>
      )}

      {/* Risk list */}
      {expanded && risks.length > 0 && (
        <View style={styles.risksContainer}>
          {risks.map((risk, idx) => (
            <View
              key={risk.type}
              style={[
                styles.riskItem,
                idx < risks.length - 1 && styles.riskItemBorder,
              ]}
            >
              {/* Risk header */}
              <View style={styles.riskHeader}>
                <Text style={styles.riskIcon}>{risk.icon}</Text>
                <Text style={[styles.riskTitle, { color: theme.title }]}>
                  {risk.title}
                </Text>
                <View
                  style={[
                    styles.levelBadge,
                    { backgroundColor: getLevelColor(risk.level) + '20' },
                  ]}
                >
                  <Text style={[styles.levelText, { color: getLevelColor(risk.level) }]}>
                    {getLevelLabel(risk.level)}
                  </Text>
                </View>
              </View>

              {/* Description */}
              <Text style={[styles.riskDesc, { color: COLORS.BASE.body }]}>
                {risk.description}
              </Text>

              {/* Suggestion (multi-line) */}
              <View style={[styles.suggestionBox, { backgroundColor: theme.primaryLight }]}>
                <Text style={[styles.suggestionLabel, { color: theme.primary }]}>
                  {t('cultural_suggestions')}
                </Text>
                <Text style={[styles.suggestionText, { color: theme.primary }]}>
                  {risk.suggestion}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* One-click apply */}
      {risks.length > 0 && onApply && (
        <TouchableOpacity
          style={[styles.applyBtn, { backgroundColor: theme.primary }]}
          onPress={handleApply}
          activeOpacity={0.7}
        >
          <Text style={styles.applyBtnText}>✨ {t('cultural_apply')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    backgroundColor: COLORS.BASE.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    marginRight: SPACING.sm,
  },
  scoreBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  scoreText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  expandIcon: {
    fontSize: 12,
    color: COLORS.BASE.placeholder,
    marginLeft: SPACING.sm,
  },

  // No risks
  noRisksContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
  },
  noRisksIcon: {
    fontSize: 28,
    marginBottom: SPACING.sm,
  },
  noRisksText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  noRisksSubtext: {
    fontSize: FONT_SIZE.xs,
  },

  // Risks list
  risksContainer: {
    marginTop: SPACING.md,
  },
  riskItem: {
    paddingVertical: SPACING.md,
  },
  riskItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BASE.borderLight,
  },
  riskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    flexWrap: 'wrap',
  },
  riskIcon: {
    fontSize: 18,
    marginRight: SPACING.sm,
  },
  riskTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    flex: 1,
  },
  levelBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '700',
  },
  riskDesc: {
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  suggestionBox: {
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
  },
  suggestionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  suggestionText: {
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
  },

  // One-click apply button
  applyBtn: {
    marginTop: SPACING.lg,
    height: 46,
    borderRadius: RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#fff',
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
});

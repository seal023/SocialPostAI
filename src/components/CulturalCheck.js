// ============================================================
// CulturalCheck — Enhanced cultural fit detection
// 4 categories with cross-cultural awareness:
//   1. Emoji cultural meaning (👍🚫🤌 etc.)
//   2. Number cultural sensitivity (4, 13, 420, 666, 911)
//   3. Religious / holiday terms (Christmas→Holiday, Ramadan, etc.)
//   4. Slang / pun cross-cultural ambiguity (sick, lit, fire, etc.)
// Exports runCulturalCheck(text) for external use
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SHADOWS, getTheme } from '../themes/theme';
import { useLanguage } from '../context/LanguageContext';

// ============================================================
// Detection rule databases — all with cultural context
// ============================================================

/**
 * Category 1: Culturally sensitive emojis
 * Each entry: { emoji, name, regions, issue, suggestion }
 */
const CULTURALLY_SENSITIVE_EMOJIS = [
  {
    emoji: '👍',
    name: 'Thumbs Up',
    regions: 'Middle East, West Africa, Brazil, Germany',
    issue: 'In many Middle Eastern and West African countries, 👍 is equivalent to a middle finger. In Germany it can signal "one" rather than approval.',
    suggestion: 'Replace with ✅ or "Great!" text for global audiences.',
  },
  {
    emoji: '🚫',
    name: 'Prohibited',
    regions: 'Global (ambiguous meaning)',
    issue: '🚫 means "forbidden/banned" in most contexts, but some readers interpret it as simply "stop" or "no entry" without the severity of prohibition.',
    suggestion: 'Use clearer text like "Not allowed" or "Banned" to avoid ambiguity.',
  },
  {
    emoji: '🤌',
    name: 'Pinched Fingers',
    regions: 'Italy, Mediterranean vs. Global',
    issue: 'In Italy this means "What do you want?" but globally it can be confused with a gesture meaning "precise" or even something offensive.',
    suggestion: 'Avoid unless targeting an Italian audience who understands the nuance.',
  },
  {
    emoji: '🤙',
    name: 'Call Me Hand',
    regions: 'Hawaii, surf culture vs. Latin America',
    issue: 'In Hawaii and surf culture this means "hang loose." In parts of Latin America, it can represent a risky or illegal proposition.',
    suggestion: 'Use only for Hawaiian/surf context; otherwise use ✌️ or 👋.',
  },
  {
    emoji: '✌️',
    name: 'Peace Sign (palm inward)',
    regions: 'UK, Australia, Ireland',
    issue: 'When the back of the hand faces outward (palm inward), this is equivalent to a middle finger in the UK, Australia, and Ireland.',
    suggestion: 'Ensure peace sign is palm-outward facing, or use 🕊️ for peace instead.',
  },
  {
    emoji: '🤡',
    name: 'Clown Face',
    regions: 'Global',
    issue: 'Often used as an insult ("you\'re a clown/joke") rather than humor. Can come across as mocking.',
    suggestion: 'Use only if intentionally playful/teasing; avoid in professional or sensitive contexts.',
  },
  {
    emoji: '🐍',
    name: 'Snake',
    regions: 'Global (especially US pop culture)',
    issue: 'In social media culture, 🐍 implies "backstabber" or "traitor" (Taylor Swift drama). Not a neutral animal emoji.',
    suggestion: 'Use only if the snake symbolism is intentional; avoid as a casual animal reference.',
  },
  {
    emoji: '🍑',
    name: 'Peach',
    regions: 'Global',
    issue: 'Widely understood as a butt reference in social media, not just a fruit. May be inappropriate for brand content.',
    suggestion: 'Avoid in professional or family-friendly brand content. Use 🍎 or 🥝 instead for fruit references.',
  },
  {
    emoji: '🫡',
    name: 'Saluting Face',
    regions: 'Military / Authority contexts',
    issue: 'Can be interpreted as respectful or as sarcastic obedience depending on context. Ambiguous in casual use.',
    suggestion: 'Use with clear context or replace with "Respect" text.',
  },
];

/**
 * Category 2: Culturally sensitive numbers
 */
const CULTURALLY_SENSITIVE_NUMBERS = [
  {
    number: '4',
    regions: 'East Asia (China, Japan, Korea)',
    issue: 'In many East Asian languages, "4" sounds like the word for "death" (四/死). Considered very unlucky.',
    suggestion: 'Avoid pricing at $4, 4-packs, or emphasizing the number 4 when targeting East Asian markets. Use 3 or 5 instead.',
  },
  {
    number: '13',
    regions: 'Western countries (US, Europe)',
    issue: 'Considered unlucky in many Western cultures (triskaidekaphobia). Many buildings skip the 13th floor.',
    suggestion: 'Avoid using 13 in pricing, discounts, or counts for Western audiences. Use 12 or 14 instead.',
  },
  {
    number: '420',
    regions: 'North America, increasingly global',
    issue: 'Strongly associated with cannabis/marijuana culture (April 20th). Using 420 as a price or quantity may be misinterpreted.',
    suggestion: 'Avoid 420 as a number in pricing or quantities unless the cannabis reference is intentional.',
  },
  {
    number: '666',
    regions: 'Christian-majority countries',
    issue: 'The "Number of the Beast" from the Book of Revelation. Considered evil or satanic in Christian cultures.',
    suggestion: 'Never use 666 in any marketing context for Western/Christian audiences.',
  },
  {
    number: '911',
    regions: 'United States',
    issue: 'The US emergency phone number. Using 911 as a price ($9.11) or in any non-emergency context is considered insensitive.',
    suggestion: 'Avoid 911 as a number in any commercial context for US audiences.',
  },
  {
    number: '7',
    regions: 'Global (positive but religious)',
    issue: 'While considered lucky in many cultures, 7 has strong religious significance (7 days of creation, 7 heavens in Islam). May unintentionally invoke religious connotations.',
    suggestion: 'Generally safe to use, but be aware of religious undertones in faith-diverse audiences.',
  },
  {
    number: '8',
    regions: 'China',
    issue: 'In Chinese, "8" (八) sounds like "wealth/prosper" (发). Very auspicious. Using 8 may be seen as trying too hard to appeal to Chinese consumers.',
    suggestion: 'Using 8 is positive for Chinese markets but should feel natural, not forced.',
  },
];

/**
 * Category 3: Religious / holiday / culturally specific terms
 */
const RELIGIOUS_HOLIDAY_TERMS = [
  {
    term: 'christmas',
    suggestion: 'Consider using "Holiday season" or "Winter holidays" to include non-Christian audiences.',
    regions: 'Global (non-Christian majority countries)',
    level: 'info',
  },
  {
    term: 'easter',
    suggestion: 'Consider using "Spring celebration" for secular contexts or multi-faith audiences.',
    regions: 'Global (non-Christian majority countries)',
    level: 'info',
  },
  {
    term: 'ramadan',
    suggestion: 'When referencing Ramadan, ensure respectful tone. Avoid pairing with food/drink promotions.',
    regions: 'Global (non-Muslim audiences may misunderstand)',
    level: 'warning',
  },
  {
    term: 'halloween',
    suggestion: 'Not celebrated in many cultures and may be seen as inappropriate or offensive in conservative regions.',
    regions: 'Middle East, conservative cultures',
    level: 'info',
  },
  {
    term: 'god',
    suggestion: 'May alienate non-religious or polytheistic audiences. Consider "goodness" or remove if not faith-focused.',
    regions: 'Secular / multi-faith audiences',
    level: 'info',
  },
  {
    term: 'jesus',
    suggestion: 'Specifically Christian reference. Consider removing for general audiences.',
    regions: 'Non-Christian audiences',
    level: 'warning',
  },
  {
    term: 'christ',
    suggestion: 'Christian-specific. "Christmas" → "Holiday", "Christian" context should be explicit if used.',
    regions: 'Non-Christian audiences',
    level: 'warning',
  },
  {
    term: 'allah',
    suggestion: 'Islamic reference. Use with deep respect; avoid casual or commercial usage.',
    regions: 'Non-Muslim audiences may misinterpret',
    level: 'warning',
  },
  {
    term: 'prayer',
    suggestion: 'Has religious connotations. Consider "hope", "wish", or "positive thoughts" for secular contexts.',
    regions: 'Secular / multi-faith audiences',
    level: 'info',
  },
  {
    term: 'blessed',
    suggestion: 'Religious undertone. Consider "grateful", "fortunate", or "lucky" for inclusive language.',
    regions: 'Secular / multi-faith audiences',
    level: 'info',
  },
  {
    term: 'amen',
    suggestion: 'Strongly religious. Avoid in secular marketing copy.',
    regions: 'Secular / multi-faith audiences',
    level: 'warning',
  },
  {
    term: 'holy',
    suggestion: 'Religious connotation. Consider "sacred" (more universal) or rephrase entirely.',
    regions: 'Secular / multi-faith audiences',
    level: 'info',
  },
  {
    term: 'diwali',
    suggestion: 'Hindu festival. When referencing, ensure authentic and respectful representation.',
    regions: 'Non-Hindu audiences',
    level: 'info',
  },
];

/**
 * Category 4: Slang / pun with cross-cultural ambiguity
 */
const CULTURALLY_AMBIGUOUS_SLANG = [
  {
    term: 'sick',
    meanings: { us_uk: 'Cool, awesome (positive slang)', other: 'Ill, unwell (negative)' },
    suggestion: '"Sick" means "cool" in US/UK slang but "ill" elsewhere. Consider "amazing", "incredible", or "awesome" for global clarity.',
    level: 'warning',
  },
  {
    term: 'lit',
    meanings: { us_uk: 'Exciting, excellent', other: 'Intoxicated/drunk (literal), or past tense of "light"' },
    suggestion: '"Lit" is trendy English slang but may confuse non-native speakers. Use "amazing" or "fire" (with caution) instead.',
    level: 'info',
  },
  {
    term: 'fire',
    meanings: { us_uk: 'Excellent, amazing', other: 'Literal fire / danger / emergency' },
    suggestion: '"Fire" as slang for "great" may be misinterpreted as literal fire. Use "amazing" or "excellent" for clarity.',
    level: 'info',
  },
  {
    term: 'dope',
    meanings: { us_uk: 'Cool, great', other: 'Drugs/narcotics (literal meaning)' },
    suggestion: '"Dope" means "cool" in slang but refers to drugs in many cultures. Avoid in any health/wellness context.',
    level: 'warning',
  },
  {
    term: 'wicked',
    meanings: { us_uk: 'Very/extremely (New England), cool (UK)', other: 'Evil, sinful (literal)' },
    suggestion: '"Wicked" as slang for "very" or "cool" may be read as "evil" by non-native speakers. Use "extremely" or "super" instead.',
    level: 'info',
  },
  {
    term: 'bad',
    meanings: { us_uk: 'Good (ironic slang, "badass")', other: 'Of poor quality (literal)' },
    suggestion: '"Bad" as positive slang ("that\'s bad!") can confuse non-native speakers. Use "incredible" or "impressive" for clarity.',
    level: 'warning',
  },
  {
    term: 'sick',
    meanings: { us_uk: 'Cool (see above)', other: 'Ill' },
    suggestion: 'Duplicate check — see primary entry above.',
    level: 'info',
  },
  {
    term: 'bang',
    meanings: { us_uk: 'Excellent ("bang for your buck")', other: 'Violence/gun sound, sexual slang' },
    suggestion: '"Bang" has multiple sensitive connotations globally. Avoid in professional copy; use "great value" or "impressive".',
    level: 'danger',
  },
  {
    term: 'kill it',
    meanings: { us_uk: 'Perform excellently ("you\'ll kill it!")', other: 'Literal violence' },
    suggestion: '"Kill it" as encouragement can sound violent to non-native speakers. Use "nail it" or "crush it" or "do great".',
    level: 'warning',
  },
  {
    term: 'crush',
    meanings: { us_uk: 'Dominate/succeed ("crush the competition")', other: 'Romantic infatuation, physical destruction' },
    suggestion: '"Crush" has romantic and violent connotations. Context matters; "excel" or "outperform" is safer.',
    level: 'info',
  },
  {
    term: 'bloody',
    meanings: { uk_australia: 'Intensifier ("bloody good")', other: 'Literal blood / gory / violent' },
    suggestion: '"Bloody" is mild slang in UK/Australia but sounds violent in American and non-English contexts. Avoid in global copy.',
    level: 'warning',
  },
  {
    term: 'savage',
    meanings: { us_uk: 'Bold, fierce, impressive (positive slang)', other: 'Uncivilized, violent (colonial connotations)' },
    suggestion: '"Savage" has colonial and racial undertones for some audiences. Use "fierce" or "bold" for safer alternatives.',
    level: 'warning',
  },
];

// ============================================================
// Detection engine — runs all 4 categories
// ============================================================

export function runCulturalCheck(text) {
  if (!text || typeof text !== 'string') {
    return { risks: [], score: 100 };
  }

  const risks = [];
  const lowerText = text.toLowerCase();

  // ---- Category 1: Culturally sensitive emoji detection ----
  const foundEmojiRisks = [];
  CULTURALLY_SENSITIVE_EMOJIS.forEach((rule) => {
    if (text.includes(rule.emoji)) {
      foundEmojiRisks.push(rule);
    }
  });

  if (foundEmojiRisks.length > 0) {
    const emojiNames = foundEmojiRisks.map((r) => r.emoji + ' ' + r.name).join(', ');
    const worstLevel = foundEmojiRisks.some((r) => r.emoji === '👍' || r.emoji === '🍑')
      ? 'warning'
      : 'info';

    risks.push({
      type: 'emoji_cultural',
      icon: '🌍',
      title: 'Culturally Sensitive Emoji',
      level: worstLevel,
      description: `Found emojis with different meanings across cultures: ${emojiNames}. These may be misinterpreted in certain regions.`,
      suggestion: foundEmojiRisks.map((r) => `• ${r.emoji} ${r.name}: ${r.suggestion}`).join('\n'),
      details: foundEmojiRisks,
    });
  }

  // Also check emoji overuse (original check, kept)
  const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu) || []).length;
  if (emojiCount > 5) {
    risks.push({
      type: 'emoji_overuse',
      icon: '🎭',
      title: 'Emoji Overuse',
      level: emojiCount > 8 ? 'danger' : 'warning',
      description: `Found ${emojiCount} emojis — excessive emoji use may reduce credibility and professionalism.`,
      suggestion: 'Reduce to 2-3 key emojis maximum. Let the words carry the message.',
    });
  }

  // ---- Category 2: Culturally sensitive number detection ----
  const foundNumberRisks = [];
  CULTURALLY_SENSITIVE_NUMBERS.forEach((rule) => {
    // Match the number as a standalone number (not part of a larger number)
    const regex = new RegExp(`(?<!\\d)${rule.number}(?!\\d)`, 'g');
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
      title: 'Culturally Sensitive Numbers',
      level: worstLevel,
      description: `Found numbers with cultural significance: ${numList}. These may carry unintended meanings in certain regions.`,
      suggestion: foundNumberRisks.map((r) => `• Number ${r.number}: ${r.suggestion}`).join('\n'),
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
      title: 'Religious / Holiday References',
      level: worstLevel,
      description: `Found terms with religious or cultural significance: ${termList}. These may not be inclusive of all audiences.`,
      suggestion: foundReligiousRisks.map((r) => `• "${r.term}": ${r.suggestion}`).join('\n'),
      details: foundReligiousRisks,
    });
  }

  // ---- Category 4: Slang / pun cross-cultural ambiguity ----
  const foundSlangRisks = [];
  CULTURALLY_AMBIGUOUS_SLANG.forEach((rule) => {
    // Use word boundary matching to avoid partial matches
    const regex = new RegExp(`\\b${rule.term}\\b`, 'i');
    if (regex.test(text)) {
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
      title: 'Cross-Cultural Slang Ambiguity',
      level: worstLevel,
      description: `Found slang terms with different meanings across cultures: ${slangList}. These may confuse or offend non-native English speakers.`,
      suggestion: foundSlangRisks.map((r) => `• "${r.term}": ${r.suggestion}`).join('\n'),
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
// Component — expandable cultural check panel
// ============================================================

export default function CulturalCheck({ text, themeName = 'pink' }) {
  const theme = getTheme(themeName);
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const { risks, score } = runCulturalCheck(text);

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
            No cultural issues detected
          </Text>
          <Text style={[styles.noRisksSubtext, { color: COLORS.BASE.subtitle }]}>
            Your copy appears culturally safe for global audiences
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
});

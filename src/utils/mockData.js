// ============================================================
// Mock data & helpers for SocialPostAI_V2
// ============================================================

export const PLATFORMS = [
  { id: 'tiktok', name: 'Viral', icon: '🎵', color: '#000000' },
  { id: 'instagram', name: 'Visual', icon: '📸', color: '#E1306C' },
  { id: 'twitter', name: 'Brief', icon: '🐦', color: '#1DA1F2' },
  { id: 'facebook', name: 'Community', icon: '👍', color: '#1877F2' },
  { id: 'linkedin', name: 'Professional', icon: '💼', color: '#0A66C2' },
  { id: 'youtube', name: 'Video', icon: '▶️', color: '#FF0000' },
  { id: 'pinterest', name: 'Discover', icon: '📌', color: '#E60023' },
  { id: 'threads', name: 'Chat', icon: '🧵', color: '#000000' },
];

export const STYLES = [
  { id: 'lively', label: 'Lively', emoji: '🔥' },
  { id: 'professional', label: 'Professional', emoji: '💼' },
  { id: 'casual', label: 'Casual', emoji: '😎' },
  { id: 'elegant', label: 'Elegant', emoji: '📖' },
];

export const VOICE_TYPES = [
  { id: 'professional', i18nKey: 'voice_professional', emoji: '💼' },
  { id: 'warm', i18nKey: 'voice_warm', emoji: '❤️' },
  { id: 'humorous', i18nKey: 'voice_humorous', emoji: '😄' },
  { id: 'minimal', i18nKey: 'voice_minimal', emoji: '✨' },
  { id: 'inspirational', i18nKey: 'voice_inspirational', emoji: '🚀' },
];

export const TONE_LABELS = [
  'Highly Formal',
  'Very Professional',
  'Professional',
  'Semi-Professional',
  'Polite & Friendly',
  'Lively & Trendy',
  'Casual & Fun',
  'Conversational',
  'Very Casual',
  'Playful',
  'Super Casual',
];

// ---- Generate mock result ----
export function generateFullResult(platforms, style, tone, wordCount, topic) {
  const id = Date.now().toString();
  const platformNames = platforms
    .map((pid) => {
      const p = PLATFORMS.find((pl) => pl.id === pid);
      return p ? p.name : pid;
    })
    .join(', ');

  const text = generateMockText(platforms, style, tone, topic);

  return {
    id,
    platforms,
    platformNames,
    style,
    tone,
    topic,
    text,
    charCount: text.length,
    createdAt: new Date().toISOString(),
    isFavorite: false,
  };
}

function generateMockText(platforms, style, tone, topic) {
  const intros = [
    `Hey everyone! Let's talk about ${topic} — this is something you absolutely need to know about! 🔥`,
    `${topic} is changing the game and here's why you should pay attention 👀`,
    `Just discovered the most amazing thing about ${topic} and I can't keep it to myself! ✨`,
    `If you haven't tried ${topic} yet, what are you waiting for? 💯`,
  ];

  const bodies = [
    `I've been exploring ${topic} lately and honestly the results speak for themselves. Whether you're a beginner or a pro, there's something here for everyone. The key is to stay consistent and keep experimenting — you'll be amazed at what happens!`,
    `${topic} has completely transformed my approach. I used to think it was just another trend, but the impact is real. Here are my top 3 takeaways that changed everything for me. Drop a comment if you want the full breakdown! 👇`,
    `Real talk — ${topic} isn't just hype. I've seen firsthand how it creates real value and meaningful connections. The community around it is incredible, and the possibilities are endless. Who else is on this journey? 🙌`,
  ];

  const ctas = [
    `Follow for more ${topic} insights! Link in bio 🔗`,
    `Save this post and share it with someone who needs to hear this! 💙`,
    `What's your experience with ${topic}? Comment below! 👇`,
    `Double tap if you agree and don't forget to share! ❤️`,
  ];

  const intro = intros[Math.floor(Math.random() * intros.length)];
  const body = bodies[Math.floor(Math.random() * bodies.length)];
  const cta = ctas[Math.floor(Math.random() * ctas.length)];

  return `${intro}\n\n${body}\n\n${cta}`;
}

export const sampleHistory = [
  {
    id: '1',
    platforms: ['tiktok', 'instagram'],
    platformNames: 'Viral, Visual',
    style: 'lively',
    tone: 6,
    topic: 'Summer skincare routine',
    text: 'Hey everyone! Summer is here and your skincare needs an upgrade! 🔥\n\nI\'ve been testing the most amazing summer skincare routine and honestly the results speak for themselves. Whether you\'re dealing with oily skin or sun damage, there\'s something here for everyone.\n\nFollow for more skincare insights! Link in bio 🔗',
    charCount: 312,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    isFavorite: true,
  },
  {
    id: '2',
    platforms: ['linkedin'],
    platformNames: 'Professional',
    style: 'professional',
    tone: 2,
    topic: 'AI in marketing strategy',
    text: 'The integration of AI in marketing strategy is no longer optional — it\'s essential.\n\nOrganizations that leverage AI-powered analytics see a 40% improvement in campaign performance. The key is aligning AI capabilities with clear business objectives.\n\nWhat\'s your organization\'s approach to AI adoption? I\'d love to hear your perspective.',
    charCount: 335,
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    isFavorite: false,
  },
  {
    id: '3',
    platforms: ['twitter', 'threads'],
    platformNames: 'Brief, Chat',
    style: 'casual',
    tone: 8,
    topic: 'Best coffee shops in NYC',
    text: 'NYC coffee shop ranking just dropped and I have FEELINGS ☕\n\n1. Abraço - the olive oil cake alone is worth the trip\n2. Devoción - freshest beans you\'ll ever taste\n3. Sey - for the true coffee nerds\n\nHot take: NYC > Seattle for coffee. Fight me. 😤',
    charCount: 248,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    isFavorite: false,
  },
];

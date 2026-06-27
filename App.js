import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
  Clipboard,
  Platform,
  Dimensions,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';

const { width, height } = Dimensions.get('window');

// ========== 阿里云百炼 API 配置（新加坡节点） ==========
const ALIYUN_API_KEY = 'sk-ws-H.IRLMRX.JtDy.MEYCIQCBMlTJNnpo8V9btuS1QXWSYC-VK6lEiYMmmAeMIdYhSgIhAIvUrhwyGL0dEi6EdD8ie3z0RNbXBL9RlBdf8EsoVePt';
const ALIYUN_API_URL = 'https://ws-6f52kltpls7886bp.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

// ========== 平台列表 ==========
const PLATFORMS = [
  { id: 'tiktok', name: 'TikTok', icon: '🎵' },
  { id: 'instagram', name: 'Instagram', icon: '📸' },
  { id: 'facebook', name: 'Facebook', icon: '👍' },
  { id: 'twitter', name: 'X (Twitter)', icon: '🐦' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
];

// ========== 风格配置 ==========
const STYLES = [
  { id: 'formal', name: 'Formal', desc: 'Professional, polished', icon: '👔' },
  { id: 'lively', name: 'Lively', desc: 'Fun, friendly with emojis', icon: '✨' },
  { id: 'elegant', name: 'Elegant', desc: 'Poetic & inspirational', icon: '🌸' },
  { id: 'casual', name: 'Casual', desc: 'Relaxed, like chatting', icon: '💬' },
];

const STYLE_PROMPTS = {
  formal: 'Formal: Use objective, professional, polished language. Third-person perspective. Precise vocabulary. Authoritative tone.',
  lively: 'Lively: Conversational and friendly. Use short sentences, exclamation marks, emojis. Engaging and enthusiastic tone.',
  elegant: 'Elegant: Poetic and inspirational. Artistic, expressive language. Literary quality. Uplifting tone.',
  casual: 'Casual: Direct and relaxed. Everyday language. Like chatting with a friend. Accessible and straightforward.',
};

const STYLE_TEMPS = {
  formal: 0.3,
  lively: 0.8,
  elegant: 0.4,
  casual: 0.7
};

// ========== 主题配置 ==========
const THEMES = {
  pink: {
    name: 'Pink',
    primary: '#FFB7C5',
    secondary: '#FFD9E6',
    background: '#FFF0F5',
    text: '#4A4A4A',
    card: '#FFFFFF',
  },
  blue: {
    name: 'Deep Blue',
    primary: '#1E3A8A',
    secondary: '#3B82F6',
    background: '#F0F4F8',
    text: '#1E293B',
    card: '#FFFFFF',
  },
  purple: {
    name: 'Purple Dream',
    primary: '#7C3AED',
    secondary: '#A78BFA',
    background: '#F5F0FF',
    text: '#4A4A4A',
    card: '#FFFFFF',
  },
};

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(30);
  const [trialEnded, setTrialEnded] = useState(false);
  const [hasAgreedToAI, setHasAgreedToAI] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('pink');
  const [voiceRemainingToday, setVoiceRemainingToday] = useState(3);
  const [selectedPlatforms, setSelectedPlatforms] = useState(['tiktok']);
  const [topic, setTopic] = useState('');
  const [wordCount, setWordCount] = useState(200);
  const [selectedStyle, setSelectedStyle] = useState('lively');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState([]);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

  const theme = THEMES[currentTheme];

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const agreed = await AsyncStorage.getItem('hasAgreedToAI');
      if (agreed === 'true') setHasAgreedToAI(true);
      const savedTheme = await AsyncStorage.getItem('appTheme');
      if (savedTheme) setCurrentTheme(savedTheme);
      const subscribed = await AsyncStorage.getItem('isSubscribed');
      if (subscribed === 'true') setIsSubscribed(true);
      const trialStart = await AsyncStorage.getItem('trialStartDate');
      if (trialStart) {
        const daysPassed = Math.floor((Date.now() - parseInt(trialStart)) / (1000 * 3600 * 24));
        const remaining = Math.max(0, 30 - daysPassed);
        setTrialDaysLeft(remaining);
        setTrialEnded(remaining === 0 && !subscribed);
      } else {
        await AsyncStorage.setItem('trialStartDate', Date.now().toString());
        setTrialDaysLeft(30);
      }
      const lastVoiceDate = await AsyncStorage.getItem('lastVoiceDate');
      const today = new Date().toDateString();
      if (lastVoiceDate === today) {
        const remaining = await AsyncStorage.getItem('voiceRemainingToday');
        if (remaining) setVoiceRemainingToday(parseInt(remaining));
      } else {
        setVoiceRemainingToday(3);
        await AsyncStorage.setItem('lastVoiceDate', today);
        await AsyncStorage.setItem('voiceRemainingToday', '3');
      }
      const savedHistory = await AsyncStorage.getItem('postHistory');
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      } else {
        // 临时假数据，方便截图历史记录页面
        const dummyHistory = [
          { id: 1, platform: 'TikTok', content: 'Check out this amazing portable coffee maker! ☕️ #coffee #travel #portable', timestamp: Date.now() - 3600000 },
          { id: 2, platform: 'Instagram', content: 'Your morning routine just got better. Meet the coffee maker that fits in your bag. ☕️✨', timestamp: Date.now() - 7200000 },
          { id: 3, platform: 'Facebook', content: 'Never wait in line for coffee again! This portable coffee maker is a game-changer for busy mornings.', timestamp: Date.now() - 10800000 },
        ];
        setHistory(dummyHistory);
        await AsyncStorage.setItem('postHistory', JSON.stringify(dummyHistory));
      }
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 临时开放所有功能，方便截图
  const isFeatureAvailable = () => {
    return true;
  };

  const generateCopy = async () => {
    if (!topic.trim()) {
      Alert.alert('Hey!', 'What do you want to write about? ✍️');
      return;
    }
    if (!hasAgreedToAI) {
      Alert.alert(
        'AI Feature Notice',
        'Your input will be sent to Alibaba Cloud for AI processing.\n\nDo you agree?',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Agree', onPress: () => {
              setHasAgreedToAI(true);
              AsyncStorage.setItem('hasAgreedToAI', 'true');
              doGenerate();
            }
          }
        ]
      );
      return;
    }
    doGenerate();
  };

  const doGenerate = async () => {
    setIsGenerating(true);
    
    try {
      const platformName = PLATFORMS.find(p => p.id === selectedPlatforms[0])?.name || 'Social Media';
      const stylePrompt = STYLE_PROMPTS[selectedStyle];
      
      const response = await fetch(ALIYUN_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ALIYUN_API_KEY}`
        },
        body: JSON.stringify({
          model: 'qwen-turbo',
          input: {
            messages: [
              {
                role: 'system',
                content: `You are a social media copywriting expert. Generate a ${wordCount}-character post for ${platformName} about the given topic. Style requirement: ${stylePrompt}`
              },
              {
                role: 'user',
                content: `Write a ${platformName} post about: ${topic}`
              }
            ]
          },
          parameters: {
            max_tokens: Math.min(Math.floor(wordCount * 1.33), 1500),
            temperature: STYLE_TEMPS[selectedStyle] || 0.7
          }
        })
      });
      
      const data = await response.json();
      
      let generatedText = '';
      if (data.output && data.output.text) {
        generatedText = data.output.text;
      } else if (data.output && data.output.choices) {
        generatedText = data.output.choices[0]?.message?.content || 'Sorry, something went wrong. Please try again.';
      } else {
        generatedText = 'Unable to generate copy. Please try again.';
      }
      
      setGeneratedContent({
        text: generatedText,
        platform: platformName,
        style: selectedStyle,
        timestamp: Date.now(),
      });
      
      // 保存到历史记录
      const newHistory = [
        { id: Date.now(), platform: platformName, content: generatedText, timestamp: Date.now() },
        ...history.slice(0, 99)
      ];
      setHistory(newHistory);
      await AsyncStorage.setItem('postHistory', JSON.stringify(newHistory));
      
    } catch (error) {
      console.error('API Error:', error);
      Alert.alert('Error', 'Failed to generate copy. Please check your network and try again. 😅');
    } finally {
      setIsGenerating(false);
    }
  };

  const startVoiceInput = async () => {
    if (!isFeatureAvailable()) {
      setShowSubscriptionModal(true);
      return;
    }
    if (voiceRemainingToday <= 0) {
      Alert.alert('No voice tries left!', 'Come back tomorrow for 3 free tries, or upgrade to Pro for unlimited voice. 🎤');
      return;
    }
    Alert.alert('Voice Input', 'Tap OK and speak your topic...', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', onPress: () => {
          const demoText = 'portable coffee maker';
          setTopic(demoText);
          const newRemaining = voiceRemainingToday - 1;
          setVoiceRemainingToday(newRemaining);
          AsyncStorage.setItem('voiceRemainingToday', newRemaining.toString());
          Alert.alert('Recognized', `"${demoText}"`);
        }
      }
    ]);
  };

  const copyToClipboard = () => {
    if (generatedContent) {
      Clipboard.setString(generatedContent.text);
      Alert.alert('Copied!', 'Text copied to clipboard 📋');
    }
  };

  const handlePlatformSelect = (platformId) => {
    if (!isFeatureAvailable() && !selectedPlatforms.includes(platformId) && selectedPlatforms.length >= 1) {
      setShowSubscriptionModal(true);
      return;
    }
    if (selectedPlatforms.includes(platformId)) {
      setSelectedPlatforms(selectedPlatforms.filter(p => p !== platformId));
    } else {
      setSelectedPlatforms([...selectedPlatforms, platformId]);
    }
  };

  const changeTheme = async (themeId) => {
    setCurrentTheme(themeId);
    await AsyncStorage.setItem('appTheme', themeId);
    setShowThemeModal(false);
  };

  const clearAllData = async () => {
    Alert.alert('Clear All', 'This will clear:\n• Current input\n• Generated result\n• All history\n\nThis cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: async () => {
          setTopic('');
          setGeneratedContent(null);
          await AsyncStorage.removeItem('postHistory');
          setHistory([]);
          Alert.alert('Done', 'All cleared');
        }
      }
    ]);
  };

  const clearGeneratedContent = () => {
    setGeneratedContent(null);
  };

  const toggleHistorySelection = (id) => {
    if (selectedHistoryIds.includes(id)) {
      setSelectedHistoryIds(selectedHistoryIds.filter(i => i !== id));
    } else {
      setSelectedHistoryIds([...selectedHistoryIds, id]);
    }
  };

  const batchCopy = () => {
    const selectedItems = history.filter(item => selectedHistoryIds.includes(item.id));
    const text = selectedItems.map(item => `【${item.platform}】${item.content}`).join('\n---\n');
    Clipboard.setString(text);
    Alert.alert('Copied!', `${selectedItems.length} items copied 📋`);
    setSelectionMode(false);
    setSelectedHistoryIds([]);
  };

  const batchDelete = async () => {
    Alert.alert('Delete', `Delete ${selectedHistoryIds.length} items?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          const newHistory = history.filter(item => !selectedHistoryIds.includes(item.id));
          setHistory(newHistory);
          await AsyncStorage.setItem('postHistory', JSON.stringify(newHistory));
          setSelectionMode(false);
          setSelectedHistoryIds([]);
        }
      }
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Loading...</Text>
      </View>
    );
  }

  if (showHistory) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ExpoStatusBar style="dark" />
        <View style={[styles.header, { borderBottomColor: theme.primary + '20' }]}>
          <TouchableOpacity onPress={() => setShowHistory(false)} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: theme.primary }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>History</Text>
          {!selectionMode && history.length > 0 && (
            <TouchableOpacity onPress={() => setSelectionMode(true)}>
              <Text style={[styles.selectButton, { color: theme.primary }]}>Select</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {history.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={[styles.emptyText, { color: theme.text }]}>No history yet</Text>
            <Text style={[styles.emptySubtext, { color: theme.text + '99' }]}>Your generated posts will appear here</Text>
          </View>
        ) : (
          <>
            {selectionMode && (
              <View style={[styles.batchBar, { backgroundColor: theme.primary }]}>
                <Text style={styles.batchText}>{selectedHistoryIds.length} selected</Text>
                <TouchableOpacity onPress={batchCopy} style={styles.batchButton}>
                  <Text style={[styles.batchButtonText, { color: theme.primary }]}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={batchDelete} style={[styles.batchButton, styles.batchDeleteButton]}>
                  <Text style={styles.batchDeleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
            <FlatList
              data={history}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.historyItem, { backgroundColor: theme.card, borderColor: theme.primary + '20' }]}
                  onLongPress={() => {
                    setSelectionMode(true);
                    toggleHistorySelection(item.id);
                  }}
                  onPress={() => {
                    if (selectionMode) toggleHistorySelection(item.id);
                    else {
                      setGeneratedContent({ text: item.content, platform: item.platform, style: '', timestamp: item.timestamp });
                      setShowHistory(false);
                    }
                  }}
                >
                  {selectionMode && (
                    <View style={styles.checkbox}>
                      <Text>{selectedHistoryIds.includes(item.id) ? '☑️' : '⬜'}</Text>
                    </View>
                  )}
                  <View style={styles.historyContent}>
                    <Text style={[styles.historyPlatform, { color: theme.primary }]}>{item.platform}</Text>
                    <Text style={[styles.historyText, { color: theme.text }]} numberOfLines={2}>{item.content}</Text>
                    <Text style={styles.historyDate}>{new Date(item.timestamp).toLocaleString()}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </>
        )}
        
        <SubscriptionModal visible={showSubscriptionModal} onClose={() => setShowSubscriptionModal(false)} theme={theme} />
        <ThemeModal visible={showThemeModal} onClose={() => setShowThemeModal(false)} onSelectTheme={changeTheme} currentTheme={currentTheme} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ExpoStatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { borderBottomColor: theme.primary + '20' }]}>
          <View>
            <Text style={[styles.appName, { color: theme.text }]}>SocialPost AI</Text>
            <Text style={[styles.appBadge, { color: theme.primary }]}>
              {isSubscribed ? '👑 Pro' : trialDaysLeft > 0 && !trialEnded ? `🎁 ${trialDaysLeft} days left` : '✨ Free'}
            </Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={() => setShowThemeModal(true)} style={styles.iconButton}>
              <Text style={styles.iconText}>🎨</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.iconButton}>
              <Text style={styles.iconText}>📜</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearAllData} style={styles.iconButton}>
              <Text style={styles.iconText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <Text style={[styles.sectionTitle, { color: theme.text }]}>✨ Choose your platform</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.platformScroll}>
          {PLATFORMS.map(platform => (
            <TouchableOpacity
              key={platform.id}
              style={[
                styles.platformChip, 
                { backgroundColor: theme.card, borderColor: theme.primary + '30' },
                selectedPlatforms.includes(platform.id) && { backgroundColor: theme.primary }
              ]}
              onPress={() => handlePlatformSelect(platform.id)}
            >
              <Text style={styles.platformChipIcon}>{platform.icon}</Text>
              <Text style={[styles.platformChipText, selectedPlatforms.includes(platform.id) && { color: '#fff' }]}>
                {platform.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        <Text style={[styles.sectionTitle, { color: theme.text }]}>📝 What's your topic?</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, borderColor: theme.primary + '30', color: theme.text }]}
            placeholder="e.g., portable coffee maker, summer fashion, productivity tips..."
            placeholderTextColor={theme.text + '80'}
            value={topic}
            onChangeText={setTopic}
            multiline
          />
          {topic.length > 0 && (
            <TouchableOpacity onPress={() => setTopic('')} style={styles.clearInputButton}>
              <Text style={styles.clearInputText}>✖️</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={[styles.voiceButton, { backgroundColor: theme.card, borderColor: theme.primary + '30' }]} 
            onPress={startVoiceInput}
          >
            <Text style={styles.voiceButtonText}>🎤</Text>
            {!isSubscribed && trialDaysLeft > 0 && !trialEnded && (
              <Text style={[styles.voiceBadge, { backgroundColor: theme.primary }]}>{voiceRemainingToday}</Text>
            )}
          </TouchableOpacity>
        </View>
        
        <Text style={[styles.sectionTitle, { color: theme.text }]}>🎨 Pick your vibe</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {STYLES.map(style => (
            <TouchableOpacity
              key={style.id}
              style={[
                styles.styleChip, 
                { backgroundColor: theme.card, borderColor: theme.primary + '30' },
                selectedStyle === style.id && { backgroundColor: theme.primary }
              ]}
              onPress={() => setSelectedStyle(style.id)}
            >
              <Text style={styles.styleChipIcon}>{style.icon}</Text>
              <Text style={[styles.styleChipText, selectedStyle === style.id && { color: '#fff' }]}>
                {style.name}
              </Text>
              <Text style={[styles.styleChipDesc, { color: theme.text + '80' }]}>{style.desc}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        <Text style={[styles.sectionTitle, { color: theme.text }]}>📏 Length: {wordCount} chars</Text>
        <View style={styles.sliderContainer}>
          <Text style={[styles.sliderMin, { color: theme.text + '99' }]}>50</Text>
          <Slider
            style={{ flex: 1, height: 40 }}
            minimumValue={50}
            maximumValue={500}
            step={10}
            value={wordCount}
            onValueChange={setWordCount}
            minimumTrackTintColor={theme.primary}
            maximumTrackTintColor={theme.primary + '30'}
            thumbTintColor={theme.primary}
          />
          <Text style={[styles.sliderMax, { color: theme.text + '99' }]}>500</Text>
        </View>
        <View style={styles.wordShortcuts}>
          {[50, 100, 200, 300, 500].map(w => (
            <TouchableOpacity 
              key={w} 
              style={[styles.wordShortcut, { backgroundColor: theme.card, borderColor: theme.primary + '30' }]} 
              onPress={() => setWordCount(w)}
            >
              <Text style={[styles.wordShortcutText, { color: theme.primary }]}>{w}</Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <TouchableOpacity 
          style={[styles.generateButton, { backgroundColor: theme.primary }]} 
          onPress={generateCopy} 
          disabled={isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.generateButtonText}>✨ Generate Copy</Text>
          )}
        </TouchableOpacity>
        
        {generatedContent && (
          <View style={[styles.resultContainer, { backgroundColor: theme.card, borderColor: theme.primary + '20' }]}>
            <View style={styles.resultHeader}>
              <Text style={[styles.resultLabel, { color: theme.primary }]}>✨ Your Copy ✨</Text>
              <TouchableOpacity onPress={clearGeneratedContent} style={styles.clearResultButton}>
                <Text style={[styles.clearResultText, { color: theme.primary }]}>✖️</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.resultText, { color: theme.text }]}>{generatedContent.text}</Text>
            <Text style={styles.resultDisclaimer}>—— Generated by AI. Please review before posting.</Text>
            <View style={styles.resultButtons}>
              <TouchableOpacity style={[styles.resultButton, { backgroundColor: theme.background }]} onPress={copyToClipboard}>
                <Text style={[styles.resultButtonText, { color: theme.primary }]}>📋 Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.resultButton, { backgroundColor: theme.background }]} onPress={generateCopy}>
                <Text style={[styles.resultButtonText, { color: theme.primary }]}>🔄 Regenerate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.resultButton, styles.resultButtonReport, { backgroundColor: theme.primary + '20' }]}>
                <Text style={[styles.resultButtonText, { color: theme.primary }]}>🚩 Report</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
      
      <SubscriptionModal visible={showSubscriptionModal} onClose={() => setShowSubscriptionModal(false)} theme={theme} />
      <ThemeModal visible={showThemeModal} onClose={() => setShowThemeModal(false)} onSelectTheme={changeTheme} currentTheme={currentTheme} />
    </SafeAreaView>
  );
}

const SubscriptionModal = ({ visible, onClose, theme }) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: theme?.card || '#fff' }]}>
          <Text style={styles.modalEmoji}>🐶🥺</Text>
          <Text style={[styles.modalTitle, { color: theme?.text || '#4A4A4A' }]}>Hold up! You want more?</Text>
          <Text style={[styles.modalText, { color: (theme?.text || '#4A4A4A') + 'CC' }]}>
            Free user: Limited tries. Limited platforms. No history.{'\n\n'}
            Pro user: Unlimited everything. Voice input. History. Batch copy. All platforms.
          </Text>
          <Text style={[styles.modalPrice, { color: theme?.primary || '#FF9F9F' }]}>$9.99/month or $69.99/year</Text>
          <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme?.primary || '#FF9F9F' }]} onPress={onClose}>
            <Text style={styles.modalButtonText}>🔓 Upgrade to Pro</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.modalCancel, { color: (theme?.text || '#4A4A4A') + '99' }]}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const ThemeModal = ({ visible, onClose, onSelectTheme, currentTheme }) => {
  const themes = [
    { id: 'pink', name: 'Pink', color: '#FFB7C5', emoji: '🌸' },
    { id: 'blue', name: 'Deep Blue', color: '#1E3A8A', emoji: '🌊' },
    { id: 'purple', name: 'Purple Dream', color: '#7C3AED', emoji: '🦄' },
  ];
  
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.themeModalContainer}>
          <Text style={styles.themeModalTitle}>🎨 Choose Theme</Text>
          {themes.map(theme => (
            <TouchableOpacity
              key={theme.id}
              style={[
                styles.themeOption,
                currentTheme === theme.id && { borderColor: theme.color, borderWidth: 2 }
              ]}
              onPress={() => onSelectTheme(theme.id)}
            >
              <View style={[styles.themeColorCircle, { backgroundColor: theme.color }]} />
              <Text style={styles.themeOptionText}>{theme.emoji} {theme.name}</Text>
              {currentTheme === theme.id && <Text style={styles.themeCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.themeCloseButton} onPress={onClose}>
            <Text style={styles.themeCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1 },
  appName: { fontSize: 24, fontWeight: '700' },
  appBadge: { fontSize: 12, marginTop: 2 },
  headerIcons: { flexDirection: 'row' },
  iconButton: { padding: 8, marginLeft: 8 },
  iconText: { fontSize: 22 },
  backButton: { padding: 8 },
  backButtonText: { fontSize: 18 },
  headerTitle: { fontSize: 20, fontWeight: '600' },
  selectButton: { fontSize: 16, padding: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginHorizontal: 20, marginTop: 20, marginBottom: 12 },
  platformScroll: { paddingLeft: 20, marginBottom: 8 },
  platformChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 30, marginRight: 12, borderWidth: 1 },
  platformChipIcon: { fontSize: 16, marginRight: 6 },
  platformChipText: { fontSize: 14 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 8 },
  input: { flex: 1, borderRadius: 16, padding: 14, fontSize: 16, borderWidth: 1, minHeight: 60, paddingRight: 40 },
  clearInputButton: { position: 'absolute', right: 50, padding: 8 },
  clearInputText: { fontSize: 16, fontWeight: 'bold', color: '#999' },
  voiceButton: { position: 'relative', borderRadius: 30, padding: 12, marginLeft: 12, borderWidth: 1 },
  voiceButtonText: { fontSize: 22 },
  voiceBadge: { position: 'absolute', top: -4, right: -4, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 2, fontSize: 10, color: '#fff', fontWeight: 'bold' },
  styleScroll: { paddingLeft: 20, marginBottom: 8 },
  styleChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, marginRight: 12, borderWidth: 1, alignItems: 'center' },
  styleChipIcon: { fontSize: 20, marginBottom: 4 },
  styleChipText: { fontSize: 14, fontWeight: '500' },
  styleChipDesc: { fontSize: 10, marginTop: 2 },
  sliderContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 12 },
  sliderMin: { fontSize: 12, marginRight: 12 },
  sliderMax: { fontSize: 12, marginLeft: 12 },
  wordShortcuts: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 20, marginBottom: 20 },
  wordShortcut: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  wordShortcutText: { fontSize: 12 },
  generateButton: { marginHorizontal: 20, paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginBottom: 20 },
  generateButtonText: { fontSize: 18, fontWeight: '600', color: '#fff' },
  resultContainer: { marginHorizontal: 20, marginBottom: 30, padding: 20, borderRadius: 24, borderWidth: 1 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  resultLabel: { fontSize: 14, fontWeight: '500' },
  clearResultButton: { padding: 4 },
  clearResultText: { fontSize: 16, fontWeight: 'bold' },
  resultText: { fontSize: 16, lineHeight: 24, marginBottom: 12 },
  resultDisclaimer: { fontSize: 10, color: '#999', fontStyle: 'italic', marginBottom: 16 },
  resultButtons: { flexDirection: 'row', justifyContent: 'space-around' },
  resultButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  resultButtonReport: {},
  resultButtonText: { fontSize: 14 },
  historyItem: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  checkbox: { marginRight: 12, justifyContent: 'center' },
  historyContent: { flex: 1 },
  historyPlatform: { fontSize: 12, marginBottom: 4 },
  historyText: { fontSize: 14, marginBottom: 4 },
  historyDate: { fontSize: 10, color: '#999' },
  batchBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 12 },
  batchText: { fontSize: 14, color: '#fff', fontWeight: '500' },
  batchButton: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginLeft: 8 },
  batchButtonText: { fontSize: 12 },
  batchDeleteButton: { backgroundColor: '#FFE0E0' },
  batchDeleteButtonText: { color: '#FF6B6B' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 20, marginBottom: 8 },
  emptySubtext: { fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { borderRadius: 32, padding: 24, width: width * 0.85, alignItems: 'center' },
  modalEmoji: { fontSize: 64, marginBottom: 16 },
  modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  modalText: { fontSize: 14, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  modalPrice: { fontSize: 16, fontWeight: '600', marginBottom: 20 },
  modalButton: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30, marginBottom: 12 },
  modalButtonText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  modalCancel: { fontSize: 14 },
  themeModalContainer: { backgroundColor: '#fff', borderRadius: 28, padding: 24, width: width * 0.8, alignItems: 'center' },
  themeModalTitle: { fontSize: 20, fontWeight: '600', color: '#4A4A4A', marginBottom: 20 },
  themeOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: '#F5F5F5', marginBottom: 12, width: '100%' },
  themeColorCircle: { width: 30, height: 30, borderRadius: 15, marginRight: 12 },
  themeOptionText: { fontSize: 16, color: '#4A4A4A', flex: 1 },
  themeCheck: { fontSize: 18, color: '#4CAF50', fontWeight: 'bold' },
  themeCloseButton: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 24, backgroundColor: '#F0F0F0' },
  themeCloseText: { fontSize: 16, color: '#4A4A4A' },
});
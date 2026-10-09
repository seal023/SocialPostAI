// ============================================================
// HistoryScreen — Full version + i18n
// Nav bar → Filter tabs → History list → Batch action bar
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  Animated,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SHADOWS, getTheme } from '../themes/theme';
import { PLATFORMS } from '../utils/mockData';
import {
  getHistory,
  deleteHistoryBatch,
  toggleFavorite,
  clearHistory,
} from '../utils/storage';
import { getPermissions, filterHistoryByRetention } from '../utils/permissions';
import { useLanguage } from '../context/LanguageContext';
import ResultDrawer from '../components/ResultDrawer';

export default function HistoryScreen({ themeName = 'pink' }) {
  const theme = getTheme(themeName);
  const { t } = useLanguage();

  // Filter tab definitions — all labels go through i18n so the Chinese UI
  // shows 全部/短视频/图片/社群/短文字/专业 instead of English platform names.
  const FILTER_TABS = [
    { id: 'all', label: t('all') },
    { id: 'tiktok', label: t('filter_viral') },
    { id: 'instagram', label: t('filter_visual') },
    { id: 'facebook', label: t('filter_community') },
    { id: 'twitter', label: t('filter_brief') },
    { id: 'linkedin', label: t('filter_professional') },
  ];

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [history, setHistory] = useState([]);
  const [permissions, setPermissions] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentResult, setCurrentResult] = useState(null);

  // Reload history every time the History tab becomes focused
  // This ensures the list stays in sync with Generate & Profile tabs
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    const h = await getHistory();
    const perms = await getPermissions();
    setPermissions(perms);
    // Apply history retention filter for free users (7 days)
    const filtered = filterHistoryByRetention(h, perms);
    setHistory(filtered);
  };

  // ---- Filter & Search ----
  const filteredHistory = history.filter((item) => {
    if (activeFilter !== 'all' && !item.platforms.includes(activeFilter)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const topicMatch = item.topic?.toLowerCase().includes(q);
      const textMatch = Object.values(item.results || {}).some((txt) =>
        txt.toLowerCase().includes(q),
      );
      return topicMatch || textMatch;
    }
    return true;
  });

  // ---- Selection ----
  const toggleSelect = (id) => {
    const item = filteredHistory.find((i) => i.id === id);
    if (item && item.isFavorite) return; // Cannot select favorited items for deletion
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    const selectableIds = filteredHistory
      .filter((i) => !i.isFavorite)
      .map((i) => i.id);
    if (selectedIds.size === selectableIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  // ---- Batch copy ----
  const handleBatchCopy = async () => {
    const items = filteredHistory.filter((i) => selectedIds.has(i.id));
    const text = items
      .map((i) => `[${i.topic}]\n${Object.values(i.results || {}).join('\n')}`)
      .join('\n\n---\n\n');
    await Clipboard.setStringAsync(text);
    Alert.alert('✅ ' + t('copied'), `${items.length} ${t('items')} ${t('copied').toLowerCase()}`, [{ text: t('ok') }]);
    setSelectedIds(new Set());
    setIsSelectMode(false);
  };

  // ---- Batch delete ----
  const handleBatchDelete = () => {
    // Filter out favorited items — they cannot be deleted
    const deletableIds = Array.from(selectedIds).filter((id) => {
      const item = filteredHistory.find((i) => i.id === id);
      return item && !item.isFavorite;
    });

    if (deletableIds.length === 0) {
      Alert.alert(t('delete'), '选中的历史记录均已收藏，无法删除。', [{ text: t('ok') }]);
      return;
    }

    Alert.alert(t('confirm_delete'), t('delete_count', { count: deletableIds.length }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteHistoryBatch(deletableIds);
          setSelectedIds(new Set());
          setIsSelectMode(false);
          loadHistory();
        },
      },
    ]);
  };

  // ---- Clear all (only unfavorited) ----
  const handleClearAll = () => {
    const unfavoritedCount = history.filter((i) => !i.isFavorite).length;

    if (history.length === 0) {
      Alert.alert(t('history'), '暂无历史记录。', [{ text: t('ok') }]);
      return;
    }

    if (unfavoritedCount === 0) {
      Alert.alert(t('history'), '所有历史记录已收藏，无需清空。', [{ text: t('ok') }]);
      return;
    }

    Alert.alert(t('clear_all'), `确定清空 ${unfavoritedCount} 条未收藏的历史记录？已收藏的条目将保留。`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('clear'),
        style: 'destructive',
        onPress: async () => {
          const result = await clearHistory();
          setHistory(result.keptCount > 0 ? history.filter((i) => i.isFavorite) : []);
          if (result.keptCount > 0) {
            Alert.alert('已清空', `已删除 ${result.deletedCount} 条记录，保留 ${result.keptCount} 条收藏。`, [{ text: t('ok') }]);
          }
        },
      },
    ]);
  };

  // ---- Favorite toggle ----
  const handleFavorite = async (item) => {
    if (permissions && !permissions.canFavorite) {
      Alert.alert(t('locked'), t('feature_locked_upgrade'), [{ text: t('ok') }]);
      return;
    }
    await toggleFavorite(item.id);
    loadHistory();
    setCurrentResult({ ...item, isFavorite: !item.isFavorite });
  };

  // ---- Single copy ----
  const handleCopy = async (text) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('✅ ' + t('copied'), t('copied_to_clipboard'), [{ text: t('ok') }]);
  };

  // ---- Item press ----
  const handleItemPress = (item) => {
    if (isSelectMode) {
      toggleSelect(item.id);
    } else {
      setCurrentResult(item);
      setDrawerVisible(true);
    }
  };

  // ---- Long press to enter select mode ----
  const handleLongPress = (item) => {
    setIsSelectMode(true);
    toggleSelect(item.id);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="dark-content" />

      {/* ===== Top Nav Bar (56px) ===== */}
      <View style={[styles.navBar, { backgroundColor: theme.background }]}>
        <Text style={[styles.navTitle, { color: theme.title }]}>{t('history')}</Text>
        <View style={styles.navRight}>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setIsSearchVisible(!isSearchVisible)}
            activeOpacity={0.7}
          >
            <Text style={[styles.navIcon, { color: COLORS.BASE.subtitle }]}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={handleClearAll} activeOpacity={0.7}>
            <Text style={[styles.clearBtn, { color: COLORS.BASE.danger }]}>{t('clear')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== Search bar (toggle) ===== */}
      {isSearchVisible && (
        <View style={[styles.searchRow, { borderColor: COLORS.BASE.border }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: theme.title }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('search_history')}
            placeholderTextColor={COLORS.BASE.placeholder}
            autoFocus
          />
        </View>
      )}

      {/* ===== Filter Tabs (40px) ===== */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.filterTab,
                  {
                    backgroundColor: isActive ? theme.primary : COLORS.BASE.background,
                  },
                ]}
                onPress={() => setActiveFilter(tab.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    { color: isActive ? '#FFFFFF' : COLORS.BASE.subtitle },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ===== History List ===== */}
      {filteredHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={[styles.emptyText, { color: COLORS.BASE.placeholder }]}>
            {t('no_history')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredHistory}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <HistoryCard
              item={item}
              isSelected={selectedIds.has(item.id)}
              isSelectMode={isSelectMode}
              theme={theme}
              themeName={themeName}
              onPress={() => handleItemPress(item)}
              onLongPress={() => handleLongPress(item)}
              onFavorite={() => handleFavorite(item)}
              onCopy={() => handleCopy(Object.values(item.results || {}).join('\n'))}
              onToggleSelect={() => toggleSelect(item.id)}
              t={t}
            />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        />
      )}

      {/* ===== Batch Action Bar (56px) ===== */}
      {isSelectMode && (
        <View style={[styles.batchBar, { backgroundColor: COLORS.BASE.card }]}>
          <TouchableOpacity onPress={toggleSelectAll} style={styles.batchBtn}>
            <Text style={[styles.batchBtnText, { color: theme.primary }]}>
              {(() => {
                const selectableCount = filteredHistory.filter((i) => !i.isFavorite).length;
                return selectedIds.size === selectableCount && selectableCount > 0
                  ? t('deselect_all')
                  : t('select_all');
              })()}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleBatchCopy}
            style={[styles.batchBtn, { opacity: selectedIds.size > 0 ? 1 : 0.4 }]}
            disabled={selectedIds.size === 0}
          >
            <Text style={[styles.batchBtnText, { color: theme.primary }]}>
              📋 {t('copy')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleBatchDelete}
            style={[styles.batchBtn, { opacity: selectedIds.size > 0 ? 1 : 0.4 }]}
            disabled={selectedIds.size === 0}
          >
            <Text style={[styles.batchBtnText, { color: COLORS.BASE.danger }]}>
              🗑️ {t('delete')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setIsSelectMode(false);
              setSelectedIds(new Set());
            }}
            style={styles.batchBtn}
          >
            <Text style={[styles.batchBtnText, { color: COLORS.BASE.placeholder }]}>
              {t('cancel')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ===== Result Drawer ===== */}
      <ResultDrawer
        visible={drawerVisible}
        result={currentResult}
        onClose={() => setDrawerVisible(false)}
        onCopy={handleCopy}
        onRegenerate={() => setDrawerVisible(false)}
        onFavorite={handleFavorite}
        onSave={() => setDrawerVisible(false)}
        themeName={themeName}
      />
    </SafeAreaView>
  );
}

// ============================================================
// HistoryCard — single record row
// ============================================================

function HistoryCard({
  item,
  isSelected,
  isSelectMode,
  theme,
  themeName,
  onPress,
  onLongPress,
  onFavorite,
  onCopy,
  onToggleSelect,
  t,
}) {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const isFav = item.isFavorite;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  const handleCardPress = () => {
    if (isSelectMode) {
      if (isFav) return; // Cannot select favorited items
      onToggleSelect();
    } else {
      onPress();
    }
  };

  const handleCardLongPress = () => {
    if (isFav) return; // Cannot select mode on favorited items
    onLongPress();
  };

  const platformIcons = item.platforms
    .map((pid) => {
      const p = PLATFORMS.find((pl) => pl.id === pid);
      return p ? p.icon : '';
    })
    .join(' ');

  const firstResult = Object.values(item.results || {})[0] || '';
  const preview =
    firstResult.length > 20 ? firstResult.substring(0, 20) + '...' : firstResult;

  const charCount = Object.values(item.results || {}).join('').length;
  const timeStr = formatTime(item.createdAt, t);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: isFav
              ? COLORS.BASE.card
              : isSelected
              ? theme.primaryLight
              : COLORS.BASE.card,
            borderColor: isFav
              ? COLORS.BASE.borderLight
              : isSelected
              ? theme.primary
              : COLORS.BASE.border,
            opacity: isFav && isSelectMode ? 0.6 : 1,
          },
        ]}
        onPress={handleCardPress}
        onLongPress={handleCardLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.7}
      >
        {isSelectMode && (
          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => {
              if (isFav) return;
              onToggleSelect();
            }}
            activeOpacity={0.7}
            disabled={isFav}
          >
            <View
              style={[
                styles.checkboxBox,
                isFav
                  ? {
                      borderColor: COLORS.BASE.borderLight,
                      backgroundColor: COLORS.BASE.borderLight,
                    }
                  : {
                      borderColor: isSelected ? theme.primary : COLORS.BASE.border,
                      backgroundColor: isSelected ? theme.primary : 'transparent',
                    },
              ]}
            >
              {isFav ? (
                <Text style={styles.checkboxLock}>🔒</Text>
              ) : (
                isSelected && <Text style={styles.checkboxTick}>✓</Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.cardContent}>
          <View style={styles.cardTop}>
            <Text style={styles.cardPlatformIcons}>{platformIcons}</Text>
            <Text style={[styles.cardTopic, { color: theme.title }]} numberOfLines={1}>
              {item.topic}
            </Text>
            <Text style={[styles.cardCharCount, { color: COLORS.BASE.placeholder }]}>
              {charCount} {t('chars')}
            </Text>
          </View>
          <Text style={[styles.cardPreview, { color: COLORS.BASE.subtitle }]} numberOfLines={1}>
            {preview}
          </Text>
          <Text style={[styles.cardTime, { color: COLORS.BASE.placeholder }]}>{timeStr}</Text>
        </View>

        {!isSelectMode && (
          <View style={styles.cardActions}>
            <TouchableOpacity onPress={onCopy} style={styles.cardActionBtn}>
              <Text style={styles.cardActionIcon}>📋</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onFavorite} style={styles.cardActionBtn}>
              <Text style={styles.cardActionIcon}>
                {item.isFavorite ? '❤️' : '🤍'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatTime(isoString, t) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t('just_now');
  if (minutes < 60) return t('min_ago', { count: minutes });
  if (hours < 24) return t('hr_ago', { count: hours });
  if (days < 7) return t('day_ago', { count: days });
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
  },
  navTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navBtn: {
    padding: SPACING.sm,
    marginLeft: SPACING.sm,
  },
  navIcon: {
    fontSize: 20,
  },
  clearBtn: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    borderWidth: 1.5,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.BASE.card,
  },
  searchIcon: {
    fontSize: FONT_SIZE.sm,
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    padding: 0,
  },

  filterRow: {
    height: 40,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
  },
  filterTab: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    marginRight: SPACING.sm,
    justifyContent: 'center',
  },
  filterTabText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },

  listContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxxl + 80,
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
  },

  card: {
    height: 80,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    ...SHADOWS.card,
  },
  checkbox: {
    paddingRight: SPACING.sm,
    justifyContent: 'center',
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxTick: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  checkboxLock: {
    fontSize: 11,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardPlatformIcons: {
    fontSize: FONT_SIZE.xs,
    marginRight: SPACING.xs,
  },
  cardTopic: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    flex: 1,
  },
  cardCharCount: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '400',
    marginLeft: SPACING.sm,
  },
  cardPreview: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '400',
    marginBottom: 2,
  },
  cardTime: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '400',
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  cardActions: {
    flexDirection: 'row',
    paddingLeft: SPACING.sm,
  },
  cardActionBtn: {
    padding: SPACING.xs,
  },
  cardActionIcon: {
    fontSize: FONT_SIZE.md,
  },

  batchBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.BASE.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 4,
  },
  batchBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  batchBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
});

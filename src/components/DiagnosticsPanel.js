// ============================================================
// DiagnosticsPanel — modal self-check.
// Opened from ProfileScreen → "诊断自检". Renders the report
// produced by DiagnosticsService so the user can screenshot the
// REAL device state in one shot.
// ============================================================
import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { COLORS, SPACING, FONT_SIZE, RADIUS, getTheme } from '../themes/theme';
import { useLanguage } from '../context/LanguageContext';
import { collectDiagnostics, diagnosticsToText } from '../services/DiagnosticsService';

const STATUS_COLOR = {
  ok: COLORS.BASE.success,
  warn: COLORS.BASE.warning,
  fail: COLORS.BASE.danger,
  info: COLORS.BASE.subtitle,
};

export default function DiagnosticsPanel({ visible, onClose, themeName = 'pink' }) {
  const theme = getTheme(themeName);
  const { t } = useLanguage();
  const [report, setReport] = useState([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const r = await collectDiagnostics();
      setReport(r);
    } catch (e) {
      setReport([{ label: 'error', value: e?.message || String(e), status: 'fail' }]);
    } finally {
      setRunning(false);
    }
  }, []);

  const copy = useCallback(async () => {
    if (!report.length) return;
    try {
      await Clipboard.setStringAsync(diagnosticsToText(report));
    } catch (_) {
      /* ignore */
    }
  }, [report]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.title }]}>{t('diag_title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.primary }]}
              onPress={run}
              disabled={running}
            >
              {running ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>{t('diag_run')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={copy}
              disabled={!report.length}
            >
              <Text style={[styles.btnText, { color: theme.primary }]}>{t('diag_copy')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
            {report.length === 0 && !running && (
              <Text style={[styles.empty, { color: COLORS.BASE.placeholder }]}>
                {t('diag_empty')}
              </Text>
            )}
            {report.map((r, i) =>
              r.section ? (
                <Text key={i} style={[styles.section, { color: theme.primary }]}>
                  {r.title}
                </Text>
              ) : (
                <View key={i} style={styles.row}>
                  <Text style={[styles.label, { color: COLORS.BASE.subtitle }]}>{r.label}</Text>
                  <Text
                    style={[styles.value, { color: STATUS_COLOR[r.status] || COLORS.BASE.title }]}
                  >
                    {r.value}
                  </Text>
                </View>
              )
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: COLORS.BASE.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FONT_SIZE.lg, fontWeight: '700' },
  closeBtn: { padding: SPACING.sm },
  closeX: { fontSize: 20, color: COLORS.BASE.subtitle },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginVertical: SPACING.md },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.BASE.borderLight },
  btnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.md },
  list: { backgroundColor: COLORS.BASE.card, borderRadius: RADIUS.md },
  listInner: { padding: SPACING.md },
  empty: { fontSize: FONT_SIZE.sm, padding: SPACING.lg, textAlign: 'center' },
  section: { fontSize: FONT_SIZE.md, fontWeight: '700', marginTop: SPACING.md, marginBottom: 4 },
  row: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.BASE.borderLight },
  label: { fontSize: FONT_SIZE.sm, marginBottom: 2 },
  value: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
});

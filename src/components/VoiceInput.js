// ============================================================
// VoiceInput — Real-time speech-to-text with recording overlay
// Flow: tap mic → half-screen overlay → expo-audio useAudioStream (PCM 16kHz)
//       → WebSocket fun-asr-realtime → real-time transcript
//
// !! REGION MATTERS !!
// DashScope realtime ASR (WebSocket wss://.../api-ws/v1/inference) is ONLY
// served in cn-beijing and ap-southeast-1 (Singapore). API keys are
// REGION-SPECIFIC — a key from another region fails the WS handshake with 401.
// The text-generation key in this project is a US (us-east-1) key and CANNOT
// be used for realtime ASR; a Singapore or Beijing key is required.
//   • This project uses the PRIVATE MaaS workspace (Singapore ap-southeast-1):
//       wss://ws-6f52kltpls7886bp.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/inference
//     The ASR key is workspace-scoped — provided via EXPO_PUBLIC_ASR_API_KEY.
//     (Do NOT switch to the public dashscope-intl endpoint; that key is private-workspace-only.)
//   • Beijing   : wss://dashscope.aliyuncs.com/api-ws/v1/inference/
//                 (or wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/...)
// Auth header: Authorization: Bearer <region_key>  (NOT X-DashScope-ApiKey)
// Set EXPO_PUBLIC_ASR_API_KEY to the Singapore/Beijing key.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  Animated,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Dimensions,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  useAudioStream,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { COLORS, SPACING, FONT_SIZE, RADIUS, getTheme } from '../themes/theme';
import { useLanguage } from '../context/LanguageContext';
import {
  ASR_API_KEY,
  ASR_WS_URL as PARAFORMER_WS_URL,
  ASR_MODEL as PARAFORMER_MODEL,
  ASR_KEY_SOURCE,
  buildRunTaskPayload,
  buildFinishTaskPayload,
} from '../config/asrConfig';

// ── Config ──────────────────────────────────────────────────
// ASR needs a REGION-MATCHED key: realtime ASR is only served by
// cn-beijing / ap-southeast-1, and keys are region-specific.
// ASR_API_KEY / PARAFORMER_WS_URL / PARAFORMER_MODEL are imported from
// ../config/asrConfig, which bakes the Singapore key into the JS bundle — the
// Xcode Cloud CI script used to rewrite .env and drop EXPO_PUBLIC_ASR_API_KEY.

// Startup diagnostics — verify ASR endpoint + model are wired correctly
console.log('[VoiceInput] ASR config:');
console.log('  WS URL  :', PARAFORMER_WS_URL);
console.log('  Model   :', PARAFORMER_MODEL);
console.log('  Key src :', ASR_KEY_SOURCE);
console.log('  API Key :', ASR_API_KEY
  ? `${ASR_API_KEY.slice(0, 8)}...${ASR_API_KEY.slice(-4)} (len=${ASR_API_KEY.length})`
  : '(EMPTY)');

const AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  encoding: 'int16',
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── UUID helper (React Native may lack crypto.randomUUID) ───
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Component ───────────────────────────────────────────────
export default function VoiceInput({ themeName = 'pink', onResult, language = 'en' }) {
  const theme = getTheme(themeName);
  const { t } = useLanguage();
  // Paraformer-realtime-v2 supports automatic language detection — no manual language selection needed

  // Overlay visibility
  const [overlayVisible, setOverlayVisible] = useState(false);

  // Recording state
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');

  // Refs
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const wsRef = useRef(null);
  const taskIdRef = useRef(null);
  const finalTextRef = useRef('');
  const taskStartedResolveRef = useRef(null);
  // Whether the server ever sent `task-started` for the current session.
  // Surfaced in the failure detail so a screenshot tells us if the socket died
  // before the task began (audio-session reset) or after (audio-stream issue).
  const taskStartedRef = useRef(false);
  // Human-readable reason for the last failure (close code / task-failed code).
  // Surfaced in the alert so a device screenshot pinpoints the cause instead of
  // showing a generic "network error".
  const lastFailRef = useRef(null);
  // Guards against firing two stacked error alerts for one failure.
  const alertShownRef = useRef(false);

  // ── Audio stream hook ─────────────────────────────────────
  const handleAudioBuffer = useCallback((buffer) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(buffer.data);
    }
  }, []);

  const { stream, isStreaming } = useAudioStream({
    sampleRate: AUDIO_CONFIG.sampleRate,
    channels: AUDIO_CONFIG.channels,
    encoding: AUDIO_CONFIG.encoding,
    onBuffer: handleAudioBuffer,
  }) || {}; // Defensive: hook may return null in Release builds

  // ── Handle server messages ────────────────────────────────
  const handleMessage = useCallback((message) => {
    const { header, payload } = message;

    switch (header?.event) {
      case 'task-started':
        console.log('[VoiceInput] Task started, ready to stream audio');
        taskStartedRef.current = true;
        taskStartedResolveRef.current?.(true);
        taskStartedResolveRef.current = null;
        break;

      case 'result-generated': {
        const sentence = payload?.output?.sentence;
        if (!sentence || sentence.heartbeat) return;

        if (sentence.sentence_end === true) {
          setFinalText((prev) => prev + sentence.text);
          finalTextRef.current += sentence.text;
          setInterimText('');
        } else {
          setInterimText(sentence.text);
        }
        break;
      }

      case 'task-finished':
        console.log('[VoiceInput] Task finished');
        break;

      case 'task-failed': {
        const code = header.error_code || '';
        const msg = header.error_message || '';
        console.error('[VoiceInput] Task failed:', code, msg);
        lastFailRef.current = `task-failed ${code}`.trim();
        taskStartedResolveRef.current?.(null);
        taskStartedResolveRef.current = null;
        showVoiceError(
          'voice_error',
          `${code ? `[${code}] ` : ''}${msg || t('voice_error_desc')}`
        );
        break;
      }

    default:
      break;
    }
  }, [t]);

  // ── Deduped error reporter ────────────────────────────────
  // Several failure paths can fire for one session (task-failed + close, or
  // close + openOverlay fallback). This ensures only ONE alert is shown.
  const showVoiceError = useCallback((titleKey, detail) => {
    if (alertShownRef.current) return;
    alertShownRef.current = true;
    Alert.alert(t(titleKey), detail);
  }, [t]);

  // ── WebSocket connect + run-task ──────────────────────────
  const connectAndStartTask = useCallback(async () => {
    if (!ASR_API_KEY) {
      Alert.alert(t('voice_error'), t('voice_no_api_key'));
      return false;
    }

    return new Promise((resolve, reject) => {
      const taskId = generateUUID();
      taskIdRef.current = taskId;
      taskStartedResolveRef.current = resolve;
      lastFailRef.current = null;

      const ws = new WebSocket(PARAFORMER_WS_URL, null, {
        headers: { Authorization: `Bearer ${ASR_API_KEY}` },
      });

      ws.onopen = () => {
        console.log('[VoiceInput] WebSocket connected, sending run-task');
        // Payload comes from asrConfig so the mic flow and the diagnostics
        // probe always send byte-identical parameters (see asrConfig.js for
        // why only {format, sample_rate, language_hints} are allowed).
        ws.send(
          JSON.stringify(buildRunTaskPayload(taskId, { sampleRate: AUDIO_CONFIG.sampleRate }))
        );
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data);
            handleMessage(message);
          } catch (e) {
            console.warn('[VoiceInput] Non-JSON message:', String(event.data).slice(0, 100));
          }
        }
      };

      ws.onerror = (error) => {
        console.error('[VoiceInput] WebSocket error:', error);
        setIsConnecting(false);
        if (!lastFailRef.current) lastFailRef.current = 'WebSocket onerror';
        reject(new Error('WebSocket connection failed'));
      };

      ws.onclose = (event) => {
        console.log('[VoiceInput] WebSocket closed:', event.code, event.reason, 'taskStarted=', taskStartedRef.current);
        setIsConnecting(false);
        if (taskStartedResolveRef.current) {
          // 1006 = abnormal closure, typical for a rejected handshake (e.g. 401).
          // Recording whether task-started arrived tells us if the socket died
          // before the task began (audio-session reset at stream.start) or after.
          lastFailRef.current = `close ${event.code ?? '?'}${event.reason ? ` (${event.reason})` : ''}${taskStartedRef.current ? '' : ' BEFORE task-started'}`;
          taskStartedResolveRef.current(null);
          taskStartedResolveRef.current = null;
        }
      };

      wsRef.current = ws;
    });
  }, [handleMessage, t]);

  // ── Send finish-task ──────────────────────────────────────
  const sendFinishTask = useCallback(() => {
    return new Promise((resolve) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        resolve(finalTextRef.current);
        return;
      }

      const timeoutId = setTimeout(() => {
        resolve(finalTextRef.current);
      }, 5000);

      // IMPORTANT: do NOT call handleMessage() here. `originalOnMessage` IS the
      // socket's normal handler and already runs handleMessage() for every frame
      // it forwards to (see the `if (originalOnMessage) originalOnMessage(event)`
      // below). Calling it in both places processed each `result-generated`
      // sentence twice, and because finalTextRef accumulates with `+=`, a single
      // spoken phrase ended up duplicated in the input box (1 phrase → 2 copies).
      const originalOnMessage = ws.onmessage;
      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data);
            if (
              message.header?.event === 'task-finished' ||
              message.header?.event === 'task-failed'
            ) {
              clearTimeout(timeoutId);
              ws.onmessage = originalOnMessage;
              resolve(finalTextRef.current);
              return;
            }
          } catch (e) {
            // ignore
          }
        }
        if (originalOnMessage) originalOnMessage(event);
      };

      ws.send(JSON.stringify(buildFinishTaskPayload(taskIdRef.current)));
    });
  }, [handleMessage]);

  // ── Cleanup WebSocket ─────────────────────────────────────
  const cleanupWebSocket = useCallback(() => {
    if (wsRef.current) {
      const ws = wsRef.current;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, 'Normal closure');
      }
      wsRef.current = null;
    }
  }, []);

  // ── Pulse + glow animation when listening ────────────────
  useEffect(() => {
    if (isListening) {
      // Pulse: mic icon scale
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();

      // Glow: ring opacity breathing
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      glow.start();

      return () => {
        pulse.stop();
        glow.stop();
      };
    } else {
      pulseAnim.setValue(1);
      glowAnim.setValue(0.3);
    }
  }, [isListening, pulseAnim, glowAnim]);

  // ── Cleanup on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (isStreaming && stream && typeof stream.stop === 'function') {
        stream.stop();
      }
      cleanupWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Open overlay and start recording ──────────────────────
  const openOverlay = useCallback(async () => {
    try {
      // 0. Check audio stream availability (expo-audio useAudioStream may return null in Release builds)
      if (!stream || typeof stream.start !== 'function') {
        console.warn('[VoiceInput] Audio stream not available — expo-audio native module uninitialized in Release build');
        Alert.alert(
          t('voice_unavailable_title') || 'Voice Input Unavailable',
          t('voice_unavailable_desc') || 'Voice input is temporarily unavailable in this build. Please type your topic using the keyboard.',
          [{ text: 'OK' }]
        );
        return;
      }

      // 1. Request microphone permission
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('voice_permission_denied'), t('voice_permission_desc'));
        return;
      }

      // 2. Check API key
      if (!ASR_API_KEY) {
        Alert.alert(t('voice_error'), t('voice_no_api_key'));
        return;
      }

      // 3. Set audio mode
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // 4. Reset text state
      setInterimText('');
      setFinalText('');
      finalTextRef.current = '';

      // 5. Show overlay + reset per-session diagnostic flags
      setOverlayVisible(true);
      setIsConnecting(true);
      alertShownRef.current = false;
      taskStartedRef.current = false;
      lastFailRef.current = null;

      // 6. Connect WebSocket + start task.
      //    ORDER IS INTENTIONAL — leave as WS-first. This is the order that
      //    works on device today. A stream-first variant was tried on 2026-09-13
      //    to chase a `close 0 BEFORE task-started`, but that failure stopped
      //    reproducing, so the known-good order stays. Do not flip this without
      //    a fresh, repeatable reproduction.
      const started = await connectAndStartTask();
      if (!started) {
        setIsConnecting(false);
        setOverlayVisible(false);
        const detail = lastFailRef.current;
        showVoiceError(
          'voice_error',
          detail ? `${t('voice_ws_error')}\n\n[${detail}]` : t('voice_ws_error')
        );
        return;
      }

      // 7. Start audio stream (may throw in Release builds — needs its own try-catch)
      if (stream && typeof stream.start === 'function') {
        try {
          await stream.start();
          console.log('[VoiceInput] Audio stream started successfully');
        } catch (streamErr) {
          console.error('[VoiceInput] stream.start() threw:', streamErr?.message || streamErr);
          cleanupWebSocket();
          setIsListening(false);
          setIsConnecting(false);
          setOverlayVisible(false);

          // Provide a specific, user-facing error message
          const errMsg = streamErr?.message || String(streamErr);
          if (errMsg.includes('permission') || errMsg.includes('Permission')) {
            showVoiceError(t('voice_permission_denied'), t('voice_permission_desc'));
          } else if (errMsg.includes('busy') || errMsg.includes('occupied')) {
            showVoiceError(
              t('voice_error'),
              t('voice_mic_busy') || '麦克风被其他应用占用，请关闭后重试。'
            );
          } else {
            showVoiceError(
              t('voice_unavailable_title') || 'Voice Input Unavailable',
              t('voice_stream_error') || '当前版本语音输入功能暂不可用，请使用键盘输入主题。'
            );
          }
          return;
        }
      }

      setIsListening(true);
      setIsConnecting(false);
    } catch (error) {
      console.error('[VoiceInput] Start recording failed:', error);
      cleanupWebSocket();
      setIsConnecting(false);
      setOverlayVisible(false);
      const errMsg = error?.message || String(error);
      if (errMsg.includes('permission') || errMsg.includes('Permission')) {
        Alert.alert(t('voice_permission_denied'), t('voice_permission_desc'));
      } else if (errMsg.includes('WebSocket')) {
        Alert.alert(t('voice_error'), t('voice_ws_error'));
      } else {
        Alert.alert(t('voice_error'), t('voice_error_desc'));
      }
    }
  }, [stream, connectAndStartTask, cleanupWebSocket, t]);

  // ── Stop recording and close overlay ──────────────────────
  const stopAndClose = useCallback(async () => {
    try {
      setIsListening(false);
      setIsProcessing(true);

      // 1. Stop audio stream
      if (isStreaming && stream && typeof stream.stop === 'function') {
        stream.stop();
      }

      // 2. Send finish-task and collect remaining results
      let transcript = '';
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        transcript = await sendFinishTask();
      } else {
        transcript = finalTextRef.current;
      }

      // 3. Cleanup WebSocket
      cleanupWebSocket();

      // 4. Close overlay
      setOverlayVisible(false);
      setIsProcessing(false);
      setInterimText('');
      setFinalText('');

      // 5. Deliver result to parent
      if (transcript.trim()) {
        onResult?.(transcript.trim());
      } else {
        Alert.alert(t('voice_error'), t('voice_no_speech'));
      }
    } catch (error) {
      console.error('[VoiceInput] Stop recording failed:', error);
      cleanupWebSocket();
      setOverlayVisible(false);
      setIsProcessing(false);
      setInterimText('');
      setFinalText('');
      Alert.alert(t('voice_error'), t('voice_error_desc'));
    }
  }, [stream, isStreaming, sendFinishTask, cleanupWebSocket, onResult, t]);

  // ── Render: small mic button in input area ────────────────
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.micBtn, { borderColor: theme.primary }]}
        onPress={openOverlay}
        activeOpacity={0.7}
      >
        <Text style={styles.micBtnIcon}>🎤</Text>
      </TouchableOpacity>

      {/* ── Half-screen recording overlay ──────────────────── */}
      <Modal
        visible={overlayVisible}
        animationType="slide"
        transparent
        onRequestClose={stopAndClose}
      >
        <View style={styles.overlayBackdrop}>
          <KeyboardAvoidingView
            style={styles.overlayContent}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <SafeAreaView style={styles.overlaySafeArea}>
              {/* Drag handle */}
              <View style={styles.dragHandle} />

              {/* Title */}
              <Text style={[styles.overlayTitle, { color: theme.title }]}>
                {t('voice_listening') || 'Listening...'}
              </Text>

              {/* Center: large mic icon with glow ring */}
              <View style={styles.micCenter}>
                {/* Glow ring (breathing animation) */}
                {isListening && (
                  <Animated.View
                    style={[
                      styles.glowRing,
                      {
                        borderColor: theme.primary,
                        opacity: glowAnim,
                        transform: [{ scale: pulseAnim }],
                      },
                    ]}
                  />
                )}

                {/* Mic circle */}
                <Animated.View
                  style={[
                    styles.micCircle,
                    {
                      backgroundColor: isListening ? theme.primary : COLORS.BASE.placeholder,
                      transform: [{ scale: isListening ? pulseAnim : 1 }],
                    },
                  ]}
                >
                  {isConnecting ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : (
                    <Text style={styles.micCircleIcon}>🎤</Text>
                  )}
                </Animated.View>
              </View>

              {/* Status text */}
              {isConnecting && (
                <Text style={[styles.statusText, { color: COLORS.BASE.subtitle }]}>
                  {t('voice_connecting') || 'Connecting...'}
                </Text>
              )}

              {/* Real-time transcript */}
              {(finalText || interimText) ? (
                <View style={[styles.transcriptBox, { borderColor: theme.primaryLight }]}>
                  <Text style={[styles.transcriptFinal, { color: theme.title }]}>
                    {finalText}
                    <Text style={[styles.transcriptInterim, { color: COLORS.BASE.subtitle }]}>
                      {interimText}
                    </Text>
                  </Text>
                </View>
              ) : isListening ? (
                <Text style={[styles.hintText, { color: COLORS.BASE.placeholder }]}>
                  {t('voice_hint') || 'Start speaking...'}
                </Text>
              ) : null}

              {/* Spacer */}
              <View style={{ flex: 1 }} />

              {/* Stop button */}
              <TouchableOpacity
                style={[
                  styles.stopBtn,
                  { backgroundColor: theme.primary },
                  isProcessing && { opacity: 0.6 },
                ]}
                onPress={stopAndClose}
                activeOpacity={0.7}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.stopBtnText}>
                    ⏹  {t('voice_stop') || 'Stop Recording'}
                  </Text>
                )}
              </TouchableOpacity>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
  },

  // ── Small mic button (in input area) ──
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.BASE.card,
  },
  micBtnIcon: {
    fontSize: 22,
  },

  // ── Half-screen overlay ──
  overlayBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  overlayContent: {
    height: SCREEN_HEIGHT * 0.55,
    backgroundColor: COLORS.BASE.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  overlaySafeArea: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },

  // Drag handle
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.BASE.borderLight,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },

  // Title
  overlayTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },

  // Center mic area
  micCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 140,
    position: 'relative',
  },

  // Glow ring (breathing animation)
  glowRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
  },

  // Mic circle (main icon)
  micCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micCircleIcon: {
    fontSize: 36,
  },

  // Status text
  statusText: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  // Hint text
  hintText: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
    marginTop: SPACING.md,
    fontStyle: 'italic',
  },

  // Transcript box
  transcriptBox: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    minHeight: 48,
    maxHeight: 120,
  },
  transcriptFinal: {
    fontSize: FONT_SIZE.md,
    lineHeight: FONT_SIZE.md + 6,
  },
  transcriptInterim: {
    fontStyle: 'italic',
  },

  // Stop button
  stopBtn: {
    height: 52,
    borderRadius: RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  stopBtnText: {
    color: '#fff',
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
});

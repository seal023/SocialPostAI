// ============================================================
// DiagnosticsService — one-shot self-check for field debugging.
//
// Goal: let the user capture the REAL device state in a single
// screenshot instead of guessing across rebuild cycles.
//
// - Build stamp (from src/config/buildInfo) tells us if the
//   installed build actually contains the latest fix.
// - IAP: which product IDs are registered vs actually fetched.
// - Voice: ASR endpoint / model / API key length (never the full
//   key) + a live WebSocket connectivity probe with timeout.
// ============================================================
import { Platform } from 'react-native';
import { getBuildStamp, BUILD_COMMIT } from '../config/buildInfo';
import { getIAPDiagnostics, isUsingStub, fetchProducts } from '../services/IAPService';

// Keep in sync with VoiceInput.js config block.
const BAILIAN_API_KEY = process.env.EXPO_PUBLIC_BAILIAN_API_KEY || '';
const PARAFORMER_WS_URL =
  process.env.EXPO_PUBLIC_PARAFORMER_WS_URL ||
  'wss://ws-6f52kltpls7886bp.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/inference';
const PARAFORMER_MODEL = 'fun-asr-realtime';

const WS_PROBE_TIMEOUT = 12000;

function maskKey(key) {
  if (!key) return '(empty)';
  if (key.length <= 12) return `${key.slice(0, 2)}•••${key.slice(-2)} (len=${key.length})`;
  return `${key.slice(0, 8)}…${key.slice(-4)} (len=${key.length})`;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), ms)
    ),
  ]);
}

// ── Voice WebSocket connectivity probe (no mic permission needed) ──
export function runVoiceWsProbe() {
  return new Promise((resolve) => {
    if (!BAILIAN_API_KEY) {
      resolve({ ok: false, reason: 'no-api-key' });
      return;
    }
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    let ws;
    try {
      ws = new WebSocket(PARAFORMER_WS_URL, null, {
        headers: { Authorization: `Bearer ${BAILIAN_API_KEY}` },
      });
    } catch (e) {
      done({ ok: false, reason: `ws-ctor:${e?.message || e}` });
      return;
    }

    const fail = (reason) => done({ ok: false, reason });

    ws.onopen = () => {
      // Connected to the ASR gateway — send run-task and wait for start
      try {
        ws.send(
          JSON.stringify({
            header: { action: 'run-task', task_id: 'diag-probe', streaming: 'duplex' },
            payload: {
              task_group: 'audio',
              task: 'asr',
              function: 'recognition',
              model: PARAFORMER_MODEL,
              input: {},
              parameters: { format: 'pcm', sample_rate: 16000, language_hints: ['zh', 'en'] },
            },
          })
        );
      } catch (e) {
        fail(`send:${e?.message || e}`);
        return;
      }
      // Give the server a moment to start the task, then report success-ish
      setTimeout(() => done({ ok: true, reason: 'connected+task-sent' }), 2500);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          const ev = msg?.header?.event;
          if (ev === 'task-started') done({ ok: true, reason: 'task-started' });
          else if (ev === 'task-failed') {
            done({
              ok: false,
              reason: `task-failed:${msg?.header?.error_code || '?'}:${msg?.header?.error_message || ''}`,
            });
          }
        } catch (_) {
          /* ignore non-JSON */
        }
      }
    };

    ws.onerror = (e) => fail(`error:${e?.message || 'unknown'}`);
    ws.onclose = (e) => {
      if (!settled) fail(`close:${e?.code || '?'}:${e?.reason || ''}`);
    };

    setTimeout(() => {
      if (!settled) {
        try { ws.close(); } catch (_) {}
        fail('timeout');
      }
    }, WS_PROBE_TIMEOUT);
  });
}

// ── IAP fetch probe (bounded) ──
export async function runIAPProbe() {
  try {
    const res = await withTimeout(fetchProducts(), 10000);
    if (res && res.timedOut) return { ok: false, reason: 'timeout' };
    const d = getIAPDiagnostics();
    return { ok: (d.fetchedIds || []).length > 0, registered: d.registeredIds, fetched: d.fetchedIds };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

// ── Build the full report object (UI renders it) ──
export async function collectDiagnostics() {
  const report = [];
  const section = (title) => { report.push({ section: true, title }); };

  // Build
  section('诊断 · Build');
  report.push({ label: 'Build Stamp', value: getBuildStamp(), status: 'info' });
  report.push({ label: 'Git', value: BUILD_COMMIT, status: 'info' });
  report.push({ label: 'Platform', value: `${Platform.OS} ${Platform.Version || ''}`.trim(), status: 'info' });
  report.push({ label: 'Bundle ID', value: 'com.seal023.SocialPostAI.20260816', status: 'info' });
  report.push({ label: 'IAP stub', value: isUsingStub() ? 'YES (storekit unavailable)' : 'no', status: isUsingStub() ? 'warn' : 'ok' });

  // IAP
  section('诊断 · 订阅 IAP');
  const d = getIAPDiagnostics();
  report.push({ label: '注册商品 ID', value: (d.registeredIds || []).join(', ') || '(none)', status: 'info' });
  report.push({ label: '上次拉取到的 ID', value: (d.fetchedIds || []).join(', ') || '(none)', status: (d.fetchedIds || []).length ? 'ok' : 'warn' });
  report.push({ label: '上次尝试的 ID', value: (d.attemptedIds || []).join(', ') || '(none)', status: 'info' });

  // Voice
  section('诊断 · 语音识别（服务器）');
  report.push({ label: 'ASR 端点', value: PARAFORMER_WS_URL, status: 'info' });
  report.push({ label: '模型', value: PARAFORMER_MODEL, status: 'info' });
  report.push({ label: 'API Key', value: maskKey(BAILIAN_API_KEY), status: BAILIAN_API_KEY ? 'ok' : 'fail' });

  // Voice WS probe
  const ws = await runVoiceWsProbe();
  report.push({
    label: 'WebSocket 连通性',
    value: ws.ok ? `正常 (${ws.reason})` : `异常 (${ws.reason})`,
    status: ws.ok ? 'ok' : 'fail',
  });

  // IAP probe
  const iap = await runIAPProbe();
  report.push({
    label: 'IAP 拉取探针',
    value: iap.ok ? `成功 (${(iap.fetched || []).join(', ') || 'n/a'})` : `失败 (${iap.reason})`,
    status: iap.ok ? 'ok' : 'fail',
  });

  return report;
}

export function diagnosticsToText(report) {
  return report
    .map((r) => (r.section ? `\n■ ${r.title}` : `${r.label}: ${r.value}`))
    .join('\n');
}

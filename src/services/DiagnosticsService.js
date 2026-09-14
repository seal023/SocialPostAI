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
import appJson from '../../app.json';
import {
  getIAPDiagnostics,
  isUsingStub,
  fetchProducts,
  fetchStorefront,
  initIAP,
} from '../services/IAPService';
import {
  ASR_API_KEY,
  ASR_KEY_SOURCE,
  ASR_KEY_REGION_MATCHED,
  ASR_WS_URL as PARAFORMER_WS_URL,
  ASR_MODEL as PARAFORMER_MODEL,
  buildRunTaskPayload,
} from '../config/asrConfig';

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
    if (!ASR_API_KEY) {
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
        headers: { Authorization: `Bearer ${ASR_API_KEY}` },
      });
    } catch (e) {
      done({ ok: false, reason: `ws-ctor:${e?.message || e}` });
      return;
    }

    const fail = (reason) => done({ ok: false, reason });

    ws.onopen = () => {
      // Connected to the ASR gateway — send run-task and wait for start.
      // Uses the SAME payload builder as the real mic flow (VoiceInput.js) so
      // a probe success always implies the mic flow can handshake too.
      try {
        ws.send(JSON.stringify(buildRunTaskPayload('diag-probe')));
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

    // React Native's onerror carries no message; prefer the onclose code/reason.
    ws.onerror = (e) => {
      setTimeout(() => {
        if (!settled) fail(`error:${e?.message || 'unknown'}`);
      }, 1200);
    };
    ws.onclose = (e) => {
      // 1006 = abnormal closure, typical for a rejected handshake (e.g. 401 auth)
      if (!settled) fail(`close:${e?.code ?? '?'}:${e?.reason || ''}`);
    };

    setTimeout(() => {
      if (!settled) {
        try { ws.close(); } catch (_) {}
        fail('timeout');
      }
    }, WS_PROBE_TIMEOUT);
  });
}

// ── IAP probe (bounded) ──
//
// Deliberately mirrors the real purchase path: initConnection() first, then the
// product fetch. Previously the probe skipped initConnection(), so its result
// could disagree with what pressing "订阅" actually does.
export async function runIAPProbe() {
  try {
    // 1) Same connection setup the purchase flow performs
    try { await initIAP(); } catch (e) { /* non-fatal, recorded below */ }

    // 2) StoreKit reachability — proves whether StoreKit can talk to Apple
    const storefront = await fetchStorefront();

    // 3) The actual product fetch (bounded; never throws — returns [])
    const res = await withTimeout(fetchProducts(), 14000);
    if (res && res.timedOut) {
      // The reason a product request never settles is different per StoreKit mode,
      // so the hint must not claim "StoreKit 1" while we are actually on Sk2.
      const mode = getIAPDiagnostics().storekitMode;
      return {
        ok: false,
        reason: 'timeout',
        storefront,
        stage: 'never-settled',
        errorText: mode === 'sk2'
          ? 'getSubscriptions() 14s 未返回。StoreKit 2 下常见原因：未登录 App Store/沙盒账号 · 商品未在沙盒生效 · 到 Apple 商店的网络超时'
          : 'getSubscriptions() 14s 未返回（StoreKit 1 的 didFailWithError 不会 reject，会永久挂起）',
      };
    }

    const d = getIAPDiagnostics();
    const lf = d.lastFetch || {};
    const ok = (d.fetchedIds || []).length > 0;
    return {
      ok,
      registered: d.registeredIds,
      fetched: d.fetchedIds,
      storefront,
      stage: lf.stage || 'unknown',
      ms: lf.ms,
      rawCount: lf.rawCount,
      errorText: lf.error ? `${lf.error.code}: ${lf.error.message}` : null,
    };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

// ── Build the full report object (UI renders it) ──
export async function collectDiagnostics() {
  // Run the live probes FIRST so the rows below can report their outcome.
  const ws = await runVoiceWsProbe();
  const iap = await runIAPProbe();

  const report = [];
  const section = (title) => { report.push({ section: true, title }); };

  // Build
  section('诊断 · Build');
  const cfgBundleId =
    (appJson && appJson.expo && appJson.expo.ios && appJson.expo.ios.bundleIdentifier) || '(unknown)';
  report.push({ label: 'Build Stamp', value: getBuildStamp(), status: 'info' });
  report.push({ label: 'Git', value: BUILD_COMMIT, status: 'info' });
  report.push({ label: 'Platform', value: `${Platform.OS} ${Platform.Version || ''}`.trim(), status: 'info' });
  // Read from app.json (which Xcode Cloud runs `expo prebuild` from) instead of a
  // hard-coded literal, so this row can never drift from the built binary.
  report.push({ label: 'Bundle ID', value: `${cfgBundleId} (from app.json → prebuild)`, status: 'info' });
  report.push({ label: 'IAP stub', value: isUsingStub() ? 'YES (storekit unavailable)' : 'no', status: isUsingStub() ? 'warn' : 'ok' });

  // IAP
  section('诊断 · 订阅 IAP');
  const d = getIAPDiagnostics();
  const lf = d.lastFetch || null;
  const fetchedCount = (d.fetchedIds || []).length;
  report.push({
    label: `注册商品 ID (${(d.registeredIds || []).length})`,
    value: (d.registeredIds || []).join(', ') || '(none)',
    status: 'info',
  });
  report.push({
    label: 'StoreKit 商店地区',
    value: iap.storefront && iap.storefront.ok
      ? `${iap.storefront.country} — StoreKit 可达`
      : `失败 (${(iap.storefront && iap.storefront.error && iap.storefront.error.code) || '?'})`,
    status: iap.storefront && iap.storefront.ok ? 'ok' : 'fail',
  });
  report.push({
    label: '拉取结果',
    value: lf
      ? `${lf.stage} · ${lf.ms}ms · 原始 ${lf.rawCount == null ? '?' : lf.rawCount} 项 / 有效 ${fetchedCount} 项`
      : `(探针: ${iap.stage || iap.reason || 'n/a'} · ${iap.ms == null ? '?' : iap.ms}ms)`,
    status: fetchedCount ? 'ok' : 'warn',
  });
  report.push({
    label: '未拉到的原因',
    value: iap.errorText || '(none — StoreKit 有应答，只是没有商品)',
    status: iap.errorText ? 'fail' : 'info',
  });
  report.push({
    label: 'IAP 拉取探针',
    value: iap.ok
      ? `成功 (${(iap.fetched || []).join(', ') || 'n/a'})`
      : `失败 (${iap.stage || iap.reason || 'unknown'})`,
    status: iap.ok ? 'ok' : 'fail',
  });
  report.push({
    label: 'StoreKit 模式',
    value: d.storekitMode === 'sk2'
      ? 'StoreKit 2（HYBRID · iOS≥15 生效 · 本地查询权益，无登录弹窗）'
      : d.storekitMode === 'sk1'
        ? 'StoreKit 1（仅 iOS<15 回退）'
        : (d.storekitMode || 'unknown'),
    status: d.storekitMode === 'sk2' ? 'ok' : 'info',
  });
  if (d.setupError) {
    report.push({ label: 'StoreKit 初始化错误', value: String(d.setupError), status: 'fail' });
  }
  const le = d.lastEntitlement;
  report.push({
    label: '权益探测（实拥订阅）',
    value: le
      ? `${le.ok ? '已找到' : '未找到'} · stage=${le.stage || '?'}`
        + (le.productId ? ` · productId=${le.productId}` : '')
        + (le.via ? ` · via=${le.via}` : '')
        + (le.reason ? ` · ${le.reason}` : '')
      : '尚未运行（启动/购买/恢复时触发）',
    status: le ? (le.ok ? 'ok' : 'info') : 'info',
  });

  // Voice
  section('诊断 · 语音识别（服务器）');
  report.push({ label: 'ASR 端点', value: PARAFORMER_WS_URL, status: 'info' });
  report.push({ label: '模型', value: PARAFORMER_MODEL, status: 'info' });
  report.push({ label: 'Key 来源', value: ASR_KEY_SOURCE, status: ASR_KEY_REGION_MATCHED ? 'ok' : 'warn' });
  report.push({ label: 'API Key', value: maskKey(ASR_API_KEY), status: ASR_API_KEY ? 'ok' : 'fail' });
  report.push({
    label: 'WebSocket 连通性',
    value: ws.ok ? `正常 (${ws.reason})` : `异常 (${ws.reason})`,
    status: ws.ok ? 'ok' : 'fail',
  });

  return report;
}

export function diagnosticsToText(report) {
  return report
    .map((r) => (r.section ? `\n■ ${r.title}` : `${r.label}: ${r.value}`))
    .join('\n');
}

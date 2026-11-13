// ============================================================
// SocialPostAI Pro — Web front-end logic
// Talks to the Cloudflare Worker proxy (key stays server-side).
// Worker URL is configurable via window.WORKER_URL or this constant.
// ============================================================

// Set this to your Worker's production URL.
const WORKER_URL = 'https://api.socialpostai.app';

// Mirror of the Worker's quota constants (FREE_DAILY / PRO_DAILY). Used only for the
// instant optimistic counter shown before /api/usage confirms the server's real number.
// Keep in sync with the Worker if you ever change the daily caps.
const FRONT_FREE_DAILY = 1;
const FRONT_PRO_DAILY = 50;

// One friendly line for every upstream / AI failure. Raw stack traces, provider
// URLs and HTTP details never reach the interface.
const ENGINE_BUSY = 'The AI engine is busy right now. Please try again in a moment. Your credit was not used.';
const INTERRUPTED = 'Generation was interrupted — your credit was not used. Please try again.';
const SPAI_ERR_MARK = /\[SPAI_ERROR:[a-z_]+\]/g;
const INTERRUPTED_KEY = 'spai_interrupted';
function flagInterrupted() {
  try { sessionStorage.setItem(INTERRUPTED_KEY, '1'); } catch { /* storage unavailable */ }
}

// ---------- Cloudflare Turnstile (human verification) ----------
// Bind the SITE KEY in ONE place: app.html -> <meta name="turnstile-site-key" content="0x4...">.
// (window.TURNSTILE_SITE_KEY also works if set before this script runs.)
// Empty = no widget, no client-side blocking, and the Worker currently bypasses
// verification too. Paste the key tomorrow and uncomment the Worker gate together.
const TURNSTILE_SITE_KEY = String(
  window.TURNSTILE_SITE_KEY ||
  (document.querySelector('meta[name="turnstile-site-key"]') || {}).content || ''
).trim();
let cfToken = '';
let turnstileWidgetId = null;
let turnstileEnforced = false;      // server requires a Turnstile token (Worker TURNSTILE_ENFORCE=1)
let turnstileMisconfigured = false; // server enforces but no client SITE KEY -> generation impossible

// ---------- Device fingerprint (for rate limiting) ----------
function getDeviceId() {
  let id = localStorage.getItem('spai_uuid');
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
      'd' + Date.now().toString(16) + Math.random().toString(16).slice(2);
    localStorage.setItem('spai_uuid', id);
  }
  return id;
}

// ---------- Payment-success return (Creem redirect) ----------
// Official Creem success_url parameters (docs.creem.io/features/checkout/checkout-api):
//   checkout_id, order_id, customer_id, subscription_id, product_id, request_id, signature
// Creem does NOT include the buyer's email in the redirect, so we resolve it server-side
// via /api/claim-checkout. This detection runs BEFORE anything else (including the first
// refreshLimitUI call), so a returning payer is Pro from the very first frame.
const CREEM_RETURN_KEYS = [
  'checkout_id', 'order_id', 'subscription_id', 'customer_id', 'product_id',
  'request_id', 'signature', 'email', 'customer_email', 'paid', 'success', 'activated',
];

const PAYMENT_RETURN = (function detectPaymentReturn() {
  const empty = { matched: false, rawQuery: '', checkoutId: '', email: '', identity: '' };
  const rawQuery = window.location.search.replace(/^\?/, '');
  if (!rawQuery) return empty;
  let q;
  try { q = new URLSearchParams(rawQuery); } catch { return empty; }
  if (!CREEM_RETURN_KEYS.some((k) => q.has(k))) return empty;

  const checkoutId = q.get('checkout_id') || q.get('order_id') || q.get('subscription_id') || '';
  const urlEmail = String(q.get('email') || q.get('customer_email') || '').trim().toLowerCase();
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(urlEmail) ? urlEmail : '';
  const identity = validEmail || (checkoutId ? `checkout:${checkoutId}` : 'pro@local');
  // Grant Pro on this device immediately — no network call, no modal, no email prompt.
  try {
    localStorage.setItem('spai_pro_email', identity);
    if (checkoutId) localStorage.setItem('spai_checkout_id', checkoutId);
  } catch { /* storage blocked: the URL flag below still unlocks the UI */ }
  return { matched: true, rawQuery, checkoutId, email: validEmail, identity };
})();

// ---------- Pro status (email-based; verified server-side via Creem webhook) ----------
function getProEmail() {
  let stored = '';
  try { stored = (localStorage.getItem('spai_pro_email') || '').trim().toLowerCase(); } catch {}
  if (stored) return stored;
  return PAYMENT_RETURN.email || PAYMENT_RETURN.identity || '';
}
function isPro() {
  // Hard guarantee: even if localStorage is unavailable, or any later script fails,
  // a Creem success return is ALWAYS treated as Pro. No "free limit reached" prompt.
  return !!getProEmail() || PAYMENT_RETURN.matched;
}
function getCheckoutId() {
  try { return localStorage.getItem('spai_checkout_id') || ''; } catch { return PAYMENT_RETURN.checkoutId || ''; }
}

// Render the Turnstile widget once the Cloudflare script is ready.
// - No SITE KEY  -> nothing shown, nothing blocked (current testing mode).
// - Key present  -> unhide #turnstileWrap, wait up to ~10s for the API, render ONCE.
// A missing/broken widget must never dead-end the user in a captcha wall.
function renderTurnstile() {
  const wrap = document.getElementById('turnstileWrap');
  const host = document.getElementById('turnstileWidget');
  const status = document.getElementById('turnstileStatus');
  if (!wrap || !host) return;

  // No SITE KEY on the page. If the server does NOT enforce Turnstile this is the normal
  // testing state (nothing shown, nothing blocked). But if the server DOES enforce it, a
  // missing key means every generation would 403 with no visible widget — surface that
  // loudly instead of dead-ending the user with a confusing 403.
  if (!TURNSTILE_SITE_KEY) {
    if (turnstileEnforced) {
      turnstileMisconfigured = true;
      wrap.hidden = false;
      if (status) {
        status.hidden = false;
        status.textContent = 'Human verification is required by the server, but the Turnstile site key is not configured. Add your site key to app.html to enable generation.';
      }
    }
    return;
  }
  wrap.hidden = false;

  // Load the Cloudflare API only when a SITE KEY exists. During testing (empty key)
  // this saves one cross-origin request on every page load.
  try {
    if (!document.querySelector('script[data-spai-turnstile]')) {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-spai-turnstile', '1');
      (document.head || document.body).appendChild(s);
    }
  } catch { /* the polling fallback below still tolerates a missing script */ }

  let tries = 0;
  const tryRender = () => {
    if (turnstileWidgetId !== null) return; // already rendered — never double-render
    if (!window.turnstile || typeof window.turnstile.render !== 'function') {
      if (++tries > 50) {
        if (status) {
          status.hidden = false;
          status.textContent = 'Human verification is unavailable right now. You can still generate.';
        }
        return;
      }
      setTimeout(tryRender, 200);
      return;
    }
    try {
      turnstileWidgetId = window.turnstile.render(host, {
        sitekey: TURNSTILE_SITE_KEY,
        appearance: 'interaction-only',
        theme: 'dark',
        callback: (t) => { cfToken = t || ''; },
        'expired-callback': () => { cfToken = ''; },
        'error-callback': () => { cfToken = ''; },
      });
    } catch (e) {
      if (status) {
        status.hidden = false;
        status.textContent = 'Human verification could not load. You can still generate.';
      }
    }
  };
  tryRender();
}

// Only block a generation when a widget was actually rendered and is unsolved.
// With an empty SITE KEY (or a failed widget) this is always false.
function turnstileBlocking() {
  return !!(TURNSTILE_SITE_KEY && turnstileWidgetId !== null && !cfToken);
}

// Reconcile server enforcement state with the client SITE KEY after /api/usage returns.
// Surfaces a misconfig (server enforces, no key) so the user is never silently 403'd,
// and clears the warning once a key is present. Then re-evaluates widget rendering.
function syncTurnstileState() {
  const wrap = document.getElementById('turnstileWrap');
  const status = document.getElementById('turnstileStatus');
  if (turnstileEnforced && !TURNSTILE_SITE_KEY) {
    turnstileMisconfigured = true;
    if (wrap) wrap.hidden = false;
    if (status) {
      status.hidden = false;
      status.textContent = 'Human verification is required by the server, but the Turnstile site key is not configured. Add your site key to app.html to enable generation.';
    }
  } else {
    turnstileMisconfigured = false;
    if (status && !turnstileWidgetId) { status.hidden = true; status.textContent = ''; }
  }
  renderTurnstile(); // re-evaluate widget rendering now that enforcement is known
}

// ---------- Platform list ----------
const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', emoji: '📸', hint: 'Visual hooks, 15–30 hashtags' },
  { id: 'tiktok', name: 'TikTok', emoji: '🎵', hint: '[Hook] + [Script] video plan' },
  { id: 'x', name: 'X', emoji: '𝕏', hint: 'Punchy, under 280' },
  { id: 'linkedin', name: 'LinkedIn', emoji: '💼', hint: 'Professional, structured' },
  { id: 'facebook', name: 'Facebook', emoji: '👍', hint: 'Conversational, CTA' },
];

// Display name of the generated artifact per platform (used in the result card title).
const PLATFORM_OUTPUT = {
  tiktok: 'TikTok Script',
  instagram: 'Instagram Caption',
  linkedin: 'LinkedIn Post',
  x: 'X Post',
  facebook: 'Facebook Post',
};

const STYLES = [
  { id: 'lively', name: 'Lively' },
  { id: 'formal', name: 'Formal' },
  { id: 'elegant', name: 'Elegant' },
  { id: 'casual', name: 'Casual' },
];

const TONE_WORDS = ['Very formal','Formal','Professional','Formal-warm','Polite','Balanced','Trendy','Casual','Very casual','Slangy','Spoken'];

let selectedPlatform = 'tiktok';
let outputLang = 'en';
let selectedStyle = 'lively';
let tone = 5;
let wordCount = 180;

// ---------- Daily free limit (client-side gate; Worker enforces too) ----------
function todayKey() {
  const d = new Date();
  return `spai_used_${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
function usedToday() {
  return parseInt(localStorage.getItem(todayKey()) || '0', 10);
}
function markUsed() {
  localStorage.setItem(todayKey(), String(usedToday() + 1));
  // Keep the on-screen counter AND the Generate button in lock-step with the server
  // truth: the instant a credit is spent, decrement the synced remaining count locally
  // so the button and the counter can never show contradictory states (e.g. counter says
  // "1 left" while the button is greyed). fetchUsage() re-syncs with the server afterwards.
  if (lastUsage && lastUsage.tier === 'free' && lastUsage.left > 0) {
    lastUsage = { ...lastUsage, used: lastUsage.used + 1, left: lastUsage.left - 1 };
  }
}
function limitReached() {
  if (isPro()) return false; // Pro is enforced server-side (up to 50/day)
  return usedToday() >= 1; // free plan: 1 generation per day
}
// Authoritative "is the free quota gone?" decision. Prefers the server-synced counter
// (lastUsage.left) so the button and the counter ALWAYS agree; falls back to the local
// optimistic flag only before the first /api/usage response arrives. This is what fixes
// the "counter says 1 left but button is greyed" state-machine conflict.
function freeDepleted() {
  if (isPro()) return false;
  if (lastUsage && lastUsage.tier === 'free') return lastUsage.left <= 0;
  return limitReached();
}

// ---------- Render: platform chips (single-select) ----------
const platformChips = document.getElementById('platformChips');
PLATFORMS.forEach((p) => {
  const b = document.createElement('button');
  b.className = 'chip' + (p.id === selectedPlatform ? ' active' : '');
  b.textContent = `${p.emoji} ${p.name}`;
  b.onclick = () => {
    selectedPlatform = p.id;
    [...platformChips.children].forEach((c) => c.classList.remove('active'));
    b.classList.add('active');
    updatePlatformHint();
  };
  platformChips.appendChild(b);
});
function updatePlatformHint() {
  const hint = document.getElementById('platformHint');
  const p = PLATFORMS.find((x) => x.id === selectedPlatform);
  hint.textContent = p ? `${p.emoji} ${p.name}: ${p.hint}` : 'Select one platform.';
}
updatePlatformHint();

// ---------- Render: style chips ----------
const styleChips = document.getElementById('styleChips');
STYLES.forEach((s) => {
  const b = document.createElement('button');
  b.className = 'chip' + (s.id === selectedStyle ? ' active' : '');
  b.textContent = s.name;
  b.onclick = () => {
    selectedStyle = s.id;
    [...styleChips.children].forEach((c) => c.classList.remove('active'));
    b.classList.add('active');
  };
  styleChips.appendChild(b);
});

// ---------- Language segmented ----------
document.getElementById('langSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  outputLang = btn.dataset.lang;
  [...document.getElementById('langSeg').children].forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
});

// ---------- Auto-detect browser language (sets the AI OUTPUT language only, never the UI language; Chinese option stays available) ----------
(function initLanguage() {
  const nav = (navigator.language || 'en').toLowerCase();
  const lang = nav.startsWith('zh') ? 'zh' : 'en';
  outputLang = lang;
  document.querySelectorAll('#langSeg .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
})();

// ---------- Sliders: live labels + guaranteed values on every request ----------
// 11 labels map 1:1 to the Tone slider's 0..10 values (left = formal, right = casual).
const TONE_MIN = 0, TONE_MAX = 10;
const LEN_MIN = 50, LEN_MAX = 500, LEN_STEP = 10;

const toneEl = document.getElementById('tone');
const toneLabel = document.getElementById('toneLabel');
const wcEl = document.getElementById('wordCount');
const wcLabel = document.getElementById('wcLabel');

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function toneWordAt(value) {
  const i = clampInt(value, TONE_MIN, TONE_MAX, 5) - TONE_MIN;
  return TONE_WORDS[i] || 'Balanced';
}
// Always read the ACTUAL slider DOM value, so the label and the JSON body can never drift.
function readTone() {
  return toneEl && toneEl.value !== undefined
    ? clampInt(toneEl.value, TONE_MIN, TONE_MAX, tone) : tone;
}
function readLength() {
  return wcEl && wcEl.value !== undefined
    ? clampInt(wcEl.value, LEN_MIN, LEN_MAX, wordCount) : wordCount;
}
function syncSliderLabels() {
  tone = readTone();
  wordCount = readLength();
  if (toneLabel) toneLabel.textContent = toneWordAt(tone);
  if (wcLabel) wcLabel.textContent = `${wordCount}`;
  if (toneEl) toneEl.setAttribute('aria-valuetext', toneWordAt(tone));
  if (wcEl) wcEl.setAttribute('aria-valuetext', `${wordCount}`);
}
function bindSliders() {
  const onMove = () => syncSliderLabels();
  [toneEl, wcEl].forEach((el) => {
    if (!el || el.dataset.spaiBound === '1') return;
    el.dataset.spaiBound = '1';
    el.addEventListener('input', onMove);
    el.addEventListener('change', onMove);
  });
  syncSliderLabels();
}
bindSliders();
// Safety net: if this script ever runs before the DOM is parsed, re-bind once it is.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindSliders, { once: true });
}

// ---------- Topic ----------
// The textarea has maxlength=300, so it cannot actually overflow. Turn the counter
// red as the user approaches the cap (and after a long paste is truncated) instead.
const TOPIC_MAX = 300;
const TOPIC_WARN = 270;
const topic = document.getElementById('topic');
const topicCount = document.getElementById('topicCount');
function syncTopicCount() {
  const n = String(topic.value || '').length;
  topicCount.textContent = n;
  topicCount.className = n >= TOPIC_WARN ? 'over' : '';
  topic.setAttribute('aria-invalid', n >= TOPIC_MAX ? 'true' : 'false');
}
topic.oninput = syncTopicCount;
topic.addEventListener('paste', () => { setTimeout(syncTopicCount, 0); });
syncTopicCount();

// ---------- Plan tag / limit UI ----------
function refreshLimitUI() {
  const planTag = document.getElementById('planTag');
  const limitNote = document.getElementById('limitNote');
  const genBtn = document.getElementById('generateBtn');
  if (isPro()) {
    planTag.textContent = 'Pro · up to 50/day';
    limitNote.hidden = true;
    genBtn.disabled = false;
    genBtn.textContent = 'Generate Content';
  } else if (freeDepleted()) {
    planTag.textContent = 'Free · used today';
    limitNote.hidden = false;
    genBtn.disabled = true;
    genBtn.textContent = 'Daily limit reached';
  } else {
    planTag.textContent = 'Free · 1 credit/day';
    limitNote.hidden = true;
    genBtn.disabled = false;
    genBtn.textContent = 'Generate Content';
  }
  renderUsageCounter(lastUsage);
}

// ---- Daily usage counter (synced with the Worker's /api/usage) ----
// lastUsage holds the authoritative { tier, limit, used, left } returned by the
// Worker. renderLocalUsage() paints an instant optimistic value before the network
// confirms it; fetchUsage() then corrects it with the server's real number.
let lastUsage = null;
let usageFetching = false;
function renderUsageCounter(u) {
  const el = document.getElementById('usageCounter');
  if (!el) return;
  if (!u) { el.hidden = true; return; }
  el.hidden = false;
  const tierEl = document.getElementById('ucTier');
  const leftEl = document.getElementById('ucLeft');
  const limitEl = document.getElementById('ucLimit');
  const upgradeEl = document.getElementById('ucUpgrade');
  if (tierEl) tierEl.textContent = u.tier === 'pro' ? 'Pro' : 'Free';
  if (leftEl) leftEl.textContent = String(u.left);
  if (limitEl) limitEl.textContent = '/' + u.limit;
  if (u.left > 0) {
    el.classList.remove('depleted');
    if (upgradeEl) upgradeEl.hidden = true;
  } else {
    el.classList.add('depleted');          // 0 left -> red, and show the Upgrade link
    if (upgradeEl) upgradeEl.hidden = false;
  }
}
function renderLocalUsage() {
  if (isPro()) {
    lastUsage = { tier: 'pro', limit: FRONT_PRO_DAILY, used: 0, left: FRONT_PRO_DAILY };
  } else {
    const used = limitReached() ? FRONT_FREE_DAILY : 0;
    lastUsage = { tier: 'free', limit: FRONT_FREE_DAILY, used, left: FRONT_FREE_DAILY - used };
  }
  refreshLimitUI();
}
async function fetchUsage() {
  if (usageFetching) return;
  usageFetching = true;
  try {
    const params = new URLSearchParams();
    const email = getProEmail();
    if (email) params.set('email', email);
    params.set('uuid', getDeviceId());
    const res = await fetch(`${WORKER_URL}/api/usage?${params.toString()}`, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return;
    const d = await res.json().catch(() => null);
    if (!d || !d.ok) return;
    lastUsage = { tier: d.tier === 'pro' ? 'pro' : 'free', limit: d.limit, used: d.used, left: d.left };
    turnstileEnforced = !!d.turnstileEnforced;
    syncTurnstileState();
    refreshLimitUI();
  } catch (e) {
    // Network/Worker down: keep the optimistic local value already on screen.
  } finally {
    usageFetching = false;
  }
}

// Exactly ONE upgrade prompt may be visible at any moment. The styled dark box
// (#limitNote at the bottom of the card) owns it. The result area is reserved
// for generated copy and short status messages — never a second upgrade CTA.
function showLimitNotice(message) {
  const resultBox = document.getElementById('result');
  const note = document.getElementById('limitNote');
  if (resultBox) resultBox.hidden = true;
  if (note) {
    const p = note.querySelector('p');
    if (p && message) p.textContent = message;
    note.hidden = false;
  }
}
refreshLimitUI();
renderLocalUsage();   // instant optimistic counter, corrected by the server below
fetchUsage();         // GET /api/usage -> authoritative remaining quota
renderTurnstile();

// Upgrade link inside the usage counter opens Pricing (no second prompt overlaps).
{
  const ucUpgradeEl = document.getElementById('ucUpgrade');
  if (ucUpgradeEl) ucUpgradeEl.onclick = (e) => { e.preventDefault(); openPricing(); };
}

// ---------- Generate ----------
const result = document.getElementById('result');
const resultBody = document.getElementById('resultBody');
const generateBtn = document.getElementById('generateBtn');

// A refresh wipes the streaming state. Surface the interruption notice once on the
// next load so the user knows the generation stopped AND the free credit survived.
(function restoreInterruptedNotice() {
  let flagged = false;
  try {
    flagged = sessionStorage.getItem(INTERRUPTED_KEY) === '1';
    if (flagged) sessionStorage.removeItem(INTERRUPTED_KEY);
  } catch { /* private mode / storage blocked */ }
  if (!flagged) return;
  result.hidden = false;
  resultBody.innerHTML =
    '<p class="pl-name">Content</p>' +
    `<p style="color:#f87171;font-weight:700;margin:0;">${INTERRUPTED}</p>`;
})();

generateBtn.onclick = async () => {
  if (turnstileMisconfigured) {
    const status = document.getElementById('turnstileStatus');
    if (status && status.hidden) status.hidden = false;
    alert('Human verification is required by the server, but the Turnstile site key is missing in app.html. Please add it to enable generation.');
    return;
  }
  if (freeDepleted()) { openLimitModal(); return; }
  if (!topic.value.trim()) { alert('Please enter a topic first.'); return; }
  if (!selectedPlatform) { alert('Please select a platform.'); return; }
  if (turnstileBlocking()) { alert('Please complete the human verification first.'); return; }
  syncSliderLabels(); // snap the labels and the outgoing values together

  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating…';
  result.hidden = true;

  try {
    const res = await fetch(`${WORKER_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uuid: getDeviceId(),
        email: getProEmail(),
        checkoutId: getCheckoutId(),
        platforms: [selectedPlatform],
        style: selectedStyle,
        tone: readTone(),
        toneWord: toneWordAt(readTone()),
        wordCount: readLength(),
        topic: topic.value.trim(),
        outputLanguage: outputLang,
        cfToken,
      }),
    });

    const ctype = (res.headers.get('content-type') || '').toLowerCase();

    // Rate-limited: Worker returns a JSON 429 — show the message, don't try to stream.
    if (res.status === 429) {
      let msg = 'Free limit reached. Note: the free tier allows only one generation per network per day. Upgrade to Pro for full access on all your devices.';
      let code = '';
      try {
        const e = await res.json();
        if (e && e.message) msg = e.message;
        if (e && e.error) code = e.error;
      } catch {}
      // A payer whose server-side Pro record is still syncing must NEVER be shown a
      // "free limit reached" prompt. Retry the silent checkout claim in the background.
      // Shown as a NEUTRAL status line (no red, no second CTA): the result area is
      // reserved for copy/status, never for a red inline upgrade nag.
      if (isPro() && code === 'free_quota_used') {
        if (PAYMENT_RETURN.checkoutId) claimCheckout(PAYMENT_RETURN.checkoutId, PAYMENT_RETURN.rawQuery);
        refreshLimitUI();
        result.hidden = false;
        resultBody.innerHTML =
          '<p style="color:#a1a1aa;font-weight:600;margin:0;">Your Pro access is still syncing. Please wait a few seconds and try again.</p>';
        return;
      }
      // Only a genuine daily free-quota exhaustion consumes the local free credit.
      // A 5/min burst guard, a Pro daily cap or a global capacity cap must not burn it.
      if (!isPro() && code === 'free_quota_used') markUsed();
      refreshLimitUI();

      // Free daily quota exhausted -> the SINGLE dark box (#limitNote) owns the upgrade
      // prompt. The result area is hard-cleared (hidden + emptied) so no red inline
      // text or stray button can survive a refresh or a prior generation.
      if (code === 'free_quota_used' || code === '') {
        showLimitNotice(msg);
        result.hidden = true;
        resultBody.innerHTML = '';
      } else {
        // Other 429s (too many requests, Pro cap, global capacity): one NEUTRAL
        // status line in the result area, no red, no CTA, no dark box.
        result.hidden = false;
        resultBody.innerHTML = `<p style="color:#a1a1aa;font-weight:600;margin:0;">${escapeHtml(msg)}</p>`;
      }
      return;
    }

    // Captcha failed at the edge — prompt a fresh solve. Neutral status, no red.
    if (res.status === 403) {
      let msg = 'Please complete the human verification.';
      try { const e = await res.json(); if (e && e.message) msg = e.message; } catch {}
      result.hidden = false;
      resultBody.innerHTML = `<p style="color:#a1a1aa;font-weight:600;margin:0;">${escapeHtml(msg)}</p>`;
      if (window.turnstile && turnstileWidgetId !== null) { try { window.turnstile.reset(); } catch {} cfToken = ''; }
      return;
    }

    // Anything that isn't a streaming text response is treated as an error.
    if (!ctype.includes('text/plain')) {
      let detail = '';
      try { const e = await res.json(); detail = e.detail || e.error || e.message || ''; } catch {}
      throw new Error(`HTTP ${res.status}${detail ? ' — ' + detail : ''}`);
    }

    // Streaming: reveal the card instantly, then append text as tokens arrive.
    // A daily credit is consumed ONLY when streamIntoResult() confirms the stream
    // reached done:true. A refresh / abort / network drop must never cost the user.
    const completed = await streamIntoResult(res, selectedPlatform);
    if (completed && !isPro()) markUsed();
    refreshLimitUI();
    fetchUsage(); // re-sync the counter with the server's post-generation quota
    // Free users solve once per generation; Pro keeps a valid (auto-refreshed) token.
    if (!isPro() && window.turnstile && turnstileWidgetId !== null) { try { window.turnstile.reset(); } catch {} cfToken = ''; }
  } catch (err) {
    // Network drop / non-streaming HTTP error: one calm line, never raw error text.
    flagInterrupted();
    result.hidden = false;
    resultBody.innerHTML = `<p style="color:#f87171;font-weight:700;margin:0;">${ENGINE_BUSY}</p>`;
  } finally {
    if (!freeDepleted()) {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate Content';
    }
  }
};

// Highlight [Visual]/[Voiceover] and the Chinese format tags in AI-generated TikTok scripts.
// The Chinese characters below are Unicode escapes so this file contains no hard-coded
// Chinese UI strings; they only ever match text produced by the AI, never interface copy.
function highlightTags(escapedHtml, platform) {
  if (platform !== 'tiktok') return escapedHtml;
  return escapedHtml.replace(/\[(Visual|Voiceover|\u753b\u9762|\u53e3\u64ad)\]/g, '<span class="tag-hl">$&</span>');
}
function renderResult(text) {
  result.hidden = false;
  const outName = PLATFORM_OUTPUT[selectedPlatform] || 'Content';
  resultBody.innerHTML = `<p class="pl-name">${outName}</p>${highlightTags(escapeHtml(text), selectedPlatform)}`;
}

// Stream the Worker's text/plain response into the result card, token by token.
// The card opens the instant the first byte arrives; a caret blinks while streaming;
// when the stream ends we do a final escape + TikTok [Visual]/[Voiceover] highlight pass.
//
// Returns true ONLY when reader.read() reported done:true with no exception.
// Any abort (page refresh, tab close, manual stop, network drop, upstream error)
// returns false, so the caller never burns a daily credit on a result the user
// never received. We also cancel the reader so the Worker drops the stream too.
async function streamIntoResult(res, platform) {
  result.hidden = false;
  const outName = PLATFORM_OUTPUT[platform] || 'Content';
  resultBody.innerHTML =
    `<p class="pl-name">${outName}</p><span class="stream-text"></span><span class="stream-cursor" aria-hidden="true"></span>`;
  const textSpan = resultBody.querySelector('.stream-text');

  let reader;
  try {
    if (!res.body || typeof res.body.getReader !== 'function') {
      throw new Error('Streaming is not supported by this browser.');
    }
    reader = res.body.getReader();
  } catch (e) {
    flagInterrupted();
    resultBody.innerHTML =
      `<p class="pl-name">${outName}</p>` +
      `<p style="color:#f87171;font-weight:700;margin:0;">${INTERRUPTED}</p>`;
    return false;
  }

  const decoder = new TextDecoder();
  let full = '';
  let completed = false;
  let engineFailed = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { completed = true; break; }
      full += decoder.decode(value, { stream: true });
      if (textSpan) textSpan.textContent = full;
    }
    full += decoder.decode(); // flush any trailing partial UTF-8 sequence
  } catch (e) {
    completed = false;
    flagInterrupted();
    // Tell the edge we are done reading: its stream cancel() skips the quota charge.
    try { const p = reader.cancel(); if (p && p.catch) p.catch(() => {}); } catch {}
    try { full += decoder.decode(); } catch {}
  }

  // The Worker appends [SPAI_ERROR:...] when the AI provider fails. Strip the
  // marker, show one friendly line, and never count this as a delivered result.
  if (full.includes('[SPAI_ERROR:')) {
    engineFailed = true;
    completed = false;
    full = full.replace(SPAI_ERR_MARK, '').trim();
  }

  const notice = engineFailed
    ? `<p style="color:#f87171;font-weight:700;margin:12px 0 0;">${ENGINE_BUSY}</p>`
    : (completed ? '' : `<p style="color:#f87171;font-weight:700;margin:12px 0 0;">${INTERRUPTED}</p>`);
  resultBody.innerHTML =
    `<p class="pl-name">${outName}</p>${highlightTags(escapeHtml(full), platform)}` + notice;
  return completed && !engineFailed;
}
function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ---------- Copy ----------
document.getElementById('copyBtn').onclick = () => {
  const text = resultBody.innerText;
  navigator.clipboard?.writeText(text).then(() => {
    const b = document.getElementById('copyBtn');
    b.textContent = 'Copied!';
    setTimeout(() => (b.textContent = 'Copy'), 1500);
  });
};

// ---------- Pricing modal (two plans + Pro activation) ----------
// (The old waitlist modal was replaced by the limit modal below.)
const CREEM_LINKS = {
  monthly: 'https://www.creem.io/payment/prod_4Thpo8gm2uZlxCVAfMtwi9',
  annual: 'https://www.creem.io/payment/prod_5roUxqOnOKvxOwkeGfFGcq',
};

// Open the Creem checkout in a NEW TAB so a payment failure (or a stuck Creem error
// dialog) can simply be closed, leaving the user on our site instead of being trapped
// on Creem's page. If the browser blocks the popup, fall back to a same-tab redirect.
function openCreemCheckout(url) {
  let w;
  try { w = window.open(url, '_blank', 'noopener,noreferrer'); } catch { w = null; }
  if (!w) window.location.href = url;
}

const pricingModal = document.getElementById('pricingModal');
function openPricing() { pricingModal.hidden = false; }
function closePricing() { pricingModal.hidden = true; }
pricingModal.querySelectorAll('[data-close-pricing]').forEach((el) => (el.onclick = closePricing));
document.getElementById('navPricing').addEventListener('click', (e) => { e.preventDefault(); openPricing(); });
document.getElementById('getMonthlyBtn').onclick = () => { openCreemCheckout(CREEM_LINKS.monthly); };
document.getElementById('getAnnualBtn').onclick = () => { openCreemCheckout(CREEM_LINKS.annual); };

// "I already paid" link inside Pricing opens the OTP-based Restore modal (secure self-recovery).
document.getElementById('activateProLink').onclick = (e) => { e.preventDefault(); openRestore(); };

// ---------- Login button -> Restore Pro Access modal (secure Email OTP) ----------
// Anyone can type an email, but Pro is only unlocked after the owner proves they can
// read that inbox: /api/send-otp emails a 6-digit code, /api/verify-otp checks it and
// (on success) confirms pro:<email> is valid before granting. No email-only shortcut.
const navLogin = document.getElementById('navLogin');
const restoreModal = document.getElementById('restoreModal');
const restoreEmailInput = document.getElementById('restoreEmail');
const restoreSendBtn = document.getElementById('restoreSendBtn');
const restoreStatus = document.getElementById('restoreStatus');
const restoreOtpWrap = document.getElementById('restoreOtpWrap');
const restoreCodeInput = document.getElementById('restoreCode');
const restoreVerifyBtn = document.getElementById('restoreVerifyBtn');
const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

function openRestore() {
  if (restoreStatus) { restoreStatus.className = 'waitlist-status'; restoreStatus.textContent = ''; }
  if (restoreOtpWrap) restoreOtpWrap.hidden = true;
  if (restoreSendBtn) { restoreSendBtn.disabled = false; restoreSendBtn.textContent = 'Send Code'; }
  if (restoreVerifyBtn) restoreVerifyBtn.disabled = false;
  if (restoreModal) restoreModal.hidden = false;
  if (restoreEmailInput) restoreEmailInput.focus();
}
function closeRestore() { if (restoreModal) restoreModal.hidden = true; }
if (restoreModal) restoreModal.querySelectorAll('[data-close-restore]').forEach((el) => (el.onclick = closeRestore));

// Step 1: request the code. Throttled server-side to 1/min per email + per IP.
if (restoreSendBtn) restoreSendBtn.onclick = async () => {
  const email = (restoreEmailInput.value || '').trim().toLowerCase();
  if (!isEmail(email)) {
    restoreStatus.className = 'waitlist-status err';
    restoreStatus.textContent = 'Please enter a valid email.';
    return;
  }
  restoreStatus.className = 'waitlist-status';
  restoreStatus.textContent = 'Sending code…';
  restoreSendBtn.disabled = true;
  try {
    const res = await fetch(`${WORKER_URL}/api/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const d = await res.json().catch(() => ({}));
    if (d && d.ok) {
      restoreStatus.className = 'waitlist-status ok';
      restoreStatus.textContent = 'Code sent. Check your inbox (and spam folder).';
      if (restoreOtpWrap) restoreOtpWrap.hidden = false;
      if (restoreCodeInput) restoreCodeInput.focus();
    } else if (d && d.error === 'rate_limited') {
      restoreSendBtn.disabled = false;
      restoreStatus.className = 'waitlist-status err';
      restoreStatus.textContent = 'Too many requests. Please wait a minute and try again.';
    } else if (d && d.error === 'resend_not_configured') {
      restoreSendBtn.disabled = false;
      restoreStatus.className = 'waitlist-status err';
      restoreStatus.textContent = 'Email service is not configured yet. Please contact support.';
    } else {
      restoreSendBtn.disabled = false;
      restoreStatus.className = 'waitlist-status err';
      restoreStatus.textContent = (d && d.message) || 'Could not send the code. Please try again.';
    }
  } catch (e) {
    restoreSendBtn.disabled = false;
    restoreStatus.className = 'waitlist-status err';
    restoreStatus.textContent = 'Network error. Please try again.';
  }
};

// Step 2: verify the code, then unlock Pro locally if the email is entitled.
if (restoreVerifyBtn) restoreVerifyBtn.onclick = async () => {
  const email = (restoreEmailInput.value || '').trim().toLowerCase();
  const code = (restoreCodeInput.value || '').trim();
  if (!isEmail(email)) {
    restoreStatus.className = 'waitlist-status err';
    restoreStatus.textContent = 'Please enter a valid email.';
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    restoreStatus.className = 'waitlist-status err';
    restoreStatus.textContent = 'Enter the 6-digit code we sent to your email.';
    return;
  }
  restoreStatus.className = 'waitlist-status';
  restoreStatus.textContent = 'Verifying…';
  restoreVerifyBtn.disabled = true;
  try {
    const res = await fetch(`${WORKER_URL}/api/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const d = await res.json().catch(() => ({}));
    if (d && d.ok && d.pro) {
      try { localStorage.setItem('spai_pro_email', email); } catch { /* storage blocked */ }
      restoreStatus.className = 'waitlist-status ok';
      restoreStatus.textContent = 'Pro access restored on this device.';
      refreshLimitUI();
      fetchUsage();
      setTimeout(closeRestore, 1800);
    } else if (d && d.ok && d.pro === false) {
      restoreVerifyBtn.disabled = false;
      restoreStatus.className = 'waitlist-status err';
      restoreStatus.textContent = 'This email does not have an active Pro subscription.';
    } else {
      restoreVerifyBtn.disabled = false;
      restoreStatus.className = 'waitlist-status err';
      restoreStatus.textContent = 'Invalid or expired code. Request a new one and try again.';
    }
  } catch (e) {
    restoreVerifyBtn.disabled = false;
    restoreStatus.className = 'waitlist-status err';
    restoreStatus.textContent = 'Network error. Please try again.';
  }
};
if (restoreEmailInput) restoreEmailInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); if (restoreSendBtn && !restoreSendBtn.disabled) restoreSendBtn.click(); }
});
if (restoreCodeInput) restoreCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); if (restoreVerifyBtn && !restoreVerifyBtn.disabled) restoreVerifyBtn.click(); }
});
if (navLogin) navLogin.addEventListener('click', (e) => { e.preventDefault(); openRestore(); });

// ---------- Limit reached modal (upgrade + Pro recovery) ----------
const limitModal = document.getElementById('limitModal');
function openLimitModal() {
  // The modal replaces the dark box instead of stacking a second prompt on top.
  const note = document.getElementById('limitNote');
  if (note) note.hidden = true;
  limitModal.hidden = false;
  const e = document.getElementById('limitEmail');
  if (e) e.focus();
}
function closeLimitModal() {
  limitModal.hidden = true;
  refreshLimitUI(); // restore the single card notice if the free credit is still used up
}
limitModal.querySelectorAll('[data-close-limit]').forEach((el) => (el.onclick = closeLimitModal));
document.getElementById('waitlistFromLimit').onclick = openLimitModal; // card's "Upgrade to Pro" link
document.getElementById('limitUpgradeBtn').onclick = () => { openCreemCheckout(CREEM_LINKS.monthly); };

// Pro recovery (from the free-limit modal): route to the OTP-based Restore modal.
const limitRestoreBtn = document.getElementById('limitRestoreBtn');
if (limitRestoreBtn) limitRestoreBtn.onclick = openRestore;

// ---------- Welcome dialog + silent Pro binding ----------
// CREEM_RETURN_KEYS and PAYMENT_RETURN are defined at the top of this file so the
// Pro grant happens before the first render. This section only handles the dialog.
const welcomeModal = document.getElementById('welcomeModal');
function closeWelcome() { if (welcomeModal) welcomeModal.hidden = true; }
if (welcomeModal) {
  welcomeModal.querySelectorAll('[data-close-welcome]').forEach((el) => (el.onclick = closeWelcome));
}

// Silently exchange checkout_id for the real payer email. Retries while the Creem
// webhook is in flight. Never blocks or changes the success dialog.
async function claimCheckout(checkoutId, rawQuery) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(`${WORKER_URL}/api/claim-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId, rawQuery, email: PAYMENT_RETURN.email }),
      });
      const d = await res.json().catch(() => ({}));
      if (d && d.pro) {
        const identity = String(d.email || d.identity || '').trim().toLowerCase();
        if (identity) {
          localStorage.setItem('spai_pro_email', identity);
          refreshLimitUI();
          fetchUsage();
          const line = document.getElementById('welcomeEmail');
          if (line && d.email) {
            line.textContent = `Your access is linked to ${d.email}. Please keep this email safe to log in on other devices.`;
          }
        }
        if (d.email) return; // real email resolved — done
      }
    } catch (e) { /* transient network error — retry */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

(function onPaymentReturn() {
  if (!PAYMENT_RETURN.matched) return;
  const { rawQuery, checkoutId, email: validEmail } = PAYMENT_RETURN;

  // Pro was already granted at the top of this file. Refresh the badge and show the
  // success dialog — never the Pricing modal, never an email prompt.
  refreshLimitUI();
  fetchUsage();
  const text = document.getElementById('welcomeText');
  if (text) text.textContent = 'Congratulations! Your payment was successful. You now have up to 50 generations per day.';
  const line = document.getElementById('welcomeEmail');
  if (line) line.textContent = validEmail
    ? `Your access is linked to ${validEmail}. Please keep this email safe to log in on other devices.`
    : 'Your access is being linked to your payment email…';
  if (welcomeModal) welcomeModal.hidden = false;

  // Clean the URL so a refresh never replays the dialog (keep any hash intact).
  try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch { /* no-op */ }

  // Background: bind the real payment email without any user input.
  if (checkoutId) claimCheckout(checkoutId, rawQuery);
})();

const welcomeStartBtn = document.getElementById('welcomeStartBtn');
if (welcomeStartBtn) welcomeStartBtn.onclick = () => {
  closeWelcome();
  refreshLimitUI();
  const card = document.querySelector('.window');
  if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const t = document.getElementById('topic');
  if (t && t.focus) t.focus({ preventScroll: true });
};
const welcomeAnnualLink = document.getElementById('welcomeAnnualLink');
if (welcomeAnnualLink) welcomeAnnualLink.onclick = (e) => { e.preventDefault(); openCreemCheckout(CREEM_LINKS.annual); };

// Landing "Pricing" link arrives as /app.html#pricing — open the pricing modal here.
// A payment-success return always wins: never show Pricing on top of the welcome dialog.
if (location.hash === '#pricing' && (!welcomeModal || welcomeModal.hidden)) { openPricing(); }

// Soft keyboard on iOS Safari / Android Chrome can cover the field being edited.
// Once the keyboard has settled, bring the focused input into the visible area.
['topic', 'proEmail', 'limitEmail'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el || !el.addEventListener) return;
  el.addEventListener('focus', () => {
    setTimeout(() => {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* unsupported */ }
    }, 300);
  });
});

// Year in footer
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// DevTools check: type spaiSettings() in the console to confirm both sliders
// are live and that the exact values below are what the Worker receives.
window.spaiSettings = () => ({
  platform: selectedPlatform,
  style: selectedStyle,
  tone: readTone(),
  toneWord: toneWordAt(readTone()),
  wordCount: readLength(),
  outputLanguage: outputLang,
  pro: isPro(),
  turnstileEnabled: !!TURNSTILE_SITE_KEY,
  turnstileRendered: turnstileWidgetId !== null,
});

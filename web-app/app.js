// ============================================================
// SocialPostAI Pro — Web front-end logic
// Talks to the Cloudflare Worker proxy (key stays server-side).
// Worker URL is configurable via window.WORKER_URL or this constant.
// ============================================================

// Set this to your Worker's production URL.
const WORKER_URL = 'https://api.socialpostai.app';

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
  if (!TURNSTILE_SITE_KEY) return;
  const wrap = document.getElementById('turnstileWrap');
  const host = document.getElementById('turnstileWidget');
  const status = document.getElementById('turnstileStatus');
  if (!wrap || !host) return;
  wrap.hidden = false;

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
}
function limitReached() {
  if (isPro()) return false; // Pro is enforced server-side (up to 50/day)
  return usedToday() >= 1; // free plan: 1 generation per day
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
const topic = document.getElementById('topic');
const topicCount = document.getElementById('topicCount');
topic.oninput = () => { topicCount.textContent = topic.value.length; };

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
  } else if (limitReached()) {
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
  const mgr = document.getElementById('manageSubBtn');
  if (mgr) mgr.hidden = !isPro();
}
refreshLimitUI();
renderTurnstile();

// ---------- Generate ----------
const result = document.getElementById('result');
const resultBody = document.getElementById('resultBody');
const generateBtn = document.getElementById('generateBtn');
const manageSubBtn = document.getElementById('manageSubBtn');

generateBtn.onclick = async () => {
  if (limitReached()) { openLimitModal(); return; }
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
      let msg = 'Daily free limit reached. Please upgrade to Pro.';
      let code = '';
      try {
        const e = await res.json();
        if (e && e.message) msg = e.message;
        if (e && e.error) code = e.error;
      } catch {}
      // A payer whose server-side Pro record is still syncing must NEVER be shown a
      // "free limit reached" prompt. Retry the silent checkout claim in the background.
      if (isPro() && code === 'free_quota_used') {
        if (PAYMENT_RETURN.checkoutId) claimCheckout(PAYMENT_RETURN.checkoutId, PAYMENT_RETURN.rawQuery);
        refreshLimitUI();
        result.hidden = false;
        resultBody.innerHTML =
          '<p style="color:#f87171;font-weight:700;margin:0;">Your Pro access is still syncing. Please wait a few seconds and try again.</p>';
        return;
      }
      markUsed();
      refreshLimitUI();
      result.hidden = false;
      resultBody.innerHTML =
        `<p style="color:#f87171;font-weight:700;margin:0 0 8px;">${escapeHtml(msg)}</p>` +
        '<p style="color:#a1a1aa;font-size:14px;margin:0 0 12px;">Upgrade to Pro for up to 50 generations per day.</p>' +
        '<button class="get-pro" id="inlineUpgradeBtn" style="max-width:240px;">Upgrade to Pro</button>';
      const ib = document.getElementById('inlineUpgradeBtn');
      if (ib) ib.onclick = () => { window.location.href = CREEM_LINKS.monthly; };
      return;
    }

    // Captcha failed at the edge — prompt a fresh solve.
    if (res.status === 403) {
      let msg = 'Please complete the human verification.';
      try { const e = await res.json(); if (e && e.message) msg = e.message; } catch {}
      result.hidden = false;
      resultBody.innerHTML = `<p style="color:#f87171;font-weight:700;margin:0;">${escapeHtml(msg)}</p>`;
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
    // Free users solve once per generation; Pro keeps a valid (auto-refreshed) token.
    if (!isPro() && window.turnstile && turnstileWidgetId !== null) { try { window.turnstile.reset(); } catch {} cfToken = ''; }
  } catch (err) {
    result.hidden = false;
    resultBody.innerHTML =
      '<p style="color:#f87171;font-weight:700;margin:0 0 8px;">Generation failed.</p>' +
      `<p style="color:#a1a1aa;font-size:13px;white-space:pre-wrap;word-break:break-word;line-height:1.5;margin:0;">${escapeHtml(String((err && err.message) || err))}</p>`;
  } finally {
    if (!limitReached()) {
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
    resultBody.innerHTML =
      `<p class="pl-name">${outName}</p>` +
      `<p style="color:#f87171;font-weight:700;margin:0;">${escapeHtml(String((e && e.message) || e))}</p>`;
    return false;
  }

  const decoder = new TextDecoder();
  let full = '';
  let completed = false;
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
    // Tell the edge we are done reading: its stream cancel() skips the quota charge.
    try { const p = reader.cancel(); if (p && p.catch) p.catch(() => {}); } catch {}
    try { full += decoder.decode(); } catch {}
  }
  resultBody.innerHTML =
    `<p class="pl-name">${outName}</p>${highlightTags(escapeHtml(full), platform)}` +
    (completed ? '' :
      '<p style="color:#f87171;font-weight:700;margin:12px 0 0;">Generation was interrupted — your credit was not used. Please try again.</p>');
  return completed;
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
const pricingModal = document.getElementById('pricingModal');
function openPricing() { pricingModal.hidden = false; }
function closePricing() { pricingModal.hidden = true; }
pricingModal.querySelectorAll('[data-close-pricing]').forEach((el) => (el.onclick = closePricing));
document.getElementById('navPricing').addEventListener('click', (e) => { e.preventDefault(); openPricing(); });
document.getElementById('getMonthlyBtn').onclick = () => { window.location.href = CREEM_LINKS.monthly; };
document.getElementById('getAnnualBtn').onclick = () => { window.location.href = CREEM_LINKS.annual; };

// Pro activation inside the Pricing modal (email-based; verified server-side via Creem webhook into KV)
const proActivate = document.getElementById('proActivate');
const proEmailInput = document.getElementById('proEmail');
const proActivateBtn = document.getElementById('proActivateBtn');
const proActivateStatus = document.getElementById('proActivateStatus');
document.getElementById('activateProLink').onclick = (e) => { e.preventDefault(); proActivate.hidden = false; proEmailInput.focus(); };
proActivateBtn.onclick = async () => {
  const email = proEmailInput.value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    proActivateStatus.className = 'waitlist-status err';
    proActivateStatus.textContent = 'Please enter a valid email.';
    return;
  }
  proActivateStatus.className = 'waitlist-status';
  proActivateStatus.textContent = 'Verifying…';
  try {
    const res = await fetch(`${WORKER_URL}/api/verify-pro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.pro) {
      localStorage.setItem('spai_pro_email', email);
      proActivateStatus.className = 'waitlist-status ok';
      proActivateStatus.textContent = 'Pro activated on this device — generations now use your Pro quota.';
      refreshLimitUI();
      setTimeout(closePricing, 1600);
    } else {
      proActivateStatus.className = 'waitlist-status err';
      proActivateStatus.textContent = 'No Pro plan found for this email. Double-check the address you used at checkout.';
    }
  } catch (e) {
    proActivateStatus.className = 'waitlist-status err';
    proActivateStatus.textContent = 'Verification failed (network). Please try again.';
  }
};

// ---------- Login button -> open Pricing (no real account system; Pro is email-based) ----------
const navLogin = document.getElementById('navLogin');
if (navLogin) navLogin.addEventListener('click', (e) => { e.preventDefault(); openPricing(); });

// ---------- Manage Subscription (Pro only) -> Creem customer portal ----------
if (manageSubBtn) {
  manageSubBtn.onclick = async () => {
    const email = getProEmail();
    if (!email) return;
    const orig = manageSubBtn.textContent;
    manageSubBtn.disabled = true;
    manageSubBtn.textContent = 'Opening…';
    try {
      const res = await fetch(`${WORKER_URL}/api/creem-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const d = await res.json().catch(() => ({}));
      if (d && d.url) {
        window.open(d.url, '_blank');
      } else {
        alert(d && d.message ? d.message : 'Could not open the subscription manager. Please contact support.');
      }
    } catch (e) {
      alert('Failed to open the subscription manager. Please contact support.');
    } finally {
      manageSubBtn.disabled = false;
      manageSubBtn.textContent = orig;
    }
  };
}

// ---------- Limit reached modal (upgrade + Pro recovery) ----------
const limitModal = document.getElementById('limitModal');
function openLimitModal() { limitModal.hidden = false; const e = document.getElementById('limitEmail'); if (e) e.focus(); }
function closeLimitModal() { limitModal.hidden = true; }
limitModal.querySelectorAll('[data-close-limit]').forEach((el) => (el.onclick = closeLimitModal));
document.getElementById('waitlistFromLimit').onclick = openLimitModal; // card's "Upgrade to Pro" link
document.getElementById('limitUpgradeBtn').onclick = () => { window.location.href = CREEM_LINKS.monthly; };

// Pro recovery: verify the payment email server-side, then unlock Pro on this device.
const limitEmailInput = document.getElementById('limitEmail');
const limitUnlockBtn = document.getElementById('limitUnlockBtn');
const limitUnlockStatus = document.getElementById('limitUnlockStatus');
limitUnlockBtn.onclick = async () => {
  const email = limitEmailInput.value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    limitUnlockStatus.className = 'waitlist-status err';
    limitUnlockStatus.textContent = 'Please enter a valid email.';
    return;
  }
  limitUnlockStatus.className = 'waitlist-status';
  limitUnlockStatus.textContent = 'Verifying…';
  try {
    const res = await fetch(`${WORKER_URL}/api/verify-pro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.pro) {
      localStorage.setItem('spai_pro_email', email);
      limitUnlockStatus.className = 'waitlist-status ok';
      limitUnlockStatus.textContent = 'Pro unlocked! Your generations now use the Pro quota.';
      refreshLimitUI();
      setTimeout(closeLimitModal, 1600);
    } else {
      limitUnlockStatus.className = 'waitlist-status err';
      limitUnlockStatus.textContent = 'No Pro plan found for this email. Double-check the address, or upgrade below.';
    }
  } catch (e) {
    limitUnlockStatus.className = 'waitlist-status err';
    limitUnlockStatus.textContent = 'Verification failed (network). Please try again.';
  }
};

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
if (welcomeAnnualLink) welcomeAnnualLink.onclick = (e) => { e.preventDefault(); window.location.href = CREEM_LINKS.annual; };

// Landing "Pricing" link arrives as /app.html#pricing — open the pricing modal here.
// A payment-success return always wins: never show Pricing on top of the welcome dialog.
if (location.hash === '#pricing' && (!welcomeModal || welcomeModal.hidden)) { openPricing(); }

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

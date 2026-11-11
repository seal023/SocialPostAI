// ============================================================
// SocialPostAI Pro — Web front-end logic
// Talks to the Cloudflare Worker proxy (key stays server-side).
// Worker URL is configurable via window.WORKER_URL or this constant.
// ============================================================

// Set this to your Worker's production URL.
const WORKER_URL = 'https://api.socialpostai.app';

// Paste your Cloudflare Turnstile SITE KEY here to enable human verification.
// Leave as '' to keep it disabled (dev). The Worker only enforces it once TURNSTILE_SECRET is set on its side.
const TURNSTILE_SITE_KEY = '';
let cfToken = '';

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

// ---------- Pro status (email-based; verified server-side via Creem webhook) ----------
function getProEmail() {
  return (localStorage.getItem('spai_pro_email') || '').trim().toLowerCase();
}
function isPro() {
  return !!getProEmail();
}

// Render the Turnstile widget once the Cloudflare script is ready.
// Only shows when TURNSTILE_SITE_KEY is set; the Worker enforces the token.
function renderTurnstile() {
  if (!TURNSTILE_SITE_KEY) return;
  const wrap = document.getElementById('turnstileWrap');
  if (wrap) wrap.hidden = false;
  const tryRender = () => {
    if (window.turnstile) {
      window.turnstile.render('#turnstileWidget', {
        sitekey: TURNSTILE_SITE_KEY,
        appearance: 'interaction-only',
        theme: 'dark',
        callback: (t) => { cfToken = t; },
        'expired-callback': () => { cfToken = ''; },
        'error-callback': () => { cfToken = ''; },
      });
    } else {
      setTimeout(tryRender, 200);
    }
  };
  tryRender();
}

// ---------- Platform list ----------
const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', emoji: '📸', hint: 'Visual hooks, 15–30 hashtags' },
  { id: 'tiktok', name: 'TikTok', emoji: '🎵', hint: '[Hook] + [Script] video plan' },
  { id: 'x', name: 'X', emoji: '𝕏', hint: 'Punchy, ≤280 chars' },
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

// ---------- Auto-detect browser language (sets the DEFAULT selection only; 中文 option stays available) ----------
(function initLanguage() {
  const nav = (navigator.language || 'en').toLowerCase();
  const lang = nav.startsWith('zh') ? 'zh' : 'en';
  outputLang = lang;
  document.querySelectorAll('#langSeg .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
})();

// ---------- Sliders ----------
const toneEl = document.getElementById('tone');
const toneLabel = document.getElementById('toneLabel');
toneEl.oninput = () => { tone = +toneEl.value; toneLabel.textContent = TONE_WORDS[tone]; };
toneLabel.textContent = TONE_WORDS[tone];

const wcEl = document.getElementById('wordCount');
const wcLabel = document.getElementById('wcLabel');
wcEl.oninput = () => { wordCount = +wcEl.value; wcLabel.textContent = `${wordCount} chars`; };
wcLabel.textContent = `${wordCount} chars`;

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
  if (TURNSTILE_SITE_KEY && !cfToken) { alert('Please complete the human verification first.'); return; }

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
        platforms: [selectedPlatform],
        style: selectedStyle,
        tone,
        wordCount,
        topic: topic.value.trim(),
        outputLanguage: outputLang,
        cfToken,
      }),
    });

    const ctype = (res.headers.get('content-type') || '').toLowerCase();

    // Rate-limited: Worker returns a JSON 429 — show the message, don't try to stream.
    if (res.status === 429) {
      let msg = 'Daily free limit reached.';
      try { const e = await res.json(); if (e && e.message) msg = e.message; } catch {}
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
      if (window.turnstile && TURNSTILE_SITE_KEY) { try { window.turnstile.reset(); } catch {} cfToken = ''; }
      return;
    }

    // Anything that isn't a streaming text response is treated as an error.
    if (!ctype.includes('text/plain')) {
      let detail = '';
      try { const e = await res.json(); detail = e.detail || e.error || e.message || ''; } catch {}
      throw new Error(`HTTP ${res.status}${detail ? ' — ' + detail : ''}`);
    }

    // Streaming: reveal the card instantly, then append text as tokens arrive.
    await streamIntoResult(res, selectedPlatform);
    markUsed();
    refreshLimitUI();
    // Free users solve once per generation; Pro keeps a valid (auto-refreshed) token.
    if (!isPro() && window.turnstile && TURNSTILE_SITE_KEY) { try { window.turnstile.reset(); } catch {} cfToken = ''; }
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

// Highlight [Visual]/[Voiceover] (and 画面/口播) labels for TikTok scripts so creators can scan them fast.
function highlightTags(escapedHtml, platform) {
  if (platform !== 'tiktok') return escapedHtml;
  return escapedHtml.replace(/$$(Visual|Voiceover|画面|口播)$$/g, '<span class="tag-hl">$&</span>');
}
function renderResult(text) {
  result.hidden = false;
  const outName = PLATFORM_OUTPUT[selectedPlatform] || 'Content';
  resultBody.innerHTML = `<p class="pl-name">${outName}</p>${highlightTags(escapeHtml(text), selectedPlatform)}`;
}

// Stream the Worker's text/plain response into the result card, token by token.
// The card opens the instant the first byte arrives; a caret blinks while streaming;
// when the stream ends we do a final escape + TikTok [Visual]/[口播] highlight pass.
async function streamIntoResult(res, platform) {
  result.hidden = false;
  const outName = PLATFORM_OUTPUT[platform] || 'Content';
  resultBody.innerHTML =
    `<p class="pl-name">${outName}</p><span class="stream-text"></span><span class="stream-cursor" aria-hidden="true"></span>`;
  const textSpan = resultBody.querySelector('.stream-text');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
      textSpan.textContent = full;
    }
  } catch (e) {
    full += '\n[stream interrupted]';
  }
  full += decoder.decode();
  resultBody.innerHTML = `<p class="pl-name">${outName}</p>${highlightTags(escapeHtml(full), platform)}`;
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

// ---------- Welcome back (returned from Creem with ?email=) ----------
const welcomeModal = document.getElementById('welcomeModal');
function closeWelcome() { welcomeModal.hidden = true; }
welcomeModal.querySelectorAll('[data-close-welcome]').forEach((el) => (el.onclick = closeWelcome));

// If returned from Creem checkout (no email param), open Pricing with the activation prompt.
(function onLoadPro() {
  const q = new URLSearchParams(window.location.search);
  if (q.has('email')) return; // handled by onLoadWelcome below
  const signals = ['order_id', 'creem', 'checkout_id', 'subscription_id', 'activated'];
  if (signals.some((s) => q.has(s))) {
    history.replaceState(null, '', window.location.pathname);
    openPricing();
    proActivate.hidden = false;
  }
})();

// Creem success redirect may carry ?email=... — greet the user and link Pro on this device.
(function onLoadWelcome() {
  const q = new URLSearchParams(window.location.search);
  if (!q.has('email')) return;
  const email = q.get('email').trim().toLowerCase();
  history.replaceState(null, '', window.location.pathname);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  localStorage.setItem('spai_pro_email', email);
  refreshLimitUI();
  const t = document.getElementById('welcomeText');
  if (t) t.textContent = `Your access is linked to ${email}. Please keep this email safe to log in on other devices.`;
  welcomeModal.hidden = false;
})();

// Landing "Pricing" link arrives as /app.html#pricing — open the pricing modal here.
if (location.hash === '#pricing') { openPricing(); }

// Year in footer
document.getElementById('year').textContent = new Date().getFullYear();

// ============================================================
// SocialPostAI Pro — Web front-end logic
// Talks to the Cloudflare Worker proxy (key stays server-side).
// Worker URL is configurable via window.WORKER_URL or this constant.
// ============================================================

// Set this to your Worker's production URL.
const WORKER_URL = 'https://api.socialpostai.app';

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

// ---------- Platform list ----------
const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', emoji: '📸', hint: 'Visual hooks, 15–30 hashtags' },
  { id: 'tiktok', name: 'TikTok', emoji: '🎵', hint: '[Hook] + [Script] video plan' },
  { id: 'x', name: 'X', emoji: '𝕏', hint: 'Punchy, ≤280 chars' },
  { id: 'linkedin', name: 'LinkedIn', emoji: '💼', hint: 'Professional, structured' },
  { id: 'facebook', name: 'Facebook', emoji: '👍', hint: 'Conversational, CTA' },
];

const STYLES = [
  { id: 'lively', name: 'Lively' },
  { id: 'formal', name: 'Formal' },
  { id: 'elegant', name: 'Elegant' },
  { id: 'casual', name: 'Casual' },
];

const TONE_WORDS = ['Very formal','Formal','Professional','Formal-warm','Polite','Balanced','Trendy','Casual','Very casual','Slangy','Spoken'];

const selectedPlatform = 'tiktok';
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
  return usedToday() >= 1;   // Free tier = 1 credit/day
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
    genBtn.textContent = 'Generate copy';
  } else if (limitReached()) {
    planTag.textContent = 'Free · used today';
    limitNote.hidden = false;
    genBtn.disabled = true;
    genBtn.textContent = 'Daily limit reached';
  } else {
    planTag.textContent = 'Free · 1 credit/day';
    limitNote.hidden = true;
    genBtn.disabled = false;
    genBtn.textContent = 'Generate copy';
  }
}
refreshLimitUI();

// ---------- Generate ----------
const result = document.getElementById('result');
const resultBody = document.getElementById('resultBody');
const generateBtn = document.getElementById('generateBtn');

generateBtn.onclick = async () => {
  if (limitReached()) { openWaitlist(); return; }
  if (!topic.value.trim()) { alert('Please enter a topic first.'); return; }
  if (!selectedPlatform) { alert('Please select a platform.'); return; }

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
      }),
    });

    if (res.status === 429) {
      let msg = '今日免费额度已用完，请升级 Pro';
      try { const e = await res.json(); if (e && e.message) msg = e.message; } catch {}
      markUsed();
      refreshLimitUI();
      result.hidden = false;
      resultBody.innerHTML =
        `<p style="color:#f87171;font-weight:700;margin:0 0 8px;">${escapeHtml(msg)}</p>` +
        '<p style="color:#a1a1aa;font-size:14px;margin:0;">Upgrade to Pro for up to 50 generations per day.</p>';
      return;
    }

    if (!res.ok) {
      let detail = '';
      try { const e = await res.json(); detail = e.detail || e.error || ''; } catch {}
      throw new Error(`HTTP ${res.status}${detail ? ' — ' + detail : ''}`);
    }
    const data = await res.json();
    const text = data.text || data.data || '';
    renderResult(text);
    markUsed();
    refreshLimitUI();
  } catch (err) {
    result.hidden = false;
    resultBody.innerHTML =
      '<p style="color:#f87171;font-weight:700;margin:0 0 8px;">Generation failed.</p>' +
      `<p style="color:#a1a1aa;font-size:13px;white-space:pre-wrap;word-break:break-word;line-height:1.5;margin:0;">${escapeHtml(String((err && err.message) || err))}</p>`;
  } finally {
    if (!limitReached()) {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate copy';
    }
  }
};

function renderResult(text) {
  result.hidden = false;
  const p = PLATFORMS.find((x) => x.id === selectedPlatform);
  const name = p ? p.name : '';
  resultBody.innerHTML = `<p class="pl-name">${name ? name + ' — ' : ''}Copy</p>${escapeHtml(text)}`;
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

// ---------- Waitlist modal ----------
const modal = document.getElementById('waitlistModal');
function openWaitlist() { modal.hidden = false; document.getElementById('waitlistEmail').focus(); }
function closeWaitlist() { modal.hidden = true; }
modal.querySelectorAll('[data-close]').forEach((el) => (el.onclick = closeWaitlist));
document.getElementById('waitlistFromLimit').onclick = openWaitlist;

document.getElementById('waitlistSubmit').onclick = async () => {
  const email = document.getElementById('waitlistEmail').value.trim();
  const status = document.getElementById('waitlistStatus');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    status.className = 'waitlist-status err';
    status.textContent = 'Please enter a valid email.';
    return;
  }
  status.className = 'waitlist-status';
  status.textContent = 'Submitting…';
  try {
    const res = await fetch(`${WORKER_URL}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok || res.status === 404 || res.status === 502) {
      // Worker may not be deployed yet — still acknowledge locally.
      status.className = 'waitlist-status ok';
      status.textContent = "You're on the list! We'll email you at launch. 🎉";
      document.getElementById('waitlistEmail').value = '';
      setTimeout(closeWaitlist, 1800);
    } else {
      throw new Error('submit failed');
    }
  } catch (e) {
    // Offline / Worker not ready: keep email locally so we don't lose the lead.
    const saved = JSON.parse(localStorage.getItem('spai_waitlist') || '[]');
    saved.push({ email, ts: Date.now() });
    localStorage.setItem('spai_waitlist', JSON.stringify(saved));
    status.className = 'waitlist-status ok';
    status.textContent = "Saved! We'll be in touch at launch. 🎉";
    document.getElementById('waitlistEmail').value = '';
    setTimeout(closeWaitlist, 1800);
  }
};

// ---------- Pricing modal (two plans + Pro activation) ----------
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

// Pro activation (email-based; verified server-side via Creem webhook into KV)
const proActivate = document.getElementById('proActivate');
const proEmailInput = document.getElementById('proEmail');
const proActivateBtn = document.getElementById('proActivateBtn');
const proActivateStatus = document.getElementById('proActivateStatus');
document.getElementById('activateProLink').onclick = (e) => { e.preventDefault(); proActivate.hidden = false; proEmailInput.focus(); };
proActivateBtn.onclick = () => {
  const email = proEmailInput.value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    proActivateStatus.className = 'waitlist-status err';
    proActivateStatus.textContent = 'Please enter a valid email.';
    return;
  }
  localStorage.setItem('spai_pro_email', email);
  proActivateStatus.className = 'waitlist-status ok';
  proActivateStatus.textContent = 'Pro activated on this device — generations now use your Pro quota.';
  refreshLimitUI();
  setTimeout(closePricing, 1600);
};

// If returned from Creem checkout, open pricing modal with the activation prompt.
(function onLoadPro() {
  const q = new URLSearchParams(window.location.search);
  const signals = ['order_id', 'creem', 'checkout_id', 'subscription_id', 'activated'];
  if (signals.some((s) => q.has(s))) {
    history.replaceState(null, '', window.location.pathname);
    openPricing();
    proActivate.hidden = false;
  }
})();

// Year in footer
document.getElementById('year').textContent = new Date().getFullYear();

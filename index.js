// SocialPostAI Web — Cloudflare Worker proxy
// POST /api/generate     : high-freq guard (5/min/IP) -> Pro (50/day by email) | Free (1/day by IP+device)
//                           -> call DashScope (Bailian) per platform -> return text
// POST /api/waitlist     : store an email lead (Creem fallback)
// POST /api/creem-webhook: Creem payment webhook -> mark email as Pro in KV
//
// Secrets (Settings -> Variables -> Secrets):  DASHSCOPE_API_KEY, CREEM_WEBHOOK_SECRET (optional; verify skipped if unset)
// Plain text (Settings -> Variables):          DASHSCOPE_BASE_URL, DASHSCOPE_MODEL
// KV (Settings -> Bindings, REQUIRED for limits): variable name RATE_LIMIT
//   - Free = 1 gen/day per (IP OR device)
//   - Pro  = 50 gen/day per email (set by Creem webhook into pro:<email>)
//   - High-freq guard = 5 req/min per IP (applies to everyone)
// NOTE: Turnstile human verification is DISABLED. Any failure returns readable JSON — never a bare 502.

import { getPrompt, normalizeWordCount, lengthTokens } from './prompts.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const PRO_DAILY = 50;        // Pro generations per day, per email
const FREQ_PER_MIN = 5;      // max requests per minute per IP (anti-abuse)
const FREE_DAILY = 1;        // free generations per day per (IP OR device) — production value

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...headers },
  });
}

function utcDay() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}
function utcMinute() {
  return new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM (UTC minute bucket)
}
function secondsToUtcMidnight() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return Math.max(1, Math.floor((midnight - now) / 1000));
}

// Safe KV helpers — never throw. If KV is unbound/misconfigured, generation still proceeds.
async function kvGet(kv, key) {
  if (!kv) return null;
  try { return await kv.get(key); } catch (e) { console.error('KV get failed:', String(e)); return null; }
}
async function kvPut(kv, key, value, ttl) {
  if (!kv) return;
  try { await kv.put(key, value, { expirationTtl: ttl }); } catch (e) { console.error('KV put failed:', String(e)); }
}

async function callDashScope(systemPrompt, topic, env, maxTokens) {
  const base = env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  if (!env.DASHSCOPE_API_KEY) {
    throw new Error('Missing DASHSCOPE_API_KEY secret. Set it in Worker -> Settings -> Variables -> Secrets.');
  }
  let r;
  try {
    r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.DASHSCOPE_MODEL || 'qwen-plus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: topic },
        ],
        temperature: 0.85,
        max_tokens: maxTokens,
      }),
    });
  } catch (e) {
    throw new Error(`Network error reaching DashScope (${base}): ${String(e)}`);
  }
  const raw = await r.text();
  if (!r.ok) {
    throw new Error(`DashScope HTTP ${r.status}: ${raw.slice(0, 600)}`);
  }
  let j;
  try { j = JSON.parse(raw); } catch { throw new Error(`DashScope returned non-JSON body: ${raw.slice(0, 600)}`); }
  const content = j?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`DashScope returned no choices/content. Body: ${raw.slice(0, 600)}`);
  }
  return content.trim();
}

// HMAC-SHA256 hex (Web Crypto) for Creem webhook signature verification.
async function hmacHex(key, data) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ---- Creem webhook: mark payer email as Pro ----
  if (path === '/api/creem-webhook') {
    const secret = env.CREEM_WEBHOOK_SECRET;
    let raw;
    if (secret) {
      raw = await request.clone().text();
      const sig = request.headers.get('x-creem-signature') || '';
      let expected = '';
      try { expected = await hmacHex(secret, raw); } catch { expected = ''; }
      // Creem may send "sha256=<hex>"; compare the hex part.
      const got = sig.includes('=') ? sig.slice(sig.indexOf('=') + 1) : sig;
      if (!sig || got !== expected) return json({ error: 'bad_signature' }, 401);
    } else {
      raw = await request.text();
    }
    let b;
    try { b = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
    const event = (b.event_type || b.type || b.event || '').toString();
    const obj = b.object || b.data || {};
    const custEmail =
      obj?.customer?.email || obj?.customer_email || obj?.metadata?.email ||
      b.customer?.email || '';
    const status = (obj?.status || b.status || '').toString();
    const isPaid = /completed|active|paid|success|trialing/i.test(event + ' ' + status);
    if (isPaid && custEmail && env.RATE_LIMIT) {
      const rec = { until: Date.now() + 366 * 86400000, plan: obj?.product?.id || '', ts: Date.now() };
      await kvPut(env.RATE_LIMIT, `pro:${custEmail.toLowerCase()}`, JSON.stringify(rec), 366 * 86400);
      return json({ ok: true, activated: custEmail }, 200);
    }
    return json({ ok: true, ignored: true }, 200);
  }

  // ---- Waitlist lead ----
  if (path === '/api/waitlist') {
    let b;
    try { b = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
    const email = String(b.email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'invalid_email' }, 400);
    await kvPut(env.RATE_LIMIT, `wl:${Date.now()}:${email}`, JSON.stringify({ email, ts: Date.now() }));
    return json({ ok: true, message: "You're on the list!" }, 200);
  }

  // ---- Generate ----
  if (path !== '/api/generate') return json({ error: 'not_found' }, 404);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const platforms = Array.isArray(body.platforms) ? body.platforms : (body.platform ? [body.platform] : []);
  const topic = (body.topic || '').toString().trim();
  if (!topic || platforms.length === 0) return json({ error: 'missing_topic_or_platform' }, 400);

  const ip = request.headers.get('cf-connecting-ip') || '';

  // 1) High-frequency guard (applies to Free AND Pro)
  const minute = utcMinute();
  const freqKey = `freq:${ip}:${minute}`;
  let freq = parseInt(await kvGet(env.RATE_LIMIT, freqKey)) || 0;
  if (freq >= FREQ_PER_MIN) {
    return json({ error: 'rate_limited', message: 'Too many requests. Please wait a minute and try again (max 5 per minute).', retry_after: 60 }, 429);
  }
  freq += 1;
  ctx.waitUntil(kvPut(env.RATE_LIMIT, freqKey, String(freq), 120));

  // 2) Pro status (email verified server-side by the Creem webhook)
  const email = (body.email || '').toString().trim().toLowerCase();
  let isPro = false;
  if (email && env.RATE_LIMIT) {
    const rec = await kvGet(env.RATE_LIMIT, `pro:${email}`);
    if (rec) {
      try { const o = JSON.parse(rec); if (!o.until || o.until > Date.now()) isPro = true; } catch {}
    }
  }

  // 3) Quota enforcement
  const day = utcDay();
  if (isPro) {
    const pk = `pro_rl:${email}:${day}`;
    let used = parseInt(await kvGet(env.RATE_LIMIT, pk)) || 0;
    if (used >= PRO_DAILY) {
      return json(
        { error: 'pro_quota_used', message: `Pro daily limit reached (${PRO_DAILY}/day). It resets at 00:00 UTC.`, retry_after: secondsToUtcMidnight() },
        429
      );
    }
    ctx.waitUntil(kvPut(env.RATE_LIMIT, pk, String(used + 1), secondsToUtcMidnight() + 60));
  } else {
    const ipKey = `rl:${day}:ip:${ip}`;
    const devKey = `rl:${day}:dev:${body.uuid || 'anon'}`;
    const [ipRaw, devRaw] = await Promise.all([
      kvGet(env.RATE_LIMIT, ipKey),
      kvGet(env.RATE_LIMIT, devKey),
    ]);
    const ipUsed = parseInt(ipRaw) || 0;
    const devUsed = parseInt(devRaw) || 0;
    const freeUsed = Math.max(ipUsed, devUsed);
    if (freeUsed >= FREE_DAILY) {
      return json(
        { error: 'free_quota_used', message: `Daily free limit reached (${FREE_DAILY}/day). Please upgrade to Pro.`, retry_after: secondsToUtcMidnight() },
        429
      );
    }
    const ttl = secondsToUtcMidnight() + 60;
    ctx.waitUntil(Promise.all([
      kvPut(env.RATE_LIMIT, ipKey, String(ipUsed + 1), ttl),
      kvPut(env.RATE_LIMIT, devKey, String(devUsed + 1), ttl),
    ]));
  }

  // 4) Call DashScope (Bailian) once per platform, in requested order
  const boundedInt = (v, fallback, min, max) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const opts = {
    language: body.outputLanguage === 'zh' ? 'Chinese' : 'English',
    style: String(body.style || 'lively').slice(0, 40),
    tone: boundedInt(body.tone, 5, 0, 10),
    wordCount: boundedInt(body.wordCount, 180, 50, 500),
  };
  const parts = [];
  try {
    for (const p of platforms) {
      const maxTokens = lengthTokens(normalizeWordCount(opts.wordCount, p));
      const text = await callDashScope(getPrompt(p, opts), topic, env, maxTokens);
      parts.push(text);
    }
  } catch (e) {
    return json({ error: 'generation_failed', detail: String(e) }, 502);
  }

  const text = parts.join('\n\n---\n\n');
  return json({ text, plan: isPro ? 'pro' : 'free' }, 200);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx);
    } catch (err) {
      // Safety net: never a bare Cloudflare 502. Always emit a readable JSON error.
      return json({ error: 'worker_exception', detail: String((err && err.stack) || err) }, 500);
    }
  },
};

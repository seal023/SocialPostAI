# SocialPostAI Pro — Web front-end (static)

Mobile-first static site: 5-platform AI copy generator, compliance pages, waitlist.
No build step. Deploys to Vercel as static files. No API key lives in the frontend —
generation is proxied through the Cloudflare Worker (`api.socialpostai.app`).

## Files
- `index.html` — generator (card UI)
- `styles.css` — pink/gradient theme, responsive (max 520px)
- `app.js` — platform select, generate (→ Worker `/api/generate`), daily-1 limit, waitlist modal
- `privacy.html` / `terms.html` / `refund.html` / `contact.html` — compliance (footer-linked)
- `favicon.svg`, `vercel.json`

## Deploy to Vercel (needs VERCEL_TOKEN)

```bash
cd web-app
npx vercel deploy --prod --token "$VERCEL_TOKEN" --yes
# then add the domain:
npx vercel domains add socialpostai.app --token "$VERCEL_TOKEN"
npx vercel domains add www.socialpostai.app --token "$VERCEL_TOKEN"
```

Or connect the repo in the Vercel dashboard and import this `web-app` folder as the
project root (Framework: "Other", Output: ".", Build: none).

## DNS checklist (Cloudflare)
- `www` CNAME → `cname.vercel-dns.com` ✅ (you already set this)
- `socialpostai.app` (apex) → A record(s) / ALIAS → `76.76.21.21`  ← still needed for https://socialpostai.app
- TTL 300s, SSL mode "Full (strict)"

## Required secrets (for real generation, NOT for Creem re-review)
- **Bailian API key** → set in the Cloudflare Worker via `wrangler secret put BAILIAN_API_KEY`
  (key stays server-side; frontend never sees it).
- **Vercel token** → only to push the site live.

## Notes
- Free tier = 1 generation/day (enforced client-side + Worker-side).
- Waitlist emails: captured to `localStorage` as fallback; for server-side capture, add a
  `/api/waitlist` route to the Worker writing to KV (see worker/).
- Generation shows a friendly "service warming up" message until the Worker + key are live.
  This is fine for the Creem re-review, which only needs the site reachable + compliant.

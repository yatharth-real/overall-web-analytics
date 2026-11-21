# Web Analytics Bento — Design Spec

## Goal
Build a from-scratch Next.js app where a user signs in with OpenAI (ChatGPT plan), enters a website URL, and sees a working analytics dashboard rendered by an unchanged React bento component. No mock data.

## Scope
- New project directory only (`web-analytics-bento/`). No pre-existing project reused.
- Next.js App Router + TypeScript + Tailwind CSS + shadcn structure (`components.json`, `@/` alias, `src/components/ui/`).
- `AnalyticsBento` copied verbatim into `src/components/ui/analytics-bento.tsx`. CSS, animations, tooltips, SVGs and layout untouched; only label/data props change.
- Only artifact taken from `thursday-agent` is the OpenAI/ChatGPT sign-in *flow* (OAuth client id, authorize/token URLs, PKCE, loopback callback). It is reimplemented minimally. No other file from that project is copied.

## Flow
1. `/` — sign-in screen with a single "Sign in with OpenAI" button.
2. `/analyze` — URL entry: one instruction text, one input, one Analyze button. Styled using only the bento card surface, border radius, gradient accents, and pixel-dot background. No extra header/tagline copy.
3. `/dashboard` — the real analytics bento.

## OpenAI sign-in
- Server route starts OAuth: `client_id=app_EMoamEEZ73f0CkXaXp7hrann`, authorize `https://auth.openai.com/oauth/authorize`, token `https://auth.openai.com/oauth/token`, PKCE S256, state, redirect `http://localhost:1455/auth/callback`, scope `openid profile email offline_access`.
- A Node HTTP listener on 127.0.0.1 / ::1 port 1455 waits for the callback, exchanges the code, parses JWT claims (`chatgpt_account_id`, `chatgpt_plan_type`, `exp`) and stores `{access, refresh, expires, accountId, plan}` in a server-only file.
- Refresh token flow used when the access token nears expiry. Tokens never sent to the browser.
- AI requests use the ChatGPT/Codex backend Responses API with the stored tokens and the `OpenAI-Beta: responses=experimental` header. AI supplies insight/recommendation text only; if AI is unavailable, deterministic analytics still render.

## Deterministic analyzer ("definitely not AI")
- Server-side fetch of the entered URL with a browser-like UA, timeout and redirect following.
- Measured: repeated response-time samples, status, redirect count, content length, title, meta description, canonical, viewport, language, headings, links (internal/external), images (with/without alt), scripts, stylesheets, forms, iframes.
- Derived scores (0–100): SEO, structure, media, security, performance, content, accessibility basics, metadata, links, mobile.
- No invented numbers. If a URL cannot be fetched, show a real error state.

## Bento data mapping
- Revenue card → measured response-time series (ms); value = latest/median, delta computed from samples.
- Sessions card → measured desktop vs mobile UA series from real fetches.
- Categories card → real page-composition counts grouped deterministically; resource table from real discovered URLs/sizes.
- Seasonality card → real computed scores on the radar; stats/rows from measured facts.

## Out of scope
- Traffic history from GA/Similarweb (no credentials available).
- Extra marketing copy or header lines outside the component.
- Reusing any other code from thursday-agent.

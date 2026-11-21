# Installation & Run

Exact steps for an agent installing this app from scratch.

## Prerequisites

- Node.js + npm (project was built with Next.js 16.4.6 / React 19.3.0).
- Free local ports **3000** (web) and **1455** (OAuth callback).
- Pop-ups enabled in the browser.
- A ChatGPT/OpenAI account for sign-in. No API key, `.env`, or manual token is needed.
- ~1 GB free disk space for `node_modules`.

## Install

```bash
cd web-analytics-bento          # or web-analytics-bento-clean
npm ci                          # or: npm install
```

Do **not** delete `.npmrc`: it sets `legacy-peer-deps=true`, without which install fails with `ERESOLVE unable to resolve dependency tree`.

## Run (development)

```bash
npm run dev
```

Open **http://localhost:3000**.

## First-run flow

1. Click **Sign in with OpenAI**.
2. A popup opens `auth.openai.com`. Log in with your ChatGPT account.
3. The callback hits `http://localhost:1455/auth/callback`. The popup closes and the app redirects to `/analyze`.
4. The server writes the token to `.data/openai-signin.json` automatically. Never create or edit this file.
5. Enter a website URL and click **Analyze**. The dashboard renders at `/dashboard`.

Subsequent runs skip step 1–3 while the token file exists.

## Run (production)

```bash
npm run build
npm run start
```

## Verification

```bash
npx tsc --noEmit     # typecheck
npm run lint         # eslint
npm run build        # full production build
```

Quick smoke test:

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com"}'
```

The response must contain a `bento` object and `meta.insightSource`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ERESOLVE unable to resolve dependency tree` | Restore `.npmrc` (`legacy-peer-deps=true`), then reinstall |
| `ENOSPC: no space left on device` | Free disk space, then reinstall |
| Sign-in never completes | Port 1455 must be free; allow pop-ups; finish any pending sign-in and retry |
| `Port 1455 is in use` | Stop the process holding 1455 or wait for the previous flow to time out (10 min) |
| Build fails: `Route segment config "runtime" is not compatible with nextConfig.cacheComponents` | Do not add `export const runtime = "nodejs"` to API routes |
| Dashboard empty / no SUMMARY card | Re-run Analyze; `/dashboard` uses cached `sessionStorage` from the previous analysis. Summary is at the bottom, below "Site signals" |
| `insightSource: "deterministic"` | AI text unavailable (common on free ChatGPT plans). Analytics still work; all numbers are measured, not AI-generated |

## Security / GitHub

- `.data/` is gitignored. Never commit `openai-signin.json` or any token.
- `node_modules/`, `.next/`, `.env*`, `*.tsbuildinfo`, and `next-env.d.ts` are generated/ignored — do not commit them.
- The `web-analytics-bento-clean` copy has no token and starts signed out; sign-in creates one on first use.
- There are no tests in this repo; use the verification commands above.

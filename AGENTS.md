<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Commands

- `npm run dev` (localhost:3000), `npm run build`, `npm run lint`, `npm run start`.
- No tests or test script. Typecheck with `npx tsc --noEmit`.
- `.npmrc` sets `legacy-peer-deps=true` — required for installs; don't remove it.

## Gotchas

- `next.config.ts` has `cacheComponents: true`: API routes must not export `runtime = "nodejs"` (Turbopack build error: "Route segment config 'runtime' is not compatible with nextConfig.cacheComponents").
- OAuth sign-in needs loopback port 1455 free; tokens live only in `.data/openai-signin.json` (gitignored), never in the browser.

## Flow and data rules

- Routes: `/` sign-in → `/analyze` URL form → `/dashboard` bento. `/api/analyze` returns bento props that `/analyze` saves to `sessionStorage` key `bento-analysis`; `/dashboard` reads that key. No server-side analysis state.
- All displayed numbers come from real fetches in `src/lib/analyzer.ts` (timed samples, desktop/mobile, discovered resources; `maxDuration=180` on the route). Never add mock/sample data or hardcoded metrics.
- `src/lib/ai.ts` only writes insight text through the signed-in ChatGPT/Codex backend, with deterministic fallback — the dashboard must render without AI.
- `src/components/ui/analytics-bento.tsx`: leave CSS, layout, animations, SVGs, tooltips untouched; change only data/label props. No extra copy outside the bento.
- Only the OpenAI sign-in flow was reimplemented from `thursday-agent`; don't bring in other code from it.

Details: `docs/superpowers/specs/2026-11-20-web-analytics-bento-design.md` and `docs/superpowers/plans/2026-11-20-web-analytics-bento-plan.md`.

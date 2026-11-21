# Web Analytics Bento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js app that gates on OpenAI sign-in, takes a URL, and renders a real-data analytics bento.

**Architecture:** App Router with three routes. Sign-in uses a server-only OAuth flow (PKCE + loopback 1455) reimplemented from thursday-agent's `startChatGptSignIn`. A deterministic analyzer fetches the URL and measures real metrics; an AI route enriches notes via the signed-in ChatGPT plan. The unchanged bento component consumes derived props.

**Tech Stack:** Next.js (App Router, TypeScript, Tailwind), shadcn CSS tokens, no chart library, no image assets.

---

## File structure

- `src/components/ui/analytics-bento.tsx` — verbatim component from the prompt.
- `src/app/globals.css` — Tailwind + shadcn theme tokens + bento pixel background.
- `src/lib/openai-auth.ts` — server-only OAuth start/callback/refresh + token file store.
- `src/lib/analyzer.ts` — deterministic URL fetch + measurement + scoring.
- `src/lib/ai.ts` — ChatGPT-plan Responses call for insight text.
- `src/lib/bento-data.ts` — maps analysis + AI text into bento props.
- `src/app/api/auth/start/route.ts` — starts sign-in, returns authorize URL.
- `src/app/api/auth/status/route.ts` — reports signed-in plan/account, clears session.
- `src/app/api/analyze/route.ts` — accepts URL, runs analyzer + AI, returns bento props.
- `src/app/page.tsx` — sign-in screen.
- `src/app/analyze/page.tsx` — URL entry card.
- `src/app/dashboard/page.tsx` — renders `AnalyticsBento` with session-stored result.

## Tasks

### Task 1: Scaffold project
- [ ] Create Next.js app in `web-analytics-bento/` with TS, Tailwind, App Router, `@/*` alias.
- [ ] Run shadcn init so `components.json`, `src/components/ui`, `src/lib/utils.ts` and theme tokens exist.
- [ ] Verify dev server starts on localhost:3000.

### Task 2: Add bento component
- [ ] Copy `analytics-bento.tsx` exactly as provided into `src/components/ui/`.
- [ ] Confirm build passes (no missing imports).

### Task 3: OpenAI sign-in
- [ ] Implement `src/lib/openai-auth.ts` with the OAuth constants, PKCE, loopback callback, token store, refresh and status helpers.
- [ ] Add `/api/auth/start` and `/api/auth/status` routes.
- [ ] Build sign-in screen with one button and polling for completion.

### Task 4: Deterministic analyzer
- [ ] Implement `src/lib/analyzer.ts`: validate URL, repeated timed fetches, desktop/mobile UA fetch, HTML parse with regex counters, scores, resource list.
- [ ] Ensure all values are measured; throw real errors on unreachable hosts.

### Task 5: AI enrichment
- [ ] Implement `src/lib/ai.ts` using stored tokens against the Codex Responses endpoint; degrade gracefully to deterministic notes.

### Task 6: Data mapping + API
- [ ] Implement `src/lib/bento-data.ts` to build the exact `AnalyticsBentoProps` shapes from analysis.
- [ ] Add `/api/analyze` route with input validation and error responses.

### Task 7: Screens
- [ ] Build URL entry card using bento surface styles (card, border, rounded-[28px], pixel background).
- [ ] Build dashboard screen rendering `AnalyticsBento`; store the last result in `sessionStorage` so no backend state is needed.

### Task 8: Verify end to end
- [ ] Run `npm run build` and fix type errors.
- [ ] Start dev server on localhost and smoke-test the flow with a reachable URL.

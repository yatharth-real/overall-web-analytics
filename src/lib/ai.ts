import "server-only";

import { CODEX_URL, currentAccessToken, readSignIn } from "@/lib/openai-auth";
import type { Analysis } from "@/lib/analyzer";

/**
 * AI insight layer. Uses the signed-in ChatGPT plan through the Codex backend.
 * If the plan cannot answer, callers still get deterministic text derived from
 * the real measurements — the dashboard never depends on AI being available.
 */

export type Insights = {
  headline: string;
  summary: string;
  actions: string;
  source: "ai" | "deterministic";
};

const MODELS = ["gpt-5.2-codex", "gpt-5.1-codex", "gpt-5-codex"];

function fallback(analysis: Analysis): Insights {
  const entries = Object.entries(analysis.scores) as [string, number][];
  const weakest = [...entries].sort((a, b) => a[1] - b[1])[0];
  const strongest = [...entries].sort((a, b) => b[1] - a[1])[0];
  return {
    headline: `${strongest[0]} leads at ${strongest[1]}/100; ${weakest[0]} trails at ${weakest[1]}/100`,
    summary: `${analysis.counts.internalLinks} internal links, ${analysis.counts.images} images and ${analysis.counts.scripts} scripts measured on the live document.`,
    actions: `Improve ${weakest[0]} first.`,
    source: "deterministic",
  };
}

function textFromOutput(payload: unknown): string {
  const root = payload as {
    output?: { content?: { type?: string; text?: string }[]; text?: string }[];
  };
  const parts: string[] = [];
  for (const item of root?.output ?? []) {
    if (typeof item?.text === "string") parts.push(item.text);
    for (const part of item?.content ?? []) {
      if (typeof part?.text === "string") parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}

function textFromSse(raw: string): string {
  const parts: string[] = [];
  for (const block of raw.replaceAll("\r\n", "\n").split("\n\n")) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data) as {
        type?: string;
        item?: { content?: { type?: string; text?: string }[] };
        response?: { output?: { content?: { type?: string; text?: string }[] }[] };
      };
      const items = event.type === "response.output_item.done"
        ? [event.item].filter(Boolean)
        : (event.response?.output ?? []);
      for (const item of items) {
        for (const part of item?.content ?? []) {
          if (typeof part?.text === "string") parts.push(part.text);
        }
      }
    } catch {
      /* ignore non-JSON frames */
    }
  }
  return parts.join("\n").trim();
}

async function askModel(model: string, token: string, accountId: string, compact: unknown) {
  const response = await fetch(`${CODEX_URL}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "chatgpt-account-id": accountId,
      originator: "codex",
      "OpenAI-Beta": "responses=experimental",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      model,
      store: false,
      stream: false,
      max_output_tokens: 500,
      instructions:
        "You write concise web-analytics insight copy. Return exactly three short lines, nothing else: " +
        "LINE 1 starts 'Headline: ' with one finding. " +
        "LINE 2 starts 'Summary: ' with one sentence about the measured page. " +
        "LINE 3 starts 'Action: ' with one concrete recommendation. " +
        "Use only the supplied measured data. Never invent numbers.",
      input: JSON.stringify(compact),
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`${model}: HTTP ${response.status}`);
  const text = response.headers.get("content-type")?.includes("event-stream")
    ? textFromSse(raw)
    : textFromOutput(JSON.parse(raw));
  return text;
}

function parseInsightText(text: string): Insights | null {
  const line = (key: string) =>
    text.split("\n").find((l) => l.toLowerCase().startsWith(key.toLowerCase()))?.slice(key.length).trim();
  const headline = line("Headline:");
  const summary = line("Summary:");
  const actions = line("Action:");
  if (!headline && !summary && !actions) return null;
  return {
    headline: headline ?? "",
    summary: summary ?? "",
    actions: actions ?? "",
    source: "ai",
  };
}

export async function getInsights(analysis: Analysis): Promise<Insights> {
  const fallbackInsights = fallback(analysis);
  try {
    const token = await currentAccessToken();
    const signIn = await readSignIn();
    if (!token || !signIn) return fallbackInsights;

    const compact = {
      url: analysis.url,
      status: analysis.status,
      fetchedAt: analysis.fetchedAt,
      responseMs: analysis.samples,
      desktopMs: analysis.desktop,
      mobileMs: analysis.mobile,
      htmlBytes: analysis.htmlBytes,
      textBytes: analysis.textBytes,
      title: analysis.meta.title,
      description: analysis.meta.description,
      counts: analysis.counts,
      scores: analysis.scores,
      headers: analysis.headers,
      resources: analysis.resources,
    };

    for (const model of MODELS) {
      try {
        const text = await askModel(model, token, signIn.accountId, compact);
        const parsed = parseInsightText(text);
        if (parsed) return parsed;
      } catch {
        /* try the next available plan model */
      }
    }
  } catch {
    /* deterministic insights stay in place */
  }
  return fallbackInsights;
}

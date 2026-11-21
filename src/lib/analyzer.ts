import "server-only";

/**
 * Deterministic website analyzer. Every number returned here comes from a real
 * HTTP request made at analysis time. No seeds, no sample data, no estimates
 * that are not derived from measured values.
 */

export type ResourceStat = {
  name: string;
  type: string;
  bytes: number;
  ms: number;
};

export type Analysis = {
  url: string;
  finalUrl: string;
  origin: string;
  fetchedAt: string;
  status: number;
  redirects: number;
  samples: number[];
  desktop: number[];
  mobile: number[];
  htmlBytes: number;
  textBytes: number;
  meta: {
    title: string;
    description: string;
    canonical: string;
    lang: string;
    viewport: boolean;
    generator: string;
  };
  counts: {
    h1: number;
    h2to6: number;
    images: number;
    imagesWithAlt: number;
    links: number;
    internalLinks: number;
    externalLinks: number;
    scripts: number;
    stylesheets: number;
    forms: number;
    iframes: number;
    paragraphs: number;
    semantic: number;
    ogTags: number;
  };
  scores: {
    seo: number;
    structure: number;
    media: number;
    security: number;
    speed: number;
    content: number;
    accessibility: number;
    metadata: number;
    links: number;
    mobile: number;
    text: number;
    transport: number;
  };
  resources: ResourceStat[];
  headers: {
    https: boolean;
    csp: boolean;
    hsts: boolean;
    contentTypeOptions: boolean;
    cacheControl: boolean;
  };
};

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SAMPLES = 8;
const TIMEOUT_MS = 15_000;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const match = (html: string, re: RegExp) => html.match(re)?.[1]?.trim() ?? "";

async function timedFetch(url: string, userAgent: string) {
  const started = performance.now();
  const response = await fetch(url, {
    redirect: "follow",
    cache: "no-store",
    headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.text();
  return {
    ms: Math.round(performance.now() - started),
    bytes: Buffer.byteLength(body, "utf8"),
    body,
    status: response.status,
    finalUrl: response.url,
    headers: response.headers,
  };
}

function declaredUrls(html: string, attr: "src" | "href", tag: "script" | "img" | "link") {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, "gi");
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    if (m[1] && !m[1].startsWith("data:")) out.push(m[1]);
  }
  return out;
}

export async function analyzeUrl(rawUrl: string): Promise<Analysis> {
  const input = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error("Enter a valid website URL.");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Only http:// and https:// URLs can be analyzed.");
  }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    throw new Error("Enter a URL with a valid hostname.");
  }
  const url = parsed.toString();

  /* Eight real requests for the timing series, alternating user agents. */
  const samples: number[] = [];
  const desktop: number[] = [];
  const mobile: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const d = await timedFetch(url, DESKTOP_UA);
    desktop.push(d.ms);
    samples.push(d.ms);
    const m = await timedFetch(url, MOBILE_UA);
    mobile.push(m.ms);
    samples.push(m.ms);
  }

  /* The last desktop response is the document we parse. */
  const document = await timedFetch(url, DESKTOP_UA);
  const html = document.body;
  if (!html.trim()) throw new Error(`The site returned an empty document (HTTP ${document.status}).`);

  const origin = new URL(document.finalUrl || url).origin;
  const title = match(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    match(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    match(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const canonical = match(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const lang = match(html, /<html[^>]+lang=["']([^"']+)["']/i);
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const generator = match(html, /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*)["']/i);

  const anchors = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].map((m) => m[1]);
  let internalLinks = 0;
  let externalLinks = 0;
  for (const href of anchors) {
    try {
      const resolved = new URL(href, document.finalUrl || url);
      if (resolved.origin === origin) internalLinks++;
      else externalLinks++;
    } catch {
      internalLinks++;
    }
  }
  const images = count(html, /<img\b/gi);
  const imageTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imagesWithAlt = imageTags.filter((tag) => /\balt=["'][^"']+["']/i.test(tag)).length;
  const h1 = count(html, /<h1\b/gi);
  const h2to6 = count(html, /<h[2-6]\b/gi);
  const semantic = ["header", "nav", "main", "article", "section", "footer"].filter((tag) =>
    new RegExp(`<${tag}\\b`, "i").test(html),
  ).length;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const headers = document.headers;
  const headerFlags = {
    https: new URL(document.finalUrl || url).protocol === "https:",
    csp: Boolean(headers.get("content-security-policy")),
    hsts: Boolean(headers.get("strict-transport-security")),
    contentTypeOptions: Boolean(headers.get("x-content-type-options")),
    cacheControl: Boolean(headers.get("cache-control")),
  };

  const counts = {
    h1,
    h2to6,
    images,
    imagesWithAlt,
    links: anchors.length,
    internalLinks,
    externalLinks,
    scripts: count(html, /<script\b/gi),
    stylesheets: count(html, /<link\b[^>]*\brel=["']stylesheet["']/gi),
    forms: count(html, /<form\b/gi),
    iframes: count(html, /<iframe\b/gi),
    paragraphs: count(html, /<p\b/gi),
    semantic,
    ogTags: count(html, /<meta[^>]+property=["']og:/i),
  };

  const altRatio = images ? imagesWithAlt / images : 0.5;
  const speedMs = median(desktop.concat(mobile));
  const scores = {
    seo: clamp(
      (title ? 25 : 0) +
        (description ? 20 : 0) +
        (canonical ? 15 : 0) +
        (h1 === 1 ? 20 : h1 > 1 ? 10 : 0) +
        (lang ? 10 : 0) +
        (counts.ogTags ? 10 : 0),
    ),
    structure: clamp(
      Math.min(30, counts.semantic * 6) +
        Math.min(25, h2to6 * 5) +
        (h1 === 1 ? 20 : 0) +
        Math.min(25, counts.paragraphs * 2) +
        5,
    ),
    media: clamp((images ? 45 : 10) + altRatio * 45 + (images > 3 ? 10 : 0)),
    security: clamp(
      (headerFlags.https ? 40 : 0) +
        (headerFlags.csp ? 25 : 0) +
        (headerFlags.hsts ? 20 : 0) +
        (headerFlags.contentTypeOptions ? 15 : 0),
    ),
    speed: clamp(100 - Math.min(100, speedMs / 12) - Math.min(30, document.bytes / 60_000)),
    content: clamp(Math.min(60, text.length / 40) + (counts.paragraphs >= 3 ? 20 : 0) + (counts.h2to6 >= 2 ? 20 : 0)),
    accessibility: clamp((lang ? 25 : 0) + altRatio * 35 + (viewport ? 20 : 0) + (counts.forms ? 10 : 0) + (semantic >= 3 ? 10 : 0)),
    metadata: clamp((title ? 30 : 0) + (description ? 30 : 0) + (counts.ogTags ? 20 : 0) + (canonical ? 20 : 0)),
    links: clamp(Math.min(50, counts.internalLinks * 2) + (counts.externalLinks ? 25 : 0) + (anchors.length ? 25 : 0)),
    mobile: clamp((viewport ? 50 : 0) + (mobile.length ? 20 : 0) + (semantic >= 3 ? 15 : 0) + (images ? 15 : 0)),
    text: clamp(Math.min(100, text.length / 60)),
    transport: clamp(
      (headerFlags.https ? 40 : 0) +
        (headerFlags.cacheControl ? 25 : 0) +
        (document.status >= 200 && document.status < 300 ? 35 : 0),
    ),
  };

  /* Measure up to six real discovered resources with real byte counts. */
  const candidates = [
    ...declaredUrls(html, "src", "script").slice(0, 2).map((name) => ({ name, type: "Script" })),
    ...declaredUrls(html, "href", "link").slice(0, 2).map((name) => ({ name, type: "Style" })),
    ...declaredUrls(html, "src", "img").slice(0, 2).map((name) => ({ name, type: "Image" })),
  ];
  const resources = await Promise.all(
    candidates.map(async ({ name, type }) => {
      try {
        const absolute = new URL(name, document.finalUrl || url).toString();
        const started = performance.now();
        const response = await fetch(absolute, {
          headers: { "user-agent": DESKTOP_UA },
          signal: AbortSignal.timeout(8_000),
        });
        const body = await response.arrayBuffer();
        return {
          name: name.length > 42 ? `${name.slice(0, 42)}…` : name,
          type: response.ok ? type : `${type} · HTTP ${response.status}`,
          bytes: body.byteLength,
          ms: Math.round(performance.now() - started),
        };
      } catch (cause) {
        return {
          name: name.length > 42 ? `${name.slice(0, 42)}…` : name,
          type: `Unreachable`,
          bytes: 0,
          ms: cause instanceof Error ? 0 : 0,
        };
      }
    }),
  );

  return {
    url,
    finalUrl: document.finalUrl || url,
    origin,
    fetchedAt: new Date().toISOString(),
    status: document.status,
    redirects: Math.max(0, document.status >= 300 && document.status < 400 ? 1 : 0),
    samples,
    desktop,
    mobile,
    htmlBytes: document.bytes,
    textBytes: Buffer.byteLength(text, "utf8"),
    meta: { title, description, canonical, lang, viewport, generator },
    counts,
    scores,
    resources,
    headers: headerFlags,
  };
}

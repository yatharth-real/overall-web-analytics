import type { Analysis } from "@/lib/analyzer";
import type { Insights } from "@/lib/ai";

/** Plain-serializable shape that maps one-to-one onto AnalyticsBentoProps. */
export type BentoData = {
  currency: string;
  summary: string;
  revenue: {
    label: string;
    value: number;
    delta: string;
    note: string;
    caption: string;
    series: { label: string; value: number }[];
  };
  sessions: {
    label: string;
    value: number;
    delta: string;
    note: string;
    desktop: number[][];
    mobile: number[][];
    labels: { desktop: string; mobile: string; prior: string; current: string };
  };
  categories: {
    title: string;
    groups: { id: string; name: string; color: string; ink?: "dark" | "light" }[];
    periods: { label: string; total: number; delta: string; compare: string }[];
    items: { name: string; group: string; values: number[] }[];
    table: { columns: string[]; rows: { label: string; values: string[] }[] };
  };
  seasonality: {
    title: string;
    axis: string[];
    years: {
      label: string;
      values: number[];
      stats: { label: string; value: number; delta: string; note: string }[];
      rows: { label: string; value: string }[];
    }[];
  };
};

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const pct = (from: number, to: number) =>
  from ? (Math.abs(to - from) / from) * 100 : 0;
const short = (text: string, max = 160) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
};

export function buildBentoData(analysis: Analysis, insights: Insights): BentoData {
  const { counts, scores, samples, desktop, mobile, resources, meta } = analysis;
  const responseMs = median(samples);
  const resourceBytes = resources.reduce((sum, r) => sum + r.bytes, 0);
  const bytesFor = (type: string) =>
    resources.filter((r) => r.type === type).reduce((sum, r) => sum + r.bytes, 0);
  const resourcesFor = (type: string) => resources.filter((r) => r.type === type).length;

  const composition = [
    { name: "Images", group: "media", count: counts.images, type: "Image" },
    { name: "Scripts", group: "code", count: counts.scripts, type: "Script" },
    { name: "Styles", group: "code", count: counts.stylesheets, type: "Style" },
    { name: "Headings", group: "structure", count: counts.h1 + counts.h2to6, type: "" },
    { name: "Links", group: "discovery", count: counts.links, type: "" },
    { name: "Forms", group: "other", count: counts.forms, type: "" },
    { name: "Meta tags", group: "discovery", count: counts.ogTags + (meta.title ? 1 : 0) + (meta.description ? 1 : 0), type: "" },
    { name: "Landmarks", group: "structure", count: counts.semantic, type: "" },
  ].map((item) => ({
    name: item.name,
    group: item.group,
    values: [
      Math.max(1, item.count),
      Math.max(1, item.type ? bytesFor(item.type) : 0),
      Math.max(1, item.type ? resourcesFor(item.type) : 0),
    ],
  }));

  const totals = composition.reduce(
    (acc, item) => acc.map((value, i) => value + item.values[i]),
    [0, 0, 0],
  );

  const scoreEntries = Object.entries(scores) as [string, number][];
  const strongest = [...scoreEntries].sort((a, b) => b[1] - a[1])[0];
  const overall = Math.round(scoreEntries.reduce((sum, [, value]) => sum + value, 0) / scoreEntries.length);

  return {
    currency: "",
    summary: short(insights.summary),
    revenue: {
      label: "Response time",
      value: Math.round(responseMs),
      delta: `${pct(samples[0] ?? responseMs, samples[samples.length - 1] ?? responseMs).toFixed(1)}%`,
      note: insights.headline || "Measured from repeated live requests.",
      caption: "Live requests · ms",
      series: samples.map((value, i) => ({ label: `Request ${i + 1}`, value })),
    },
    sessions: {
      label: "Load time by device",
      value: Math.round(median(desktop)),
      delta: `${pct(median(desktop), median(mobile)).toFixed(1)}%`,
      note: "Desktop and mobile user agents, same URL.",
      desktop: [desktop],
      mobile: [mobile],
      labels: {
        desktop: "Desktop UA",
        mobile: "Mobile UA",
        prior: "All samples",
        current: "this scan",
      },
    },
    categories: {
      title: "Page composition",
      groups: [
        { id: "media", name: "Media", color: "#7CFF5B", ink: "dark" },
        { id: "code", name: "Code", color: "#8B3DFF", ink: "light" },
        { id: "structure", name: "Structure", color: "#FFB800", ink: "dark" },
        { id: "discovery", name: "Discovery", color: "#FF5A1F", ink: "dark" },
        { id: "other", name: "Other", color: "color-mix(in oklab, var(--color-muted-foreground) 45%, var(--color-muted))" },
      ],
      periods: [
        {
          label: "Elements",
          total: totals[0],
          delta: `${counts.images}`,
          compare: "elements found in the document",
        },
        {
          label: "Bytes",
          total: totals[1] + analysis.htmlBytes,
          delta: `${Math.round(analysis.htmlBytes / 1024)}K`,
          compare: "HTML plus measured resources",
        },
        {
          label: "Resources",
          total: totals[2] + resources.length,
          delta: `${resources.length}`,
          compare: "external resources fetched",
        },
      ],
      items: composition,
      table: {
        columns: ["Resource", "Type", "Bytes", "Time"],
        rows: resources.map((resource) => ({
          label: resource.name,
          values: [resource.type, resource.bytes.toLocaleString("en-US"), `${resource.ms} ms`],
        })),
      },
    },
    seasonality: {
      title: "Site signals",
      axis: [
        "SEO",
        "Structure",
        "Media",
        "Security",
        "Speed",
        "Content",
        "A11y",
        "Metadata",
        "Links",
        "Mobile",
        "Text",
        "Transport",
      ],
      years: [
        {
          label: "This scan",
          values: scoreEntries.map(([, value]) => value),
          stats: [
            {
              label: "Overall score",
              value: overall,
              delta: `${strongest[1]}%`,
              note: strongest[0],
            },
            {
              label: "HTML size",
              value: analysis.htmlBytes,
              delta: `${analysis.status}`,
              note: "HTTP status",
            },
          ],
          rows: [
            { label: "Title", value: meta.title || "Missing" },
            { label: "Language", value: meta.lang || "Missing" },
            { label: "HTTPS", value: analysis.headers.https ? "Yes" : "No" },
            { label: "Text size", value: `${analysis.textBytes.toLocaleString("en-US")} B` },
            { label: "Resource bytes", value: `${resourceBytes.toLocaleString("en-US")} B` },
          ],
        },
      ],
    },
  };
}

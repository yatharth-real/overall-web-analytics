import { NextResponse } from "next/server";
import { analyzeUrl } from "@/lib/analyzer";
import { getInsights } from "@/lib/ai";
import { buildBentoData } from "@/lib/bento-data";

export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    if (typeof body?.url !== "string" || !body.url.trim()) {
      return NextResponse.json({ error: "Enter a website URL." }, { status: 400 });
    }

    const analysis = await analyzeUrl(body.url);
    const insights = await getInsights(analysis);

    return NextResponse.json(
      {
        bento: buildBentoData(analysis, insights),
        meta: {
          url: analysis.url,
          finalUrl: analysis.finalUrl,
          status: analysis.status,
          fetchedAt: analysis.fetchedAt,
          insightSource: insights.source,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Analysis failed." },
      { status: 400 },
    );
  }
}

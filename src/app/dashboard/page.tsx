"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import AnalyticsBento, { type AnalyticsBentoProps } from "@/components/ui/analytics-bento";
import type { BentoData } from "@/lib/bento-data";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = React.useState<BentoData | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = sessionStorage.getItem("bento-analysis");
      if (stored) setData(JSON.parse(stored) as BentoData);
    } catch {
      /* invalid stored data falls through to the empty state */
    }
    setReady(true);
  }, []);

  if (!ready) return <main className="min-h-full flex-1 bg-background" />;

  if (!data) {
    return (
      <main className="pixel-surface flex min-h-full flex-1 items-center justify-center bg-background px-4 py-8">
        <section className="w-full max-w-md rounded-[28px] border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
          <p className="text-[13px] text-muted-foreground">No analysis yet.</p>
          <Button
            type="button"
            onClick={() => router.push("/analyze")}
            className="mt-4 rounded-[14px] bg-gradient-to-r from-[#22D3EE] to-[#3c2cff] text-white hover:opacity-90"
          >
            Enter a URL
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="pixel-surface min-h-full flex-1 bg-background px-4 py-8 sm:px-6 sm:py-10">
      <AnalyticsBento
        {...(data as unknown as AnalyticsBentoProps)}
        className="mx-auto max-w-[1240px]"
        fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
        monoFamily="var(--font-geist-mono), ui-monospace, monospace"
      />
    </main>
  );
}

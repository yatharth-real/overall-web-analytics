"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function AnalyzePage() {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = (await response.json()) as {
        bento?: unknown;
        error?: string;
      };
      if (!response.ok || !result.bento) throw new Error(result.error ?? "Analysis failed.");
      sessionStorage.setItem("bento-analysis", JSON.stringify(result.bento));
      router.push("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed.");
      setBusy(false);
    }
  }

  return (
    <main className="pixel-surface flex min-h-full flex-1 items-center justify-center bg-background px-4 py-8">
      <form
        onSubmit={submit}
        className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
      >
        <p className="text-[13px] tracking-[-0.01em] text-muted-foreground">
          Enter a website URL
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="example.com"
            aria-label="Website URL"
            className="h-10 min-w-0 flex-1 rounded-[14px] border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            disabled={busy}
            className="h-10 rounded-[14px] bg-gradient-to-r from-[#22D3EE] to-[#3c2cff] px-6 font-medium text-white hover:opacity-90"
          >
            {busy ? "Analyzing…" : "Analyze"}
          </Button>
        </div>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </form>
    </main>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function SignInPage() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: { signedIn?: boolean }) => {
        if (s.signedIn) router.replace("/analyze");
      })
      .catch(() => undefined);
  }, [router]);

  async function signIn() {
    setBusy(true);
    setMessage("");
    const popup = window.open("", "openai-signin", "popup,width=520,height=720");
    if (!popup) {
      setBusy(false);
      setMessage("Allow pop-ups for this page, then try again.");
      return;
    }
    try {
      const response = await fetch("/api/auth/start", { method: "POST" });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Could not start sign-in.");
      popup.location.href = result.url;

      const deadline = Date.now() + 10 * 60_000;
      const timer = window.setInterval(async () => {
        try {
          const status = (await (
            await fetch("/api/auth/status", { cache: "no-store" })
          ).json()) as { signedIn?: boolean };
          if (status.signedIn) {
            window.clearInterval(timer);
            router.replace("/analyze");
          }
        } catch {
          /* keep polling */
        }
        if (Date.now() > deadline || popup.closed) {
          window.clearInterval(timer);
          setBusy(false);
          setMessage("Sign-in did not finish. Try again.");
        }
      }, 1000);
    } catch (cause) {
      setBusy(false);
      setMessage(cause instanceof Error ? cause.message : "Could not start sign-in.");
    }
  }

  return (
    <main className="pixel-surface flex min-h-full flex-1 items-center justify-center bg-background px-4 py-8">
      <section className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
        <Button
          type="button"
          disabled={busy}
          onClick={signIn}
          className="w-full rounded-[14px] bg-gradient-to-r from-[#22D3EE] to-[#3c2cff] font-medium text-white hover:opacity-90"
        >
          Sign in with OpenAI
        </Button>
        {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
      </section>
    </main>
  );
}

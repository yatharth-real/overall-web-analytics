import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer, type RequestListener, type Server } from "node:http";
import path from "node:path";

/**
 * OpenAI sign-in for a ChatGPT plan, using the Codex CLI's public OAuth client.
 * Tokens stay on the server; the browser only sees "signed in / not signed in".
 */

export type SignIn = {
  access: string;
  refresh: string;
  expires: number;
  accountId: string;
  plan: string | null;
};

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const CALLBACK_PORT = 1455;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/auth/callback`;
const CALLBACK_HOSTS = ["127.0.0.1", "::1"];
const SCOPE = "openid profile email offline_access";
const ORIGINATOR = "codex";
const AUTH_CLAIM = "https://api.openai.com/auth";
const WAIT_MS = 10 * 60_000;
const RENEW_BEFORE_MS = 60_000;

export const CODEX_URL = "https://chatgpt.com/backend-api/codex";

const FILE = path.join(process.cwd(), ".data", "openai-signin.json");

type Pinned = {
  __waListeners?: Server[] | null;
  __waRenewal?: Promise<SignIn> | null;
};
const pinned = globalThis as Pinned;

/* ------------------------------ token store ----------------------------- */

export async function readSignIn(): Promise<SignIn | null> {
  try {
    const raw = await readFile(FILE, "utf8");
    const value = JSON.parse(raw) as SignIn;
    if (!value.access || !value.refresh || !value.accountId) return null;
    return value;
  } catch {
    return null;
  }
}

async function writeSignIn(value: SignIn): Promise<void> {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(value), { mode: 0o600 });
}

export async function clearSignIn(): Promise<void> {
  await unlink(FILE).catch(() => undefined);
}

export async function authStatus() {
  const signIn = await readSignIn();
  return {
    signedIn: Boolean(signIn),
    plan: signIn?.plan ?? null,
    accountId: signIn?.accountId ?? null,
  };
}

/* ------------------------------- helpers -------------------------------- */

function claimsOf(access: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(access.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const auth = (payload[AUTH_CLAIM] ?? {}) as Record<string, unknown>;
    return {
      accountId:
        typeof auth.chatgpt_account_id === "string" ? auth.chatgpt_account_id : null,
      plan:
        typeof auth.chatgpt_plan_type === "string" ? auth.chatgpt_plan_type : null,
      expires: typeof payload.exp === "number" ? payload.exp * 1000 : null,
    };
  } catch {
    return { accountId: null, plan: null, expires: null };
  }
}

async function requestToken(fields: Record<string, string>): Promise<SignIn> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...fields }),
  });
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string | { message?: string; code?: string };
    error_description?: string;
  } | null;

  if (!response.ok || !body?.access_token) {
    const error = body?.error;
    const said =
      typeof error === "string"
        ? [error, body?.error_description].filter(Boolean).join(": ")
        : (error?.message ?? error?.code ?? "");
    throw new Error(`OpenAI sign-in answered ${response.status}${said ? `: ${said}` : ""}`);
  }

  const access = body.access_token;
  const claims = claimsOf(access);
  const refresh = body.refresh_token ?? fields.refresh_token;
  if (!claims.accountId || !refresh) {
    throw new Error("OpenAI sign-in came back without an account");
  }
  return {
    access,
    refresh,
    expires:
      typeof body.expires_in === "number"
        ? Date.now() + body.expires_in * 1000
        : (claims.expires ?? Date.now()),
    accountId: claims.accountId,
    plan: claims.plan,
  };
}

/** The access token to send AI calls with; refreshes once when near expiry. */
export async function currentAccessToken(): Promise<string | null> {
  const stored = await readSignIn();
  if (!stored) return null;
  if (stored.expires - RENEW_BEFORE_MS > Date.now()) return stored.access;

  pinned.__waRenewal ??= (async () => {
    const latest = await readSignIn();
    if (!latest) throw new Error("Sign-in expired");
    if (latest.expires - RENEW_BEFORE_MS > Date.now()) return latest;
    const renewed = await requestToken({
      grant_type: "refresh_token",
      refresh_token: latest.refresh,
    });
    await writeSignIn(renewed);
    return renewed;
  })().finally(() => {
    pinned.__waRenewal = null;
  });

  return (await pinned.__waRenewal).access;
}

/* ------------------------------- OAuth ---------------------------------- */

function stopListening() {
  const servers = pinned.__waListeners;
  pinned.__waListeners = null;
  for (const server of servers ?? []) {
    server.close();
    server.closeIdleConnections();
  }
}

function callbackPage(title: string, detail: string, autoClose: boolean) {
  const safeTitle = title.replace(/[<>&]/g, "");
  const safeDetail = detail.replace(/[<>&]/g, "");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>body{background:#0b0b0c;color:#f5f5f5;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:420px;padding:32px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:#111113}
h1{font-size:18px;margin:0 0 8px}p{color:rgba(255,255,255,.6);margin:0}</style></head>
<body><main><h1>${safeTitle}</h1><p>${safeDetail}</p></main>
${autoClose ? "<script>setTimeout(()=>window.close(),1500)</script>" : ""}</body></html>`;
}

async function answerCallback(
  pathname: string,
  flow: { state: string; verifier: string },
): Promise<{ status: number; title: string; detail: string; last: boolean }> {
  const url = new URL(pathname, REDIRECT_URI);
  if (url.pathname !== "/auth/callback") {
    return { status: 404, title: "Not found", detail: "", last: false };
  }
  const error = url.searchParams.get("error");
  if (error) {
    return {
      status: 400,
      title: "Sign-in failed",
      detail: url.searchParams.get("error_description") ?? error,
      last: true,
    };
  }
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== flow.state) {
    return {
      status: 400,
      title: "Sign-in failed",
      detail: "This is not the sign-in that was started. Please try again.",
      last: false,
    };
  }
  try {
    const signIn = await requestToken({
      grant_type: "authorization_code",
      code,
      code_verifier: flow.verifier,
      redirect_uri: REDIRECT_URI,
    });
    await writeSignIn(signIn);
    return {
      status: 200,
      title: "Signed in to OpenAI",
      detail: "This window closes itself.",
      last: true,
    };
  } catch (cause) {
    return {
      status: 502,
      title: "Sign-in failed",
      detail: cause instanceof Error ? cause.message : String(cause),
      last: true,
    };
  }
}

/** Starts the flow and returns the URL to open. The callback is handled on port 1455. */
export async function startSignIn(): Promise<string> {
  stopListening();
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("hex");
  const flow = { state, verifier };
  const servers: Server[] = [];

  const listener: RequestListener = (request, response) => {
    void answerCallback(request.url ?? "/", flow).then((page) => {
      response.writeHead(page.status, { "content-type": "text/html; charset=utf-8" });
      response.end(callbackPage(page.title, page.detail, page.status === 200), () => {
        if (page.last && pinned.__waListeners === servers) stopListening();
      });
    });
  };

  for (const host of CALLBACK_HOSTS) {
    const server = createServer(listener);
    const failure = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      server.once("error", resolve);
      server.listen(CALLBACK_PORT, host, () => resolve(null));
    });
    if (!failure) {
      servers.push(server);
      continue;
    }
    if (failure.code === "EADDRNOTAVAIL" || failure.code === "EAFNOSUPPORT") continue;
    for (const bound of servers) bound.close();
    throw new Error(
      failure.code === "EADDRINUSE"
        ? `Port ${CALLBACK_PORT} is in use. Finish the pending sign-in, then try again.`
        : `Could not wait for sign-in: ${failure.message}`,
    );
  }

  pinned.__waListeners = servers;
  setTimeout(() => {
    if (pinned.__waListeners === servers) stopListening();
  }, WAIT_MS).unref();

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state,
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: ORIGINATOR,
  }).toString();
  return url.toString();
}

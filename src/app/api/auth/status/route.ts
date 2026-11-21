import { NextResponse } from "next/server";
import { authStatus, clearSignIn } from "@/lib/openai-auth";

export async function GET() {
  return NextResponse.json(await authStatus(), {
    headers: { "cache-control": "no-store" },
  });
}

export async function DELETE() {
  await clearSignIn();
  return NextResponse.json({ signedIn: false });
}

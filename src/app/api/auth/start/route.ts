import { NextResponse } from "next/server";
import { startSignIn } from "@/lib/openai-auth";

export async function POST() {
  try {
    const url = await startSignIn();
    return NextResponse.json({ url });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Could not start sign-in." },
      { status: 500 },
    );
  }
}

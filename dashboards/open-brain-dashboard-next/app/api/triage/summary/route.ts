import { NextResponse } from "next/server";
import { requireSession, AuthError } from "@/lib/auth";
import { fetchTriageSummary } from "@/lib/api";

// Session-gated proxy to open-brain-rest GET /triage/summary
// (untriaged tasks + ideas: total and per-source counts) for the
// TriageSummary home-page card. Mirrors app/api/kanban/route.ts.

export async function GET() {
  let apiKey: string;
  try {
    ({ apiKey } = await requireSession());
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const summary = await fetchTriageSummary(apiKey);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch triage summary",
      },
      { status: 500 }
    );
  }
}

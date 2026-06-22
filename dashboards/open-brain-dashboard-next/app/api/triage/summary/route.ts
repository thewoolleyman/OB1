import { NextResponse } from "next/server";
import { requireSession, AuthError } from "@/lib/auth";
import { fetchInboxSummary } from "@/lib/api";

// Session-gated proxy to open-brain-rest GET /inbox/summary
// (untriaged tasks + ideas, Gmail collapsed by thread: total and
// per-source counts) for the TriageSummary home-page card. Mirrors
// app/api/kanban/route.ts. Backend endpoint moved /triage/summary →
// /inbox/summary in openbrain li-pnfp6z; this Next.js proxy route path
// (/api/triage/summary) is internal and unchanged, so its caller
// (components/TriageSummary.tsx) needs no edit.

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
    const summary = await fetchInboxSummary(apiKey);
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

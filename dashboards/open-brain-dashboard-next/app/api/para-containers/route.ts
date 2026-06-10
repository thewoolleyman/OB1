import { NextResponse } from "next/server";
import { requireSession, AuthError } from "@/lib/auth";
import { fetchParaContainers } from "@/lib/api";

// ── GET — PARA-container autocomplete suggestions (AddTaskToBrain) ──────────
//
// Server-side proxy to open-brain-rest's GET /para-containers
// (openbrain li-azzzay). Authenticates upstream with the session's
// x-brain-key (never exposed to the client). The dashboard session is
// required so only the logged-in operator can reach the proxy.
// Mirrors app/api/kanban/route.ts shape. Returns
// { containers: [{ para_category, para_container, count }] } ordered
// count desc (most-used first) — ordering is upstream's job and is
// relayed verbatim.

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
    const containers = await fetchParaContainers(apiKey);
    return NextResponse.json({ containers });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch PARA containers",
      },
      { status: 500 }
    );
  }
}

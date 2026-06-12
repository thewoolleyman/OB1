import { NextResponse } from "next/server";
import { requireSession, AuthError } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { fetchKanbanThoughts } from "@/lib/api";

// Kanban data per openbrain spec.md § Dashboard "Kanban view":
// type = "task" rows only. gtd_status grouping (and the exclusion
// of untriaged / archived / unrecognized statuses) happens
// client-side in KanbanBoard / KanbanSummary.

export async function GET() {
  let apiKey: string;
  try {
    ({ apiKey } = await requireSession());
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const session = await getSession();
  const excludeRestricted = session.restrictedUnlocked !== true;

  try {
    const thoughts = await fetchKanbanThoughts(apiKey, {
      exclude_restricted: excludeRestricted,
    });
    return NextResponse.json({ thoughts });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch kanban data",
      },
      { status: 500 }
    );
  }
}

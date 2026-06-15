import { NextResponse } from "next/server";
import { requireSession, AuthError } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { fetchKanbanThoughts } from "@/lib/api";

// Kanban (Workflow) data per openbrain spec.md § Dashboard. The
// board consumes two row sets, merged by fetchKanbanThoughts:
//   - triaged `type=task` rows → the gtd_status columns
//     (Next … Done), grouped client-side in KanbanBoard /
//     KanbanSummary (archived / unrecognized handled there too);
//   - untriaged `task`/`idea` rows (gtd_triaged_at IS NULL) → the
//     leftmost universal-Inbox "Workflow triage lane". They carry
//     no gtd_status, so the column-grouping logic skips them; the
//     Inbox-lane UI selects them via getGtdTriagedAt(t) === null.

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

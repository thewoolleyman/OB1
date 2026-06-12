import { NextRequest, NextResponse } from "next/server";
import { requireSession, AuthError } from "@/lib/auth";
import { updateThought } from "@/lib/api";
import { KANBAN_STATUSES } from "@/lib/types";

// gtd_status enum per openbrain contracts.md § Metadata JSON
// Schema: the six board columns plus the workflow-managed
// "archived" (set by the board's Archive affordance; archived rows
// have no column).
const VALID_GTD_STATUSES = [...KANBAN_STATUSES, "archived"];

export async function POST(request: NextRequest) {
  let apiKey: string;
  try {
    ({ apiKey } = await requireSession());
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const body = await request.json();
    const { thoughtId, gtd_status, content, type } = body;

    if (!thoughtId || typeof thoughtId !== "string") {
      return NextResponse.json(
        { error: "thoughtId (string) is required" },
        { status: 400 }
      );
    }

    if (gtd_status !== undefined && !VALID_GTD_STATUSES.includes(gtd_status)) {
      return NextResponse.json(
        {
          error: `Invalid gtd_status. Must be one of: ${VALID_GTD_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (gtd_status !== undefined) updates.gtd_status = gtd_status;
    if (content !== undefined) updates.content = content;
    if (type !== undefined) updates.type = type;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const result = await updateThought(apiKey, thoughtId, updates);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}

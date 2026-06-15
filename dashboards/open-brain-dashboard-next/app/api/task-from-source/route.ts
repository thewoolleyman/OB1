import { NextRequest, NextResponse } from "next/server";
import {
  createTaskFromSource,
  ApiError,
  type TaskFromSourcePayload,
} from "@/lib/api";
import { requireSession, AuthError } from "@/lib/auth";

// ── POST — create a GTD task from one or more source documents ──────────────
//
// Session-gated proxy for the Inbox "Create task" affordance
// (openbrain GTD redesign). Forwards to open-brain-rest
// POST /task-from-source, which atomically creates a SEPARATE
// type=task record referencing the source doc(s) and stamps the
// source(s) metadata.inbox_state = "promoted" (the source stays put as
// supporting material). The session's x-brain-key is attached by
// lib/api.ts; this module is server-only so the key never reaches the
// client. Task semantics (gtd_status defaulting, content stub
// derivation, idempotent thread-task reuse) are enforced upstream —
// this route passes the fields through verbatim.

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
    const body = (await request.json()) as Record<string, unknown>;

    const ids = Array.isArray(body.supporting_thought_ids)
      ? body.supporting_thought_ids.filter(
          (v): v is string => typeof v === "string" && v.length > 0
        )
      : [];
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "supporting_thought_ids is required" },
        { status: 400 }
      );
    }

    const payload: TaskFromSourcePayload = { supporting_thought_ids: ids };
    if (typeof body.gtd_status === "string")
      payload.gtd_status = body.gtd_status;
    if (typeof body.content === "string" && body.content.trim())
      payload.content = body.content.trim();

    const task = await createTaskFromSource(apiKey, payload);
    return NextResponse.json(task);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

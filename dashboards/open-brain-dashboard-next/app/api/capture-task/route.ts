import { NextRequest, NextResponse } from "next/server";
import {
  captureTask,
  ApiError,
  type CaptureTaskPayload,
} from "@/lib/api";
import { requireSession, AuthError } from "@/lib/auth";

// ── POST — task-explicit capture (AddTaskToBrain) ───────────────────────────
//
// Forwards to `${API_URL}/capture-task` on open-brain-rest, which
// authenticates via the X-Capture-Key header against the server-side
// ANDROID_CAPTURE_KEY secret (never exposed to the client; see
// lib/api.ts § capture-task). The dashboard session is still required
// so only the logged-in operator can reach the proxy. Mirrors
// app/api/ingest/route.ts shape.
//
// All task semantics (type=task override, gtd_status defaulting,
// done/archived rejection, gtd_triaged_at) are enforced upstream by
// the capture_task MCP tool — this route passes fields through
// verbatim and MUST NOT duplicate or override them.

const OPTIONAL_FIELDS = [
  "gtd_status",
  "gtd_contexts",
  "gtd_energy_required",
  "gtd_time_required",
  "gtd_priority",
  "para_category",
  "para_container",
] as const;

export async function POST(request: NextRequest) {
  try {
    await requireSession();
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    // Verbatim pass-through: shape/enum validation is upstream's job
    // (capture_task tool), so invalid values relay as its 400 rather
    // than being silently dropped here.
    const passthrough: Record<string, unknown> = { content };
    for (const field of OPTIONAL_FIELDS) {
      if (body[field] !== undefined) {
        passthrough[field] = body[field];
      }
    }

    const result = await captureTask(
      passthrough as unknown as CaptureTaskPayload
    );
    const first = result.content?.[0];
    const message =
      typeof first?.text === "string" ? first.text : "Captured as task";
    return NextResponse.json({
      message,
      structuredContent: result.structuredContent ?? null,
    });
  } catch (err) {
    // Relay upstream validation failures (400) and auth misconfig
    // (401/500) with their status; everything else is a 500.
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

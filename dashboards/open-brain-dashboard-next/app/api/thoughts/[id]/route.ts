import { NextRequest, NextResponse } from "next/server";
import { requireSession, AuthError } from "@/lib/auth";
import { updateThought, deleteThought, ApiError } from "@/lib/api";

// Session-gated mutation proxy for ThoughtActions (openbrain
// spec.md § Dashboard "ThoughtActions component"): PUT relays a
// partial update to open-brain-rest PUT /thought/:id; DELETE relays
// to DELETE /thought/:id. Out-of-enum values are rejected upstream
// by the pg_jsonschema metadata constraint (relayed as 400).

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let apiKey: string;
  try {
    ({ apiKey } = await requireSession());
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const { id } = await params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const updates: {
      content?: string;
      type?: string;
      gtd_status?: string;
      gtd_triaged_at?: string;
      inbox_state?: string;
    } = {};
    if (typeof body.content === "string") updates.content = body.content;
    if (typeof body.type === "string") updates.type = body.type;
    if (typeof body.gtd_status === "string")
      updates.gtd_status = body.gtd_status;
    if (typeof body.gtd_triaged_at === "string")
      updates.gtd_triaged_at = body.gtd_triaged_at;
    // Inbox dismiss relays inbox_state (e.g. "dismissed") through to
    // PUT /thought/:id; out-of-enum values are rejected upstream.
    if (typeof body.inbox_state === "string")
      updates.inbox_state = body.inbox_state;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const result = await updateThought(apiKey, id, updates);
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let apiKey: string;
  try {
    ({ apiKey } = await requireSession());
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const { id } = await params;

  try {
    await deleteThought(apiKey, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

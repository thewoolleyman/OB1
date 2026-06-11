import { NextRequest, NextResponse } from "next/server";
import { resolveDuplicates, ApiError } from "@/lib/api";
import { requireSession, AuthError } from "@/lib/auth";
import type { DuplicateResolution } from "@/lib/types";

// ── POST — persistent duplicate resolutions (openbrain li-xyuon6) ────
//
// Pass-through proxy to `${API_URL}/duplicates/resolve` on
// open-brain-rest. Body:
//   { resolutions: [{ pair: [a, b], action: "delete" | "keep_both",
//     delete_id? }] }
// delete_id is required for action="delete" and MUST be one of the two
// pair members — the other member survives and is recorded as the
// keeper. Response relays upstream verbatim:
//   { resolved, deleted, skipped }
// The endpoint is idempotent; keep_both entries whose member rows are
// missing are skipped (counted, not errored), and after a keep_both
// resolution GET /duplicates permanently excludes the pair. Deep
// validation (delete_id membership, UUID shape) is upstream's job —
// invalid entries relay as its 400 rather than being re-checked here.

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
    const body = (await request.json()) as {
      resolutions?: DuplicateResolution[];
    };

    if (!Array.isArray(body.resolutions) || body.resolutions.length === 0) {
      return NextResponse.json(
        { error: "resolutions must be a non-empty array" },
        { status: 400 }
      );
    }

    const result = await resolveDuplicates(apiKey, body.resolutions);
    return NextResponse.json(result);
  } catch (err) {
    // Relay upstream validation failures (400) with their status;
    // everything else is a 500.
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Resolve failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

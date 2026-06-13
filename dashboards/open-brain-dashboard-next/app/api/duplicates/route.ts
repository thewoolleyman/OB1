import { NextRequest, NextResponse } from "next/server";
import { fetchDuplicates } from "@/lib/api";
import { requireSession, AuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  let apiKey: string;
  try {
    ({ apiKey } = await requireSession());
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  const threshold = parseFloat(
    request.nextUrl.searchParams.get("threshold") || "0.85"
  );
  const limit = parseInt(
    request.nextUrl.searchParams.get("limit") || "50",
    10
  );
  const offset = parseInt(
    request.nextUrl.searchParams.get("offset") || "0",
    10
  );
  // Optional comma-separated per-source filter (openbrain li-vea6mj,
  // spec v073). Forwarded only when non-empty; omitted = all sources.
  const sourcesParam = request.nextUrl.searchParams.get("sources");
  const sources = sourcesParam
    ? sourcesParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : undefined;

  try {
    const data = await fetchDuplicates(apiKey, {
      threshold,
      limit,
      offset,
      sources,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

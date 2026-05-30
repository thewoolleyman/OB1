import { NextRequest, NextResponse } from "next/server";

// Diagnostic route that deliberately throws a 500, used to exercise the
// dashboard-tier 5xx -> Honeycomb error-observability path end-to-end.
//
// DORMANT BY DEFAULT: returns HTTP 404 unless the deployment sets the
// non-secret runtime env var OB_DIAG_ROUTES_ENABLED=true. Production
// deploys never set it, so this route is invisible there. The openbrain
// `pnpm run test:e2e:honeycomb-5xx` acceptance test sets the flag
// per-deploy on a throwaway Vercel preview, then curls this route with a
// per-run ?nonce= so the resulting `next.request_error` span (emitted by
// the onRequestError hook in instrumentation.ts) carries a correlatable
// marker in error.message.
//
// Contract anchor: openbrain SPECIFICATION/constraints.md
// §"Acceptance scope" (dashboard-tier error observability), item 3.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (process.env.OB_DIAG_ROUTES_ENABLED !== "true") {
    return new NextResponse("not found", { status: 404 });
  }

  // Sanitize the caller-supplied nonce to a short URL/log-safe token so
  // it embeds cleanly into the error message, the span's error.message
  // attribute, and the space-delimited OB_DIAG_REQUEST_ERROR log line.
  const raw = request.nextUrl.searchParams.get("nonce") ?? "no-nonce";
  const nonce = raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "no-nonce";

  // Throwing here yields an HTTP 500 AND fires Next's onRequestError
  // instrumentation hook, which creates the next.request_error span
  // (http.status_code=500, error.message carrying this nonce) and
  // exports it to Honeycomb via the @vercel/otel exporter.
  throw new Error(`diag-500 deliberate failure nonce=${nonce}`);
}

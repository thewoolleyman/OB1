// Pure logic for the OTLP guardrail wrap in instrumentation.ts.
//
// Extracted into its own module so the regression test in openbrain
// (scripts/test-otlp-guardrail.ts) can exercise the parse/decision
// path with synthetic Response objects, without coupling to Next.js,
// globalThis.fetch, or console.error.
//
// The wrap in instrumentation.ts only does three things now:
//   1. URL-filter to api.honeycomb.io
//   2. Delegate parsing to interpretHoneycombResponse here
//   3. Emit console.error when the verdict isn't `ok`
//
// Per li-hkadvg's design notes: silent on 200s with no partial_success;
// loud on every other shape. Keep this module pure — adding I/O,
// timers, or globals belongs in the wrap, not here.

export type GuardrailVerdict =
  | { kind: "ok" }
  | { kind: "rejected"; status: number; summary: string };

// Interpret a fetch Response from api.honeycomb.io. Returns:
//   - { kind: "ok" } when the export landed cleanly (HTTP 200 with
//     either an empty body or no partial_success block, or with
//     partial_success.rejected_spans=0).
//   - { kind: "rejected", status, summary } otherwise. `summary` is a
//     short identifier extracted from the response body:
//       * {"message": "..."} on auth failures (HTTP 401/403/etc.)
//       * {"partial_success": {"rejected_spans": N, "error_message":
//         "..."}} on schema rejections (HTTP 200 + partial_success
//         with rejected_spans > 0)
//       * first 200 chars of the raw body otherwise
//
// Never throws. Body-parse failures degrade to a descriptive summary.
export async function interpretHoneycombResponse(
  resp: Response,
): Promise<GuardrailVerdict> {
  let body: unknown = null;
  let bodyText = "";
  try {
    bodyText = await resp.clone().text();
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    // Non-JSON body. Fall through; `body` stays null and we'll
    // surface a truncated raw string.
  }

  // HTTP 200 with optional partial_success — the only "may still be
  // ok" path.
  if (resp.status === 200) {
    if (body && typeof body === "object" && "partial_success" in body) {
      const ps = (body as { partial_success: unknown }).partial_success;
      if (ps && typeof ps === "object") {
        const rejectedRaw =
          "rejected_spans" in ps
            ? (ps as { rejected_spans: unknown }).rejected_spans
            : 0;
        const rejected =
          typeof rejectedRaw === "number" ? rejectedRaw : 0;
        if (rejected > 0) {
          const errMsg =
            "error_message" in ps
              ? String((ps as { error_message: unknown }).error_message)
              : "";
          return {
            kind: "rejected",
            status: 200,
            summary:
              `partial_success rejected_spans=${rejected} ` +
              `error_message=${errMsg}`,
          };
        }
      }
    }
    return { kind: "ok" };
  }

  // Non-200: always rejected. Extract a short identifier.
  let summary: string;
  if (
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof (body as { message: unknown }).message === "string"
  ) {
    summary = (body as { message: string }).message;
  } else if (bodyText) {
    summary = bodyText.slice(0, 200);
  } else {
    summary = "<empty response body>";
  }
  return { kind: "rejected", status: resp.status, summary };
}

// Format the verdict into the canonical log line the OB1 wrap emits.
// Kept here so the test can pin the exact wire shape that goes to
// vercel logs / Honeycomb's BubbleUp on log alerts.
export function formatGuardrailLog(verdict: GuardrailVerdict): string | null {
  if (verdict.kind === "ok") return null;
  return (
    `[honeycomb-otlp-guardrail] HONEYCOMB_OTLP_REJECTED ` +
    `status=${verdict.status} summary=${verdict.summary}`
  );
}

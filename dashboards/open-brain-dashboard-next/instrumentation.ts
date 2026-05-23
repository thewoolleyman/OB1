import { trace, SpanStatusCode } from "@opentelemetry/api";
import { registerOTel, OTLPHttpJsonTraceExporter } from "@vercel/otel";
import type { Instrumentation } from "next";

const SERVICE_NAME = "open-brain-dashboard-next";

// OTLP guardrail: intercept fetch responses from api.honeycomb.io and log
// any non-200 status loudly. The OTel SDK's success callback fires with
// code=0 regardless of HTTP status, so without this wrap a misconfigured
// API key or partial_success rejection is silently dropped — exactly the
// failure mode ob-ds4 hit (HTTP 401 "unknown API key" returned to a
// Preview-deploy export, masked by EXPORT_RESULT=OK in vercel logs).
//
// Design notes:
//   - URL-filtered: only intercepts api.honeycomb.io; everything else
//     passes through unchanged.
//   - Silent on 200s: no log spam in the success path.
//   - On non-200: logs status code + the response's `message` /
//     `partial_success.error_message` field (short identifiers, not the
//     full body, so we don't leak attribute values that may be sensitive).
//   - Install is idempotent (global guard) so re-entry on warm Vercel
//     containers doesn't stack wraps.
function installHoneycombOtlpGuardrail() {
  type FetchFn = typeof globalThis.fetch;
  const g = globalThis as unknown as {
    __obHoneycombOtlpGuardrailInstalled?: boolean;
    fetch: FetchFn;
  };
  if (g.__obHoneycombOtlpGuardrailInstalled) return;
  g.__obHoneycombOtlpGuardrailInstalled = true;

  const originalFetch = g.fetch.bind(globalThis);
  g.fetch = (async (
    input: Parameters<FetchFn>[0],
    init?: Parameters<FetchFn>[1],
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!url.includes("api.honeycomb.io")) {
      return originalFetch(input, init);
    }

    try {
      const resp = await originalFetch(input, init);
      if (resp.status !== 200) {
        // Non-200 from Honeycomb means the OTel SDK is about to swallow a
        // real failure. Surface it.
        let summary = "";
        try {
          const body = await resp.clone().text();
          const parsed: unknown = body ? JSON.parse(body) : {};
          if (
            parsed &&
            typeof parsed === "object" &&
            "message" in parsed &&
            typeof (parsed as { message: unknown }).message === "string"
          ) {
            summary = (parsed as { message: string }).message;
          } else if (
            parsed &&
            typeof parsed === "object" &&
            "partial_success" in parsed
          ) {
            const ps = (parsed as { partial_success: unknown }).partial_success;
            if (ps && typeof ps === "object") {
              const rejected =
                "rejected_spans" in ps
                  ? (ps as { rejected_spans: unknown }).rejected_spans
                  : "?";
              const msg =
                "error_message" in ps
                  ? (ps as { error_message: unknown }).error_message
                  : "";
              summary = `partial_success rejected_spans=${String(rejected)} error_message=${String(msg)}`;
            }
          } else {
            summary = body.slice(0, 200);
          }
        } catch {
          summary = "<unparseable response body>";
        }
        console.error(
          `[honeycomb-otlp-guardrail] HONEYCOMB_OTLP_REJECTED status=${resp.status} summary=${summary}`,
        );
      }
      return resp;
    } catch (err) {
      // Network-level failures aren't visible in `vercel logs` from the
      // SDK either; surface them through the same channel.
      console.error(
        `[honeycomb-otlp-guardrail] HONEYCOMB_OTLP_NETWORK_ERROR ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }) as FetchFn;
}

export function register() {
  const apiKey = process.env.HONEYCOMB_API_KEY;
  if (!apiKey) return;

  installHoneycombOtlpGuardrail();

  registerOTel({
    serviceName: SERVICE_NAME,
    traceExporter: new OTLPHttpJsonTraceExporter({
      url: "https://api.honeycomb.io/v1/traces",
      headers: { "x-honeycomb-team": apiKey },
    }),
  });
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string {
  if (!headers) return "";
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (!raw) return "";
  return Array.isArray(raw) ? raw[0] ?? "" : raw;
}

export const onRequestError: Instrumentation.onRequestError = (
  err,
  request,
  context,
) => {
  const error = err instanceof Error ? err : new Error(String(err));
  const tracer = trace.getTracer(SERVICE_NAME);
  const span = tracer.startSpan("next.request_error");
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  span.setAttribute("service.name", SERVICE_NAME);
  span.setAttribute("http.status_code", 500);
  span.setAttribute(
    "http.route",
    context.routePath ?? request.path ?? "unknown",
  );
  span.setAttribute(
    "vercel.x_vercel_id",
    headerValue(request.headers, "x-vercel-id"),
  );
  span.setAttribute("error.message", error.message);
  span.setAttribute("error.stack", error.stack ?? "");
  span.recordException(error);
  span.end();
};

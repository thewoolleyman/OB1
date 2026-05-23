import { trace, SpanStatusCode } from "@opentelemetry/api";
import { registerOTel, OTLPHttpJsonTraceExporter } from "@vercel/otel";
import type { Instrumentation } from "next";
import {
  formatGuardrailLog,
  interpretHoneycombResponse,
} from "./lib/honeycomb-guardrail";

const SERVICE_NAME = "open-brain-dashboard-next";

// OTLP guardrail: intercept fetch responses from api.honeycomb.io and log
// any non-200 (or 200+partial_success) status loudly. The OTel SDK's
// success callback fires with code=0 regardless of HTTP status, so
// without this wrap a misconfigured API key or partial_success
// rejection is silently dropped — exactly the failure mode ob-ds4 hit
// (HTTP 401 "unknown API key" returned to a Preview-deploy export,
// masked by EXPORT_RESULT=OK in vercel logs).
//
// Parsing + decision logic lives in ./lib/honeycomb-guardrail so the
// openbrain test:otlp-guardrail wrapper can exercise it with synthetic
// Response objects (li-t27qzp). This file only owns the impure
// fetch-wrap install + console.error emission.
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
      const verdict = await interpretHoneycombResponse(resp);
      const logLine = formatGuardrailLog(verdict);
      if (logLine !== null) console.error(logLine);
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

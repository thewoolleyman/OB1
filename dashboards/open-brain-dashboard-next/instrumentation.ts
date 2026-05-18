import { trace, SpanStatusCode } from "@opentelemetry/api";
import { registerOTel, OTLPHttpJsonTraceExporter } from "@vercel/otel";
import type { Instrumentation } from "next";

const SERVICE_NAME = "open-brain-dashboard-next";

export function register() {
  const apiKey = process.env.HONEYCOMB_API_KEY;
  if (!apiKey) return;

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

import { trace, SpanStatusCode } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { Instrumentation } from "next";

const SERVICE_NAME = "open-brain-dashboard-next";
const HONEYCOMB_API_KEY = process.env.HONEYCOMB_API_KEY ?? "";

if (HONEYCOMB_API_KEY) {
  const headers = { "x-honeycomb-team": HONEYCOMB_API_KEY };
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
    }),
    traceExporter: new OTLPTraceExporter({
      url: "https://api.honeycomb.io/v1/traces",
      headers,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: "https://api.honeycomb.io/v1/logs",
          headers,
        }),
      ),
    ],
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
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

export const reportRequestError: Instrumentation.onRequestError = (
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

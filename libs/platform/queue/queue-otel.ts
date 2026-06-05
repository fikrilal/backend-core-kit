import {
  ROOT_CONTEXT,
  context as otelContext,
  defaultTextMapGetter,
  propagation as otelPropagation,
  trace as otelTrace,
  type Context,
  type Exception,
} from '@opentelemetry/api';
import { getJobOtelMeta, type JobOtelMeta } from './job-meta';

type OtelCarrier = Record<string, string>;

export const QUEUE_TRACER = otelTrace.getTracer('platform.queue');

export function toOtelException(err: unknown): Exception {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }

  return String(err);
}

export function getActiveJobOtelMeta(): JobOtelMeta | undefined {
  const carrier: OtelCarrier = {};
  otelPropagation.inject(otelContext.active(), carrier, {
    set: (c, key, value) => {
      if (key === 'traceparent' || key === 'tracestate') {
        c[key] = value;
      }
    },
  });

  const traceparent = carrier.traceparent;
  if (!traceparent) return undefined;

  const tracestate = carrier.tracestate;
  return { traceparent, ...(tracestate ? { tracestate } : {}) };
}

export function extractJobContextFromData(data: unknown): Context {
  const meta = getJobOtelMeta(data);
  if (!meta) return ROOT_CONTEXT;

  const carrier: OtelCarrier = { traceparent: meta.traceparent };
  if (meta.tracestate) carrier.tracestate = meta.tracestate;

  return otelPropagation.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
}

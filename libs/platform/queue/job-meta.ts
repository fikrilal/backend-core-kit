import type { JsonObject } from './json.types';

export type JobOtelMeta = Readonly<{
  traceparent: string;
  tracestate?: string;
}>;

export type JobMeta = Readonly<{
  otel?: JobOtelMeta;
}>;

export type JobDataWithMeta = JsonObject & {
  __meta?: JobMeta;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getExistingMeta(data: JsonObject): JobMeta | undefined {
  const meta = Reflect.get(data, '__meta');
  if (!isRecord(meta)) return undefined;
  const existingOtel = Reflect.get(meta, 'otel');
  if (!isRecord(existingOtel)) return undefined;

  const traceparent = Reflect.get(existingOtel, 'traceparent');
  if (typeof traceparent !== 'string' || traceparent.trim() === '') return undefined;

  const tracestate = Reflect.get(existingOtel, 'tracestate');
  return {
    otel: {
      traceparent,
      ...(typeof tracestate === 'string' && tracestate.trim() !== '' ? { tracestate } : {}),
    },
  };
}

export function withJobOtelMeta(data: JsonObject, otel: JobOtelMeta): JobDataWithMeta {
  const existingMeta = getExistingMeta(data);
  const existingOtel = existingMeta?.otel;

  const mergedOtel: JobOtelMeta = {
    traceparent: otel.traceparent,
    ...(existingOtel && typeof existingOtel.tracestate === 'string'
      ? { tracestate: existingOtel.tracestate }
      : {}),
    ...(otel.tracestate ? { tracestate: otel.tracestate } : {}),
  };

  const mergedMeta: JobMeta = {
    ...(existingMeta ?? {}),
    otel: mergedOtel,
  };

  return { ...data, __meta: mergedMeta };
}

export function getJobOtelMeta(data: unknown): JobOtelMeta | undefined {
  if (!isRecord(data)) return undefined;
  const meta = data.__meta;
  if (!isRecord(meta)) return undefined;
  const otel = meta.otel;
  if (!isRecord(otel)) return undefined;

  const traceparent = otel.traceparent;
  if (typeof traceparent !== 'string' || traceparent.trim() === '') return undefined;

  const tracestate = otel.tracestate;
  return {
    traceparent: traceparent.trim(),
    ...(typeof tracestate === 'string' && tracestate.trim() !== ''
      ? { tracestate: tracestate.trim() }
      : {}),
  };
}

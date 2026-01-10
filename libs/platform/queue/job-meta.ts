import type { JsonObject } from './json.types';

export type JobOtelMeta = Readonly<{
  traceparent: string;
  tracestate?: string;
}>;

export type JobMeta = Readonly<{
  otel?: JobOtelMeta;
}>;

export type JobDataWithMeta<TData extends JsonObject> = TData & {
  __meta?: JobMeta;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function withJobOtelMeta<TData extends JsonObject>(
  data: TData,
  otel: JobOtelMeta,
): JobDataWithMeta<TData> {
  const existingMeta = isRecord((data as JobDataWithMeta<TData>).__meta)
    ? ((data as JobDataWithMeta<TData>).__meta as Record<string, unknown>)
    : undefined;
  const existingOtel = existingMeta && isRecord(existingMeta.otel) ? existingMeta.otel : undefined;

  const mergedOtel: JobOtelMeta = {
    traceparent: otel.traceparent,
    ...(existingOtel && typeof existingOtel.tracestate === 'string'
      ? { tracestate: existingOtel.tracestate }
      : {}),
    ...(otel.tracestate ? { tracestate: otel.tracestate } : {}),
  };

  const mergedMeta: JobMeta = {
    ...(existingMeta ? (existingMeta as JobMeta) : {}),
    otel: mergedOtel,
  };

  return { ...(data as Record<string, unknown>), __meta: mergedMeta } as JobDataWithMeta<TData>;
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

import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { NodeEnv } from '../config/env.validation';

export type TelemetryRole = 'api' | 'worker';

type TelemetryController = Readonly<{ shutdown: () => Promise<void> }>;

let sdk: NodeSDK | undefined;
let started = false;

const ATTR_DEPLOYMENT_ENVIRONMENT = 'deployment.environment' as const;

function getNodeEnv(): NodeEnv {
  const raw = process.env.NODE_ENV?.trim();
  switch (raw) {
    case NodeEnv.Development:
    case NodeEnv.Test:
    case NodeEnv.Staging:
    case NodeEnv.Production:
      return raw;
    default:
      return NodeEnv.Development;
  }
}

function getServiceName(role: TelemetryRole): string {
  const base = process.env.OTEL_SERVICE_NAME?.trim() || 'backend-core-kit';
  return `${base}-${role}`;
}

function parseOtlpHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;

  const headers: Record<string, string> = {};
  for (const part of trimmed.split(',')) {
    const pair = part.trim();
    if (!pair) continue;
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key || !value) continue;
    headers[key] = value;
  }

  return Object.keys(headers).length ? headers : undefined;
}

function resolveTracesUrl(baseOrFull: string): string {
  const trimmed = baseOrFull.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1/traces')) return trimmed;
  return `${trimmed}/v1/traces`;
}

function isTelemetryEnabled(nodeEnv: NodeEnv): boolean {
  if (nodeEnv === NodeEnv.Test) return false;
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim());
}

export async function initTelemetry(role: TelemetryRole): Promise<TelemetryController> {
  const nodeEnv = getNodeEnv();
  if (!isTelemetryEnabled(nodeEnv)) {
    return { shutdown: async () => undefined };
  }

  if (sdk && started) {
    return {
      shutdown: async () => {
        await sdk?.shutdown();
      },
    };
  }

  diag.setLogger(new DiagConsoleLogger(), {
    logLevel: nodeEnv === NodeEnv.Development ? DiagLogLevel.WARN : DiagLogLevel.ERROR,
  });

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    return { shutdown: async () => undefined };
  }

  const serviceName = getServiceName(role);
  const headers = parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_DEPLOYMENT_ENVIRONMENT]: nodeEnv,
    }),
    traceExporter: new OTLPTraceExporter({
      url: resolveTracesUrl(endpoint),
      headers,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => {
            const url = (req as { url?: unknown }).url;
            if (typeof url !== 'string' || url.trim() === '') return false;
            const path = url.split('?')[0];
            return path === '/health' || path === '/ready';
          },
        },
      }),
    ],
  });

  try {
    sdk.start();
    started = true;
  } catch (err) {
    sdk = undefined;
    started = false;
    throw err;
  }
  return {
    shutdown: async () => {
      await sdk?.shutdown();
    },
  };
}

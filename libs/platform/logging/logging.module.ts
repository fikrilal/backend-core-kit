import { Global, Module, type DynamicModule, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule, type Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';
import { stdSerializers } from 'pino';
import { NodeEnv } from '../config/env.validation';
import { getOrCreateRequestId as computeRequestId } from '../http/request-id';
import { deriveServiceName, normalizeNodeEnv } from '../config/env.runtime';
import { LogLevel } from '../config/log-level';
import { isPrettyLogsEnabled, resolveLogLevel } from './logging.policy';
import { DEFAULT_REDACT_PATHS } from './redaction';

export type LoggingRole = 'api' | 'worker';

type RequestWithId = IncomingMessage & { id?: string; requestId?: string };
type ResponseWithStatus = ServerResponse & { statusCode?: number };

function getNodeEnv(config: ConfigService): NodeEnv {
  return normalizeNodeEnv(config.get<string>('NODE_ENV'));
}

function getServiceName(config: ConfigService, role: LoggingRole): string {
  return deriveServiceName({ otelServiceName: config.get<string>('OTEL_SERVICE_NAME'), role });
}

function getOptionalStringProperty(value: object, key: string): string | undefined {
  const candidate: unknown = Reflect.get(value, key);
  return typeof candidate === 'string' && candidate.trim() !== '' ? candidate : undefined;
}

function getOptionalNumberProperty(value: object, key: string): number | undefined {
  const candidate: unknown = Reflect.get(value, key);
  return typeof candidate === 'number' ? candidate : undefined;
}

function syncRequestId(value: object, requestId: string): void {
  Reflect.set(value, 'requestId', requestId);
  Reflect.set(value, 'id', requestId);
}

function getOrCreateRequestId(req: IncomingMessage): string {
  const requestId = computeRequestId({
    headerValue: req.headers['x-request-id'],
    existingRequestId: getOptionalStringProperty(req, 'requestId'),
    existingId: getOptionalStringProperty(req, 'id'),
  });
  syncRequestId(req, requestId);
  return requestId;
}

function asHttpMethod(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function asUrl(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function getActiveOtelContext(): { otelTraceId: string; otelSpanId: string } | undefined {
  const spanContext = otelTrace.getSpan(otelContext.active())?.spanContext();
  if (!spanContext) return undefined;
  return { otelTraceId: spanContext.traceId, otelSpanId: spanContext.spanId };
}

@Global()
@Module({})
export class LoggingModule {
  static forRoot(role: LoggingRole): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService): Params => {
            const nodeEnv = getNodeEnv(config);
            const level = resolveLogLevel(nodeEnv, config.get<LogLevel>('LOG_LEVEL'));
            const pretty = isPrettyLogsEnabled(nodeEnv, config.get<boolean>('LOG_PRETTY'));
            const serviceName = getServiceName(config, role);

            const pinoHttp: Params['pinoHttp'] = {
              level,
              base: { service: serviceName, env: nodeEnv, role },
              mixin: () => getActiveOtelContext() ?? {},
              ...(pretty
                ? {
                    transport: {
                      target: 'pino-pretty',
                      options: {
                        colorize: true,
                        translateTime: 'SYS:standard',
                        singleLine: false,
                      },
                    },
                  }
                : {}),
              genReqId: (req) => getOrCreateRequestId(req),
              customProps: (req) => {
                const requestId = getOrCreateRequestId(req);
                const spanContext = otelTrace.getSpan(otelContext.active())?.spanContext();
                return {
                  requestId,
                  traceId: requestId,
                  ...(spanContext
                    ? { otelTraceId: spanContext.traceId, otelSpanId: spanContext.spanId }
                    : {}),
                };
              },
              customLogLevel: (_req, res, err) => {
                if (err) return LogLevel.Error;
                const statusCode = getOptionalNumberProperty(res, 'statusCode') ?? 0;
                if (statusCode >= 500) return LogLevel.Error;
                if (statusCode >= 400) return LogLevel.Warn;
                return LogLevel.Info;
              },
              redact: { paths: [...DEFAULT_REDACT_PATHS], remove: true },
              serializers: {
                req(req: RequestWithId) {
                  const requestId = getOrCreateRequestId(req);
                  return {
                    id: requestId,
                    method: asHttpMethod(Reflect.get(req, 'method')),
                    url: asUrl(Reflect.get(req, 'url')),
                  };
                },
                res(res: ResponseWithStatus) {
                  const statusCode = getOptionalNumberProperty(res, 'statusCode');
                  return statusCode !== undefined ? { statusCode } : {};
                },
                err: stdSerializers.err,
              },
            };

            return {
              pinoHttp,
              forRoutes: [{ path: '*path', method: RequestMethod.ALL }],
              exclude: [
                { method: RequestMethod.ALL, path: 'health' },
                { method: RequestMethod.ALL, path: 'ready' },
              ],
            };
          },
        }),
      ],
      exports: [LoggerModule],
    };
  }
}

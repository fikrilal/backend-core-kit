import { Global, Module, type DynamicModule, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule, type Params } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';
import { stdSerializers } from 'pino';
import { NodeEnv } from '../config/env.validation';
import { LogLevel } from '../config/log-level';
import { DEFAULT_REDACT_PATHS } from './redaction';

export type LoggingRole = 'api' | 'worker';

type RequestWithId = IncomingMessage & { id?: string; requestId?: string };
type ResponseWithStatus = ServerResponse & { statusCode?: number };

function getNodeEnv(config: ConfigService): NodeEnv {
  return (config.get<string>('NODE_ENV') as NodeEnv | undefined) ?? NodeEnv.Development;
}

function defaultLogLevel(nodeEnv: NodeEnv): LogLevel {
  if (nodeEnv === NodeEnv.Test) return LogLevel.Silent;
  if (nodeEnv === NodeEnv.Development) return LogLevel.Debug;
  return LogLevel.Info;
}

function getLogLevel(config: ConfigService, nodeEnv: NodeEnv): LogLevel {
  const configured = config.get<LogLevel>('LOG_LEVEL');
  return configured ?? defaultLogLevel(nodeEnv);
}

function isPrettyEnabled(config: ConfigService, nodeEnv: NodeEnv): boolean {
  if (nodeEnv !== NodeEnv.Development) return false;
  const configured = config.get<boolean>('LOG_PRETTY');
  return configured !== false;
}

function getServiceName(config: ConfigService, role: LoggingRole): string {
  const base = config.get<string>('OTEL_SERVICE_NAME')?.trim() || 'backend-core-kit';
  return `${base}-${role}`;
}

function getOrCreateRequestId(req: RequestWithId): string {
  const header = req.headers['x-request-id'];
  const incoming = Array.isArray(header) ? header[0] : header;
  const fromHeader =
    typeof incoming === 'string' && incoming.trim() !== '' ? incoming.trim() : undefined;

  const existing =
    typeof req.requestId === 'string' && req.requestId.trim() !== '' ? req.requestId : undefined;
  const existingId = typeof req.id === 'string' && req.id.trim() !== '' ? req.id : undefined;

  const requestId = fromHeader ?? existing ?? existingId ?? randomUUID();
  req.requestId = requestId;
  req.id = requestId;
  return requestId;
}

function asHttpMethod(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function asUrl(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
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
            const level = getLogLevel(config, nodeEnv);
            const pretty = isPrettyEnabled(config, nodeEnv);
            const serviceName = getServiceName(config, role);

            const pinoHttp: Params['pinoHttp'] = {
              level,
              base: { service: serviceName, env: nodeEnv, role },
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
              genReqId: (req) => getOrCreateRequestId(req as RequestWithId),
              customProps: (req) => {
                const requestId = getOrCreateRequestId(req as RequestWithId);
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
                const statusCode = (res as ResponseWithStatus).statusCode ?? 0;
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
                    method: asHttpMethod((req as { method?: unknown }).method),
                    url: asUrl((req as { url?: unknown }).url),
                  };
                },
                res(res: ResponseWithStatus) {
                  const statusCode =
                    typeof res.statusCode === 'number' ? res.statusCode : undefined;
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

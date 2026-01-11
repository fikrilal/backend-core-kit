import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap, switchMap } from 'rxjs/operators';
import { ErrorCode } from '../errors/error-codes';
import { ProblemException } from '../errors/problem.exception';
import { getIdempotencyOptions } from './idempotency.decorator';
import { IdempotencyService } from './idempotency.service';

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

function pickReplayHeaders(reply: FastifyReply): Record<string, string> {
  const out: Record<string, string> = {};

  const location = reply.getHeader('location');
  const loc =
    typeof location === 'string' ? location : Array.isArray(location) ? location[0] : undefined;
  const locTrimmed = asNonEmptyString(loc);
  if (locTrimmed) out.Location = locTrimmed;

  return out;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor<unknown, unknown> {
  constructor(
    private readonly reflector: Reflector,
    private readonly idempotency: IdempotencyService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const cls = context.getClass();
    const options = getIdempotencyOptions(this.reflector, [handler, cls]);
    if (!options) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const scopeKeyFallback = `${cls.name}.${handler.name}`;

    return from(this.idempotency.begin(req, options, scopeKeyFallback)).pipe(
      switchMap((begin) => {
        if (begin.kind === 'skip') return next.handle();

        const replay = (record: {
          status: number;
          hasBody: boolean;
          body?: unknown;
          headers?: Readonly<Record<string, string>>;
        }) => {
          reply.header('Idempotency-Replayed', 'true');
          if (record.headers) {
            for (const [k, v] of Object.entries(record.headers)) {
              reply.header(k, v);
            }
          }
          reply.status(record.status);
          return of(record.hasBody ? record.body : undefined);
        };

        if (begin.kind === 'replay') {
          return replay(begin.record);
        }

        if (begin.kind === 'in_progress') {
          return from(
            this.idempotency.waitForCompletion(begin.redisKey, begin.requestHash, begin.waitMs),
          ).pipe(
            switchMap((completed) => {
              if (completed) return replay(completed);

              reply.header('Retry-After', '1');
              return throwError(
                () =>
                  new ProblemException(409, {
                    title: 'Conflict',
                    code: ErrorCode.IDEMPOTENCY_IN_PROGRESS,
                    detail: 'An identical request is already in progress',
                  }),
              );
            }),
          );
        }

        // acquired
        return next.handle().pipe(
          mergeMap((data: unknown) =>
            from(
              this.idempotency.complete(
                begin.redisKey,
                begin.requestHash,
                reply.statusCode,
                data,
                pickReplayHeaders(reply),
                begin.ttlSeconds,
              ),
            ).pipe(mergeMap(() => of(data))),
          ),
          catchError((err: unknown) =>
            from(this.idempotency.release(begin.redisKey, begin.requestHash)).pipe(
              mergeMap(() => throwError(() => err)),
            ),
          ),
        );
      }),
    );
  }
}

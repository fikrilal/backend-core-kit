import type { ArgumentsHost } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ProblemException } from '../errors/problem.exception';
import type { AppErrorCode } from '../../../shared/app-error-codes';
import { resolveProblemTitle, type ProblemTitleStrategy } from './problem-details.mapping';

export type FeatureErrorIssue = Readonly<{ field?: string; message: string }>;

export type FeatureErrorTitleStrategy = ProblemTitleStrategy;

type MapFeatureErrorToProblemParams = Readonly<{
  status: number;
  code: AppErrorCode;
  detail?: string;
  issues?: ReadonlyArray<FeatureErrorIssue>;
  titleStrategy: FeatureErrorTitleStrategy;
}>;

function isPositiveRetryAfter(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function mapFeatureErrorToProblem(params: MapFeatureErrorToProblemParams): ProblemException {
  return new ProblemException(params.status, {
    title: resolveProblemTitle({
      status: params.status,
      code: params.code,
      strategy: params.titleStrategy,
    }),
    detail: params.detail,
    code: params.code,
    errors: params.issues ? [...params.issues] : undefined,
  });
}

export function applyRetryAfterHeader(host: ArgumentsHost, retryAfterSeconds: unknown): void {
  if (!isPositiveRetryAfter(retryAfterSeconds)) return;
  host.switchToHttp().getResponse<FastifyReply>().header('Retry-After', String(retryAfterSeconds));
}

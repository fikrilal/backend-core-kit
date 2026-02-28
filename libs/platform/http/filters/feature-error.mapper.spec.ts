import type { ArgumentsHost } from '@nestjs/common';
import { ErrorCode } from '../errors/error-codes';
import { applyRetryAfterHeader, mapFeatureErrorToProblem } from './feature-error.mapper';

type HeaderSetter = (name: string, value: string) => void;

function createHostWithHeaderSpy(header: jest.MockedFunction<HeaderSetter>): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => ({ header }),
    }),
  } as unknown as ArgumentsHost;
}

describe('feature-error.mapper', () => {
  describe('mapFeatureErrorToProblem', () => {
    it('uses validation title for validation errors', () => {
      const problem = mapFeatureErrorToProblem({
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        detail: 'invalid',
        titleStrategy: 'status-default',
      });

      expect(problem.getStatus()).toBe(400);
      expect(problem.getResponse()).toEqual({
        title: 'Validation Failed',
        detail: 'invalid',
        code: ErrorCode.VALIDATION_FAILED,
        type: undefined,
        errors: undefined,
      });
    });

    it('maps status title when strategy is status-default', () => {
      const problem = mapFeatureErrorToProblem({
        status: 429,
        code: ErrorCode.RATE_LIMITED,
        detail: 'too many',
        titleStrategy: 'status-default',
      });

      expect(problem.getResponse()).toEqual({
        title: 'Too Many Requests',
        detail: 'too many',
        code: ErrorCode.RATE_LIMITED,
        type: undefined,
        errors: undefined,
      });
    });

    it('keeps title undefined for non-validation errors in validation-only mode', () => {
      const problem = mapFeatureErrorToProblem({
        status: 500,
        code: ErrorCode.INTERNAL,
        detail: 'boom',
        titleStrategy: 'validation-only',
      });

      expect(problem.getResponse()).toEqual({
        title: undefined,
        detail: 'boom',
        code: ErrorCode.INTERNAL,
        type: undefined,
        errors: undefined,
      });
    });
  });

  describe('applyRetryAfterHeader', () => {
    it('sets Retry-After only for positive integer values', () => {
      const header: jest.MockedFunction<HeaderSetter> = jest.fn();
      const host = createHostWithHeaderSpy(header);

      applyRetryAfterHeader(host, 30);
      applyRetryAfterHeader(host, 0);
      applyRetryAfterHeader(host, -1);
      applyRetryAfterHeader(host, 1.25);
      applyRetryAfterHeader(host, '30');

      expect(header).toHaveBeenCalledTimes(1);
      expect(header).toHaveBeenCalledWith('Retry-After', '30');
    });
  });
});

import { ErrorCode } from '../errors/error-codes';
import { AppProblemError } from '../errors/app-problem.error';
import { createHttpArgumentsHost } from '../../../../test/support/http';
import { AppProblemErrorFilter } from './app-problem-error.filter';

function createReply() {
  const headers: Record<string, string> = {};
  const state: { status?: number; body?: unknown } = {};

  const reply = {
    header: jest.fn(),
    status: jest.fn(),
    send: jest.fn(),
  };

  reply.header.mockImplementation((key: string, value: string) => {
    headers[key.toLowerCase()] = value;
    return reply;
  });
  reply.status.mockImplementation((status: number) => {
    state.status = status;
    return reply;
  });
  reply.send.mockImplementation((body: unknown) => {
    state.body = body;
    return reply;
  });

  return { reply, headers, state };
}

describe('AppProblemErrorFilter', () => {
  it('maps AppProblemError to RFC7807 problem details', () => {
    const filter = new AppProblemErrorFilter();
    const { reply, headers, state } = createReply();
    const host = createHttpArgumentsHost({ requestId: 'req-app-problem', headers: {} }, reply);

    filter.catch(
      new AppProblemError({
        status: 409,
        code: ErrorCode.CONFLICT,
        message: 'Resource conflict',
        issues: [{ field: 'name', message: 'Already exists' }],
      }),
      host,
    );

    expect(headers['x-request-id']).toBe('req-app-problem');
    expect(headers['content-type']).toContain('application/problem+json');
    expect(state.status).toBe(409);
    expect(state.body).toMatchObject({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'Resource conflict',
      code: ErrorCode.CONFLICT,
      traceId: 'req-app-problem',
      errors: [{ field: 'name', message: 'Already exists' }],
    });
  });

  it('sets Retry-After for rate-limit errors', () => {
    const filter = new AppProblemErrorFilter();
    const { reply, headers, state } = createReply();
    const host = createHttpArgumentsHost({ requestId: 'req-rate-limit', headers: {} }, reply);

    filter.catch(
      new AppProblemError({
        status: 429,
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many attempts',
        retryAfterSeconds: 60,
      }),
      host,
    );

    expect(headers['retry-after']).toBe('60');
    expect(state.body).toMatchObject({
      title: 'Too Many Requests',
      status: 429,
      detail: 'Too many attempts',
      code: ErrorCode.RATE_LIMITED,
    });
  });

  it('supports validation-only title strategy', () => {
    const filter = new AppProblemErrorFilter();
    const { reply, state } = createReply();
    const host = createHttpArgumentsHost({ requestId: 'req-validation-only', headers: {} }, reply);

    filter.catch(
      new AppProblemError({
        status: 401,
        code: ErrorCode.UNAUTHORIZED,
        message: 'Unauthorized',
        titleStrategy: 'validation-only',
      }),
      host,
    );

    expect(state.body).toMatchObject({
      title: 'Unauthorized',
      status: 401,
      detail: 'Unauthorized',
      code: ErrorCode.UNAUTHORIZED,
    });
  });
});

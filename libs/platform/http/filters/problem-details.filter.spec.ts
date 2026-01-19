import { HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCode } from '../errors/error-codes';
import { ProblemDetailsFilter } from './problem-details.filter';

function hostFor(req: FastifyRequest, reply: FastifyReply): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => reply,
    }),
  } as unknown as ArgumentsHost;
}

function createReply() {
  const headers: Record<string, string> = {};
  const state: { status?: number; body?: unknown } = {};

  const reply = {
    header: jest.fn((key: string, value: string) => {
      headers[key.toLowerCase()] = value;
      return reply as unknown as FastifyReply;
    }),
    status: jest.fn((status: number) => {
      state.status = status;
      return reply as unknown as FastifyReply;
    }),
    send: jest.fn((body: unknown) => {
      state.body = body;
      return reply as unknown as FastifyReply;
    }),
  } as unknown as FastifyReply;

  return { reply, headers, state };
}

describe('ProblemDetailsFilter', () => {
  it('maps HttpException object response into problem details and preserves code', () => {
    const filter = new ProblemDetailsFilter();
    const { reply, headers, state } = createReply();
    const req = { requestId: 'req-1', headers: {} } as unknown as FastifyRequest;

    const ex = new HttpException(
      {
        title: 'Forbidden',
        detail: 'nope',
        code: 'AUTH_USER_SUSPENDED',
        errors: [{ field: 'x', message: 'bad' }],
      },
      403,
    );

    filter.catch(ex, hostFor(req, reply));

    expect(headers['x-request-id']).toBe('req-1');
    expect(headers['content-type']).toContain('application/problem+json');
    expect(state.status).toBe(403);
    expect(state.body).toMatchObject({
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
      detail: 'nope',
      code: 'AUTH_USER_SUSPENDED',
      traceId: 'req-1',
      errors: [{ field: 'x', message: 'bad' }],
    });
  });

  it('uses default code mapping when HttpException omits code', () => {
    const filter = new ProblemDetailsFilter();
    const { reply, state } = createReply();
    const req = { requestId: 'req-2', headers: {} } as unknown as FastifyRequest;

    const ex = new HttpException('Bad Request', 400);
    filter.catch(ex, hostFor(req, reply));

    expect(state.status).toBe(400);
    expect(state.body).toMatchObject({
      title: 'Bad Request',
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
      traceId: 'req-2',
    });
  });

  it('joins message arrays into a single detail string', () => {
    const filter = new ProblemDetailsFilter();
    const { reply, state } = createReply();
    const req = { requestId: 'req-3', headers: {} } as unknown as FastifyRequest;

    const ex = new HttpException({ message: ['a', 'b'] }, 400);
    filter.catch(ex, hostFor(req, reply));

    expect(state.status).toBe(400);
    expect(state.body).toMatchObject({
      title: 'Bad Request',
      status: 400,
      detail: 'a; b',
      code: ErrorCode.VALIDATION_FAILED,
      traceId: 'req-3',
    });
  });

  it('maps not found to NOT_FOUND code', () => {
    const filter = new ProblemDetailsFilter();
    const { reply, state } = createReply();
    const req = { requestId: 'req-404', headers: {} } as unknown as FastifyRequest;

    const ex = new HttpException('Not Found', 404);
    filter.catch(ex, hostFor(req, reply));

    expect(state.status).toBe(404);
    expect(state.body).toMatchObject({
      title: 'Not Found',
      status: 404,
      code: ErrorCode.NOT_FOUND,
      traceId: 'req-404',
    });
  });

  it('maps unknown errors to 500 and uses request.id fallback without leaking internal detail', () => {
    const filter = new ProblemDetailsFilter();
    const { reply, headers, state } = createReply();
    const req = { id: 'req-4', headers: {} } as unknown as FastifyRequest;

    filter.catch(new Error('boom'), hostFor(req, reply));

    expect(headers['x-request-id']).toBe('req-4');
    expect(state.status).toBe(500);
    expect(state.body).toMatchObject({
      title: 'Internal Server Error',
      status: 500,
      code: ErrorCode.INTERNAL,
      traceId: 'req-4',
    });
    expect(state.body).not.toHaveProperty('detail');
  });
});

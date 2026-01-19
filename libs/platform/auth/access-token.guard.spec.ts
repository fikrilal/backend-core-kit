import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../http/errors/error-codes';
import { ProblemException } from '../http/errors/problem.exception';
import type { AuthPrincipal } from './auth.types';
import { AccessTokenInvalidError } from './access-token-verifier.service';
import type { AccessTokenVerifier } from './access-token-verifier.service';
import { AccessTokenGuard } from './access-token.guard';
import { Public } from './public.decorator';

type HandlerFn = (...args: unknown[]) => unknown;
type ClassConstructor = new (...args: unknown[]) => unknown;

function ctxFor(params: {
  handler: HandlerFn;
  cls: ClassConstructor;
  req: FastifyRequest;
}): ExecutionContext {
  return {
    getHandler: () => params.handler,
    getClass: () => params.cls,
    switchToHttp: () => ({
      getRequest: () => params.req,
    }),
  } as unknown as ExecutionContext;
}

function expectProblem(err: unknown, status: number, code: ErrorCode): void {
  if (!(err instanceof ProblemException)) {
    throw new Error(`Expected ProblemException, got: ${String(err)}`);
  }
  expect(err.getStatus()).toBe(status);
  const body = err.getResponse();
  expect(body).toMatchObject({ code });
}

function createLoggerStub(): PinoLogger {
  return {
    setContext: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;
}

describe('AccessTokenGuard', () => {
  it('allows @Public() endpoints without requiring a token', async () => {
    @Public()
    class PublicController {
      handler(): void {}
    }

    const reflector = new Reflector();
    const verifyAccessToken = jest.fn();
    const guard = new AccessTokenGuard(
      reflector,
      {
        verifyAccessToken,
      } as unknown as AccessTokenVerifier,
      createLoggerStub(),
    );

    const req = { headers: {} } as unknown as FastifyRequest;
    await expect(
      guard.canActivate(
        ctxFor({ handler: PublicController.prototype.handler, cls: PublicController, req }),
      ),
    ).resolves.toBe(true);

    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('throws 401 when Authorization header is missing', async () => {
    class Controller {
      handler(): void {}
    }

    const reflector = new Reflector();
    const guard = new AccessTokenGuard(
      reflector,
      {
        verifyAccessToken: jest.fn(),
      } as unknown as AccessTokenVerifier,
      createLoggerStub(),
    );

    const req = { headers: {} } as unknown as FastifyRequest;

    let err: unknown;
    try {
      await guard.canActivate(
        ctxFor({ handler: Controller.prototype.handler, cls: Controller, req }),
      );
    } catch (caught: unknown) {
      err = caught;
    }
    expectProblem(err, 401, ErrorCode.UNAUTHORIZED);
  });

  it('throws 401 when Authorization is not Bearer', async () => {
    class Controller {
      handler(): void {}
    }

    const reflector = new Reflector();
    const guard = new AccessTokenGuard(
      reflector,
      {
        verifyAccessToken: jest.fn(),
      } as unknown as AccessTokenVerifier,
      createLoggerStub(),
    );

    const req = { headers: { authorization: 'Basic abc' } } as unknown as FastifyRequest;

    let err: unknown;
    try {
      await guard.canActivate(
        ctxFor({ handler: Controller.prototype.handler, cls: Controller, req }),
      );
    } catch (caught: unknown) {
      err = caught;
    }
    expectProblem(err, 401, ErrorCode.UNAUTHORIZED);
  });

  it('sets req.principal and returns true when token is valid', async () => {
    class Controller {
      handler(): void {}
    }

    const reflector = new Reflector();
    const principal: AuthPrincipal = {
      userId: 'user-1',
      sessionId: 'session-1',
      emailVerified: false,
      roles: ['USER'],
    };
    const verifyAccessToken = jest.fn().mockResolvedValue(principal);
    const guard = new AccessTokenGuard(
      reflector,
      {
        verifyAccessToken,
      } as unknown as AccessTokenVerifier,
      createLoggerStub(),
    );

    const req = { headers: { authorization: 'Bearer token' } } as unknown as FastifyRequest;
    await expect(
      guard.canActivate(ctxFor({ handler: Controller.prototype.handler, cls: Controller, req })),
    ).resolves.toBe(true);

    expect(req.principal).toEqual(principal);
  });

  it('maps AccessTokenInvalidError to 401', async () => {
    class Controller {
      handler(): void {}
    }

    const reflector = new Reflector();
    const guard = new AccessTokenGuard(
      reflector,
      {
        verifyAccessToken: jest.fn().mockRejectedValue(new AccessTokenInvalidError()),
      } as unknown as AccessTokenVerifier,
      createLoggerStub(),
    );

    const req = { headers: { authorization: 'Bearer token' } } as unknown as FastifyRequest;

    let err: unknown;
    try {
      await guard.canActivate(
        ctxFor({ handler: Controller.prototype.handler, cls: Controller, req }),
      );
    } catch (caught: unknown) {
      err = caught;
    }
    expectProblem(err, 401, ErrorCode.UNAUTHORIZED);
  });

  it('maps unknown verifier errors to 500', async () => {
    class Controller {
      handler(): void {}
    }

    const reflector = new Reflector();
    const logger = createLoggerStub();
    const guard = new AccessTokenGuard(
      reflector,
      {
        verifyAccessToken: jest.fn().mockRejectedValue(new Error('boom')),
      } as unknown as AccessTokenVerifier,
      logger,
    );

    const req = { headers: { authorization: 'Bearer token' } } as unknown as FastifyRequest;

    let err: unknown;
    try {
      await guard.canActivate(
        ctxFor({ handler: Controller.prototype.handler, cls: Controller, req }),
      );
    } catch (caught: unknown) {
      err = caught;
    }
    expectProblem(err, 500, ErrorCode.INTERNAL);
    expect(logger.error).toHaveBeenCalled();
  });
});

import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../http/errors/error-codes';
import { ProblemException } from '../http/errors/problem.exception';
import type { AuthPrincipal } from './auth.types';
import { AccessTokenInvalidError } from './access-token-verifier.service';
import { AccessTokenVerifier } from './access-token-verifier.service';
import { AccessTokenGuard } from './access-token.guard';
import { Public } from './public.decorator';
import { createHttpExecutionContext } from '../../../test/support/http';
import { createPrototypeStub } from '../../../test/support/stubs';

type HandlerFn = (...args: unknown[]) => unknown;
type ClassConstructor = new (...args: unknown[]) => unknown;
type RequestLike = {
  headers: Record<string, unknown>;
  principal?: AuthPrincipal;
};

function ctxFor(params: { handler: HandlerFn; cls: ClassConstructor; req: object }) {
  return createHttpExecutionContext({
    handler: params.handler,
    cls: params.cls,
    request: params.req,
  });
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
  const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
  logger.setContext = jest.fn();
  logger.error = jest.fn();
  return logger;
}

function createVerifier(
  verifyAccessToken: AccessTokenVerifier['verifyAccessToken'],
): AccessTokenVerifier & Pick<AccessTokenVerifier, 'verifyAccessToken'> {
  return createPrototypeStub(AccessTokenVerifier, { verifyAccessToken });
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
      createVerifier(verifyAccessToken),
      createLoggerStub(),
    );

    const req: RequestLike = { headers: {} };
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
    const guard = new AccessTokenGuard(reflector, createVerifier(jest.fn()), createLoggerStub());

    const req: RequestLike = { headers: {} };

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
    const guard = new AccessTokenGuard(reflector, createVerifier(jest.fn()), createLoggerStub());

    const req: RequestLike = { headers: { authorization: 'Basic abc' } };

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
      createVerifier(verifyAccessToken),
      createLoggerStub(),
    );

    const req: RequestLike = { headers: { authorization: 'Bearer token' } };
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
      createVerifier(jest.fn().mockRejectedValue(new AccessTokenInvalidError())),
      createLoggerStub(),
    );

    const req: RequestLike = { headers: { authorization: 'Bearer token' } };

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
      createVerifier(jest.fn().mockRejectedValue(new Error('boom'))),
      logger,
    );

    const req: RequestLike = { headers: { authorization: 'Bearer token' } };

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

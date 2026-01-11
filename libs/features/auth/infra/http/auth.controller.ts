import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from '../../app/auth.service';
import { AuthError } from '../../app/auth.errors';
import { AuthErrorCode } from '../../app/auth.error-codes';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import { Idempotent } from '../../../../platform/http/idempotency/idempotency.decorator';
import { ApiIdempotencyKeyHeader } from '../../../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import {
  AuthResultEnvelopeDto,
  ChangePasswordRequestDto,
  LogoutRequestDto,
  PasswordLoginRequestDto,
  PasswordRegisterRequestDto,
  RefreshRequestDto,
} from './dtos/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('password/register')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'auth.password.register',
    summary: 'Register (password)',
    description: 'Creates a user and immediately issues first-party access + refresh tokens.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    AuthErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AuthResultEnvelopeDto })
  async register(@Body() body: PasswordRegisterRequestDto, @Req() req: FastifyRequest) {
    try {
      return await this.auth.registerWithPassword({
        email: body.email,
        password: body.password,
        deviceId: body.deviceId,
        deviceName: body.deviceName,
        ip: req.ip,
      });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
  }

  @Post('password/login')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'auth.password.login',
    summary: 'Login (password)',
    description: 'Authenticates a user and issues first-party access + refresh tokens.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    AuthErrorCode.AUTH_INVALID_CREDENTIALS,
    ErrorCode.RATE_LIMITED,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AuthResultEnvelopeDto })
  async login(@Body() body: PasswordLoginRequestDto, @Req() req: FastifyRequest) {
    try {
      return await this.auth.loginWithPassword({
        email: body.email,
        password: body.password,
        deviceId: body.deviceId,
        deviceName: body.deviceName,
        ip: req.ip,
      });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
  }

  @Post('password/change')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'auth.password.change',
    summary: 'Change password (current user)',
    description:
      'Changes the authenticated user password. Revokes other sessions (and their refresh tokens) but keeps the current session active.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.IDEMPOTENCY_IN_PROGRESS,
    ErrorCode.CONFLICT,
    AuthErrorCode.AUTH_PASSWORD_NOT_SET,
    AuthErrorCode.AUTH_CURRENT_PASSWORD_INVALID,
    ErrorCode.INTERNAL,
  ])
  @ApiIdempotencyKeyHeader({ required: false })
  @Idempotent({ scopeKey: 'auth.password.change' })
  @ApiNoContentResponse()
  async changePassword(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() body: ChangePasswordRequestDto,
  ): Promise<void> {
    try {
      await this.auth.changePassword({
        userId: principal.userId,
        sessionId: principal.sessionId,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'auth.refresh',
    summary: 'Refresh tokens',
    description: 'Rotates the refresh token and returns a new access + refresh token.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID,
    AuthErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
    AuthErrorCode.AUTH_REFRESH_TOKEN_REUSED,
    AuthErrorCode.AUTH_SESSION_REVOKED,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: AuthResultEnvelopeDto })
  async refresh(@Body() body: RefreshRequestDto) {
    try {
      return await this.auth.refresh({ refreshToken: body.refreshToken });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'auth.logout',
    summary: 'Logout',
    description: 'Revokes the session associated with the provided refresh token.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID,
    ErrorCode.INTERNAL,
  ])
  @ApiNoContentResponse()
  async logout(@Body() body: LogoutRequestDto) {
    try {
      await this.auth.logout({ refreshToken: body.refreshToken });
    } catch (err: unknown) {
      throw this.mapAuthError(err);
    }
  }

  private mapAuthError(err: unknown): ProblemException {
    if (err instanceof AuthError) {
      const title = this.titleForStatus(err.status, err.code);
      return new ProblemException(err.status, {
        title,
        detail: err.message,
        code: err.code,
        errors: err.issues ? [...err.issues] : undefined,
      });
    }
    throw err;
  }

  private titleForStatus(status: number, code: string): string {
    if (code === ErrorCode.VALIDATION_FAILED) return 'Validation Failed';

    switch (status) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 409:
        return 'Conflict';
      case 429:
        return 'Too Many Requests';
      default:
        return status >= 500 ? 'Internal Server Error' : 'Error';
    }
  }
}

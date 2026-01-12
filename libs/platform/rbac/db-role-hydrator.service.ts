import { Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../db/prisma.service';
import { ProblemException } from '../http/errors/problem.exception';

@Injectable()
export class DbRoleHydrator {
  constructor(private readonly prisma: PrismaService) {}

  async hydrate(principal: AuthPrincipal): Promise<AuthPrincipal> {
    if (!this.prisma.isEnabled()) {
      throw ProblemException.internal('DATABASE_URL is not configured');
    }

    try {
      const client = this.prisma.getClient();
      const user = await client.user.findUnique({
        where: { id: principal.userId },
        select: { role: true, status: true },
      });

      if (!user) {
        throw ProblemException.unauthorized();
      }

      if (user.status === 'SUSPENDED') {
        throw new ProblemException(403, {
          title: 'Forbidden',
          code: 'AUTH_USER_SUSPENDED',
          detail: 'User is suspended',
        });
      }

      if (user.status === 'DELETED') {
        throw ProblemException.unauthorized();
      }

      return { ...principal, roles: [user.role] };
    } catch (err: unknown) {
      if (err instanceof ProblemException) throw err;
      throw ProblemException.internal();
    }
  }
}

import {
  UserAccountDeletionAction as PrismaUserAccountDeletionAction,
  UserRole as PrismaUserRole,
  UserStatus as PrismaUserStatus,
  type UserAccountDeletionAction,
  type UserRole,
  type UserStatus,
} from '@prisma/client';
import type {
  AdminUserAccountDeletionAction,
  AdminUserRoleChangeAuditListItem,
} from '../../app/admin-audit.types';
import type { AdminUserRole, AdminUserStatus } from '../../app/admin-users.types';

export function toAdminUserRole(role: UserRole): AdminUserRole {
  switch (role) {
    case PrismaUserRole.USER:
      return 'USER';
    case PrismaUserRole.ADMIN:
      return 'ADMIN';
  }
}

export function toAdminUserStatus(status: UserStatus): AdminUserStatus {
  switch (status) {
    case PrismaUserStatus.ACTIVE:
      return 'ACTIVE';
    case PrismaUserStatus.SUSPENDED:
      return 'SUSPENDED';
    case PrismaUserStatus.DELETED:
      return 'DELETED';
  }
}

export function toAdminRoleChangeAuditRole(
  role: UserRole,
): AdminUserRoleChangeAuditListItem['oldRole'] {
  return toAdminUserRole(role);
}

export function toAdminUserAccountDeletionAction(
  action: UserAccountDeletionAction,
): AdminUserAccountDeletionAction {
  switch (action) {
    case PrismaUserAccountDeletionAction.REQUESTED:
      return 'REQUESTED';
    case PrismaUserAccountDeletionAction.CANCELED:
      return 'CANCELED';
    case PrismaUserAccountDeletionAction.FINALIZED:
      return 'FINALIZED';
    case PrismaUserAccountDeletionAction.FINALIZE_BLOCKED_LAST_ADMIN:
      return 'FINALIZE_BLOCKED_LAST_ADMIN';
  }
}

import type { ListQuery } from '../../../../shared/list-query';
import type {
  AdminUserAccountDeletionAuditsFilterField,
  AdminUserAccountDeletionAuditsSortField,
  AdminUserAccountDeletionAuditListResult,
  AdminUserRoleChangeAuditsFilterField,
  AdminUserRoleChangeAuditsSortField,
  AdminUserRoleChangeAuditListResult,
} from '../admin-audit.types';

export interface AdminAuditRepository {
  listUserRoleChangeAudits(
    query: ListQuery<AdminUserRoleChangeAuditsSortField, AdminUserRoleChangeAuditsFilterField>,
  ): Promise<AdminUserRoleChangeAuditListResult>;

  listUserAccountDeletionAudits(
    query: ListQuery<
      AdminUserAccountDeletionAuditsSortField,
      AdminUserAccountDeletionAuditsFilterField
    >,
  ): Promise<AdminUserAccountDeletionAuditListResult>;
}

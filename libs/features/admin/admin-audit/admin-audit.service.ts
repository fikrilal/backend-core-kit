import type { ListQuery } from '../../../shared/list-query';
import type { AdminAuditRepository } from '../shared/ports/admin-audit.repository';
import type {
  AdminUserAccountDeletionAuditsFilterField,
  AdminUserAccountDeletionAuditsSortField,
  AdminUserAccountDeletionAuditListResult,
  AdminUserRoleChangeAuditsFilterField,
  AdminUserRoleChangeAuditsSortField,
  AdminUserRoleChangeAuditListResult,
} from '../shared/admin.model';

export class AdminAuditService {
  constructor(private readonly audit: AdminAuditRepository) {}

  async listUserRoleChangeAudits(
    query: ListQuery<AdminUserRoleChangeAuditsSortField, AdminUserRoleChangeAuditsFilterField>,
  ): Promise<AdminUserRoleChangeAuditListResult> {
    return this.audit.listUserRoleChangeAudits(query);
  }

  async listUserAccountDeletionAudits(
    query: ListQuery<
      AdminUserAccountDeletionAuditsSortField,
      AdminUserAccountDeletionAuditsFilterField
    >,
  ): Promise<AdminUserAccountDeletionAuditListResult> {
    return this.audit.listUserAccountDeletionAudits(query);
  }
}

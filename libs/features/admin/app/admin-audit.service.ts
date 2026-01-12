import type { ListQuery } from '../../../shared/list-query';
import type { AdminAuditRepository } from './ports/admin-audit.repository';
import type {
  AdminUserRoleChangeAuditsFilterField,
  AdminUserRoleChangeAuditsSortField,
  AdminUserRoleChangeAuditListResult,
} from './admin-audit.types';

export class AdminAuditService {
  constructor(private readonly audit: AdminAuditRepository) {}

  async listUserRoleChangeAudits(
    query: ListQuery<AdminUserRoleChangeAuditsSortField, AdminUserRoleChangeAuditsFilterField>,
  ): Promise<AdminUserRoleChangeAuditListResult> {
    return this.audit.listUserRoleChangeAudits(query);
  }
}

import type { ListQuery } from '../../../../shared/list-query';
import type {
  AdminUserRoleChangeAuditsFilterField,
  AdminUserRoleChangeAuditsSortField,
  AdminUserRoleChangeAuditListResult,
} from '../admin-audit.types';

export interface AdminAuditRepository {
  listUserRoleChangeAudits(
    query: ListQuery<AdminUserRoleChangeAuditsSortField, AdminUserRoleChangeAuditsFilterField>,
  ): Promise<AdminUserRoleChangeAuditListResult>;
}

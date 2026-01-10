import { SetMetadata } from '@nestjs/common';

export const SKIP_RBAC_KEY = 'skipRbac';
export const SkipRbac = () => SetMetadata(SKIP_RBAC_KEY, true);

import { SetMetadata } from '@nestjs/common';

export const CROSS_TENANT_KEY = 'crossTenant';

/** Marks platform routes allowed to cross tenants. Honoured for SUPER_ADMIN only. */
export const CrossTenant = () => SetMetadata(CROSS_TENANT_KEY, true);

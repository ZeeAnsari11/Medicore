import type { NavVisibilityRequirement } from './types';

/**
 * Check if a subject with the given roles satisfies a visibility requirement.
 * Intentionally takes opaque role strings rather than concrete types,
 * so this function is decoupled from @medicore/shared-types and can evolve
 * from enum-based checks ('TENANT_ADMIN') to permission strings ('users:manage')
 * without changing this signature.
 */
export function can(subjectRoles: string[], requirement?: NavVisibilityRequirement): boolean {
  if (!requirement?.anyOf?.length) {
    return true;
  }
  return requirement.anyOf.some((role) => subjectRoles.includes(role));
}

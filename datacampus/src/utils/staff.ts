export const STAFF_ROLES = ["moderator", "admin", "owner"] as const;
export const TRUSTED_ROLES = ["trusted_contributor", ...STAFF_ROLES] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: string | null | undefined): boolean {
  return STAFF_ROLES.includes(role as StaffRole);
}

export function isTrustedContributor(role: string | null | undefined): boolean {
  return TRUSTED_ROLES.includes(role as (typeof TRUSTED_ROLES)[number]);
}

export const APP_ROLES = [
  "user",
  "trusted_contributor",
  "moderator",
  "admin",
  "owner",
] as const;

export type AppRoleName = (typeof APP_ROLES)[number];

const RANK: Record<string, number> = {
  user: 0,
  trusted_contributor: 1,
  moderator: 2,
  admin: 3,
  owner: 4,
};

export function roleRank(role: string | null | undefined): number {
  return RANK[role || "user"] ?? 0;
}

/** Can actor assign targetRole? Only admin/owner; owner-only for owner role. */
export function canAssignRole(actorRole: string, targetRole: string): boolean {
  if (!APP_ROLES.includes(targetRole as AppRoleName)) return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole !== "owner" && roleRank(targetRole) < roleRank("owner");
  return false;
}

export function conversationKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

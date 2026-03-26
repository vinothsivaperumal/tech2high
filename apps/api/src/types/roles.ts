// apps/api/src/types/roles.ts

export const ROLES = ["student", "trainer", "admin"] as const;
export type UserRole = typeof ROLES[number];

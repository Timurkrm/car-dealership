export const USER_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'BLOCKED',
  'PENDING_VERIFICATION',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const USER_ROLES = ['USER', 'MODERATOR', 'ADMIN'] as const;
export type UserRoleName = (typeof USER_ROLES)[number];

/** Canonical login identifier; syntax/verification belong to the future auth boundary. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

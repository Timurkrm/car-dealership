import type { UserRoleName, UserStatus } from '../../users';

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  roles: UserRoleName[];
}
export interface CurrentUser {
  id: string;
  displayName: string;
  email: string;
  roles: UserRoleName[];
  status: UserStatus;
  emailVerifiedAt: string | null;
}
export interface RequestSecurityContext {
  requestId: string | null;
}
export type ActionTokenPurpose =
  'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'EMAIL_CHANGE';

export function sessionFailure(
  session: {
    createdAt: Date;
    expiresAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
  },
  idleSeconds: number,
  now: Date,
): 'SESSION_REVOKED' | 'SESSION_EXPIRED' | null {
  if (session.revokedAt) return 'SESSION_REVOKED';
  if (
    session.expiresAt <= now ||
    (session.lastUsedAt ?? session.createdAt).getTime() + idleSeconds * 1000 <=
      now.getTime()
  )
    return 'SESSION_EXPIRED';
  return null;
}
/** Any-of semantics; ADMIN is not implicitly MODERATOR. */
export function hasRequiredRole(
  roles: readonly UserRoleName[],
  required: readonly UserRoleName[],
): boolean {
  return required.length === 0 || required.some((role) => roles.includes(role));
}

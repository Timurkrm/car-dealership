import { ApiException } from '../../../platform/http/api-error';
import type { UserRoleName, UserStatus } from '../../users';

export type AccountCommand = 'suspend' | 'block' | 'reactivate';
export type AdminAccountStatus = Exclude<UserStatus, 'PENDING_VERIFICATION'>;
export function nextAccountStatus(
  current: UserStatus,
  command: AccountCommand,
): AdminAccountStatus {
  if (command === 'suspend' && current === 'ACTIVE') return 'SUSPENDED';
  if (command === 'block' && (current === 'ACTIVE' || current === 'SUSPENDED'))
    return 'BLOCKED';
  if (
    command === 'reactivate' &&
    (current === 'SUSPENDED' || current === 'BLOCKED')
  )
    return 'ACTIVE';
  throw new ApiException(
    409,
    'USER_STATUS_TRANSITION_INVALID',
    'Account status transition is not allowed',
  );
}

const ROLE_ORDER: UserRoleName[] = ['USER', 'MODERATOR', 'ADMIN'];
export function canonicalRoles(roles: readonly UserRoleName[]): UserRoleName[] {
  if (!roles.includes('USER'))
    throw new ApiException(400, 'USER_ROLE_INVARIANT', 'USER role is required');
  return ROLE_ORDER.filter((role) => roles.includes(role));
}
export function sameRoles(
  left: readonly UserRoleName[],
  right: readonly UserRoleName[],
): boolean {
  return (
    JSON.stringify(canonicalRoles(left)) ===
    JSON.stringify(canonicalRoles(right))
  );
}

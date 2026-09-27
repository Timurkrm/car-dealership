import { ApiException } from '../../../platform/http/api-error';
import type { User } from '../../users';

export function requireActiveAccount(user: User): void {
  if (user.status === 'BLOCKED')
    throw new ApiException(403, 'ACCOUNT_BLOCKED', 'Account unavailable');
  if (user.status === 'SUSPENDED')
    throw new ApiException(403, 'ACCOUNT_SUSPENDED', 'Account unavailable');
  if (user.status !== 'ACTIVE' || !user.emailVerifiedAt)
    throw new ApiException(
      403,
      'EMAIL_VERIFICATION_REQUIRED',
      'Verify your email before signing in',
    );
}

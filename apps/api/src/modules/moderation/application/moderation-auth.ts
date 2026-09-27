import { ApiException } from '../../../platform/http/api-error';
import type { AuthenticatedPrincipal } from '../../auth';

export function assertModerator(principal: AuthenticatedPrincipal): void {
  if (
    !principal.roles.includes('MODERATOR') &&
    !principal.roles.includes('ADMIN')
  )
    throw new ApiException(403, 'FORBIDDEN', 'Insufficient permissions');
}

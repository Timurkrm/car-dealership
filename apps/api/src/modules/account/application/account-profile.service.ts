import { Inject, Injectable } from '@nestjs/common';
import { ApiException } from '../../../platform/http/api-error';
import { EmailChangeService } from '../../auth';
import { UserIdentity } from '../../users';
import type { AuthenticatedPrincipal } from '../../auth';

export interface AccountProfileView {
  id: string;
  displayName: string;
  email: string;
  emailVerifiedAt: string | null;
  pendingEmail: string | null;
}

@Injectable()
export class AccountProfileService {
  constructor(
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(EmailChangeService)
    private readonly emailChange: EmailChangeService,
  ) {}
  async get(principal: AuthenticatedPrincipal): Promise<AccountProfileView> {
    const [user, pendingEmail] = await Promise.all([
      this.users.findForCurrentUser(principal.userId),
      this.emailChange.pending(principal.userId),
    ]);
    if (!user)
      throw new ApiException(401, 'AUTHENTICATION_REQUIRED', 'Sign in again');
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.emailNormalized,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      pendingEmail,
    };
  }
  async update(
    principal: AuthenticatedPrincipal,
    displayName: string,
  ): Promise<AccountProfileView> {
    const user = await this.users.updateDisplayName(
      principal.userId,
      displayName.trim(),
    );
    if (!user)
      throw new ApiException(401, 'AUTHENTICATION_REQUIRED', 'Sign in again');
    return this.get(principal);
  }
}

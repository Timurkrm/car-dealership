import { AuthApiError, type AuthClient } from '../auth/auth-client';

export interface AccountProfile {
  id: string;
  displayName: string;
  email: string;
  emailVerifiedAt: string | null;
  pendingEmail: string | null;
}
export interface AccountSession {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  current: boolean;
}
export interface NotificationPreferences {
  messagesEmail: boolean;
  savedSearchesEmail: boolean;
  favoritesEmail: boolean;
  moderationEmail: boolean;
  securityEmail: true;
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AuthApiError(502, 'INVALID_API_RESPONSE');
  return value as Record<string, unknown>;
};
export function parseProfile(value: unknown): AccountProfile {
  const item = record(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.displayName !== 'string' ||
    typeof item.email !== 'string' ||
    (item.emailVerifiedAt !== null &&
      typeof item.emailVerifiedAt !== 'string') ||
    (item.pendingEmail !== null && typeof item.pendingEmail !== 'string')
  )
    throw new AuthApiError(502, 'INVALID_API_RESPONSE');
  return item as unknown as AccountProfile;
}
export function parseSessions(value: unknown): AccountSession[] {
  if (!Array.isArray(value) || value.length > 50)
    throw new AuthApiError(502, 'INVALID_API_RESPONSE');
  return value.map((entry) => {
    const item = record(entry);
    if (
      typeof item.id !== 'string' ||
      typeof item.createdAt !== 'string' ||
      typeof item.lastActivityAt !== 'string' ||
      typeof item.expiresAt !== 'string' ||
      typeof item.current !== 'boolean'
    )
      throw new AuthApiError(502, 'INVALID_API_RESPONSE');
    return item as unknown as AccountSession;
  });
}
export function parsePreferences(value: unknown): NotificationPreferences {
  const item = record(value);
  if (
    typeof item.messagesEmail !== 'boolean' ||
    typeof item.savedSearchesEmail !== 'boolean' ||
    typeof item.favoritesEmail !== 'boolean' ||
    typeof item.moderationEmail !== 'boolean' ||
    item.securityEmail !== true
  )
    throw new AuthApiError(502, 'INVALID_API_RESPONSE');
  return item as unknown as NotificationPreferences;
}

export class AccountClient {
  constructor(private readonly auth: AuthClient) {}
  async profile(signal?: AbortSignal): Promise<AccountProfile> {
    return parseProfile(
      await (await this.auth.apiAuthenticated('me/profile', { signal })).json(),
    );
  }
  async updateProfile(displayName: string): Promise<AccountProfile> {
    const result = parseProfile(
      await (
        await this.auth.apiAuthenticated('me/profile', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ displayName }),
        })
      ).json(),
    );
    await this.auth.reloadCurrentUser();
    return result;
  }
  async requestEmailChange(
    newEmail: string,
    currentPassword: string,
  ): Promise<void> {
    await this.auth.apiAuthenticated('me/email-change/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newEmail, currentPassword }),
    });
  }
  async sessions(signal?: AbortSignal): Promise<AccountSession[]> {
    return parseSessions(
      await (
        await this.auth.apiAuthenticated('me/sessions', { signal })
      ).json(),
    );
  }
  async revokeSession(id: string, current: boolean): Promise<void> {
    await this.auth.apiAuthenticated(`me/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (current) this.auth.invalidateSession();
  }
  async revokeOthers(): Promise<number> {
    const value = record(
      await (
        await this.auth.apiAuthenticated('me/sessions/revoke-others', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).json(),
    );
    if (typeof value.revoked !== 'number')
      throw new AuthApiError(502, 'INVALID_API_RESPONSE');
    return value.revoked;
  }
  async preferences(signal?: AbortSignal): Promise<NotificationPreferences> {
    return parsePreferences(
      await (
        await this.auth.apiAuthenticated('me/notification-preferences', {
          signal,
        })
      ).json(),
    );
  }
  async updatePreferences(
    value: Omit<NotificationPreferences, 'securityEmail'>,
  ): Promise<NotificationPreferences> {
    return parsePreferences(
      await (
        await this.auth.apiAuthenticated('me/notification-preferences', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(value),
        })
      ).json(),
    );
  }
}

import { AuthApiError, type AuthClient } from '../auth/auth-client';
import type {
  AdminUserDetail,
  AdminUserPage,
  AuditPage,
  ModerationListingDetail,
  QueueListingPage,
  ReportDetail,
  ReportPage,
  Role,
} from './workspace-types';

function params(input: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value) query.set(key, value);
  return query.size ? `?${query.toString()}` : '';
}
async function json<T>(response: Response): Promise<T> {
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object')
    throw new AuthApiError(502, 'INVALID_API_RESPONSE');
  return value as T;
}

export class WorkspaceApi {
  constructor(private readonly auth: AuthClient) {}

  listingQueue(
    filters: { type?: string; cursor?: string; limit?: string } = {},
    signal?: AbortSignal,
  ) {
    return this.get<QueueListingPage>(
      `moderation/listings${params(filters)}`,
      signal,
    );
  }
  async listing(id: string, signal?: AbortSignal) {
    const response = await this.auth.apiAuthenticated(
      `moderation/listings/${encodeURIComponent(id)}`,
      { signal },
    );
    return {
      value: await json<ModerationListingDetail>(response),
      etag: response.headers.get('etag'),
    };
  }
  listingAction(
    id: string,
    action: 'approve' | 'reject' | 'remove',
    etag: string,
    body: object,
  ) {
    return this.mutate<ModerationListingDetail>(
      `moderation/listings/${encodeURIComponent(id)}/${action}`,
      'POST',
      body,
      { 'if-match': etag },
    );
  }
  reportQueue(
    filters: {
      status?: string;
      targetType?: string;
      cursor?: string;
      limit?: string;
    } = {},
    signal?: AbortSignal,
  ) {
    return this.get<ReportPage>(`moderation/reports${params(filters)}`, signal);
  }
  report(id: string, signal?: AbortSignal) {
    return this.get<ReportDetail>(
      `moderation/reports/${encodeURIComponent(id)}`,
      signal,
    );
  }
  resolveReport(id: string, body: object) {
    return this.mutate<ReportDetail>(
      `moderation/reports/${encodeURIComponent(id)}/resolve`,
      'POST',
      body,
    );
  }
  users(
    filters: {
      status?: string;
      role?: string;
      email?: string;
      cursor?: string;
    } = {},
    signal?: AbortSignal,
  ) {
    return this.get<AdminUserPage>(`admin/users${params(filters)}`, signal);
  }
  user(id: string, signal?: AbortSignal) {
    return this.get<AdminUserDetail>(
      `admin/users/${encodeURIComponent(id)}`,
      signal,
    );
  }
  userStatus(
    id: string,
    action: 'suspend' | 'block' | 'reactivate',
    body: object,
  ) {
    return this.mutate<AdminUserDetail>(
      `admin/users/${encodeURIComponent(id)}/${action}`,
      'POST',
      body,
    );
  }
  roles(id: string, roles: Role[], expectedRoles: Role[]) {
    return this.mutate<AdminUserDetail>(
      `admin/users/${encodeURIComponent(id)}/roles`,
      'PUT',
      { roles, expectedRoles },
    );
  }
  audit(
    filters: {
      action?: string;
      targetType?: string;
      targetId?: string;
      cursor?: string;
    } = {},
    signal?: AbortSignal,
  ) {
    return this.get<AuditPage>(`admin/audit${params(filters)}`, signal);
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return json<T>(await this.auth.apiAuthenticated(path, { signal }));
  }
  private async mutate<T>(
    path: string,
    method: 'POST' | 'PUT',
    body: object,
    extra: Record<string, string> = {},
  ): Promise<T> {
    const response = await this.auth.apiAuthenticated(path, {
      method,
      headers: { 'content-type': 'application/json', ...extra },
      body: JSON.stringify(body),
    });
    return json<T>(response);
  }
}

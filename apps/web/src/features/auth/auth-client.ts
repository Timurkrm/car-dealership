export interface CurrentUser {
  id: string;
  displayName: string;
  email: string;
  roles: ('USER' | 'MODERATOR' | 'ADMIN')[];
  status: 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'BLOCKED';
  emailVerifiedAt: string | null;
}
export interface AuthSnapshot {
  status: 'loading' | 'anonymous' | 'authenticated' | 'unavailable';
  user: CurrentUser | null;
}
export const INITIAL_AUTH: AuthSnapshot = { status: 'loading', user: null };
export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super('Authentication request failed');
  }
}
function currentUser(value: unknown): CurrentUser {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('displayName' in value) ||
    typeof value.displayName !== 'string' ||
    !('email' in value) ||
    typeof value.email !== 'string' ||
    !('roles' in value) ||
    !Array.isArray(value.roles) ||
    !value.roles.every(
      (role: unknown) =>
        role === 'USER' || role === 'MODERATOR' || role === 'ADMIN',
    ) ||
    !('status' in value) ||
    value.status !== 'ACTIVE' ||
    !('emailVerifiedAt' in value) ||
    (value.emailVerifiedAt !== null &&
      typeof value.emailVerifiedAt !== 'string')
  )
    throw new AuthApiError(502, 'INVALID_API_RESPONSE');
  return {
    id: value.id,
    displayName: value.displayName,
    email: value.email,
    roles: value.roles.filter(
      (role): role is 'USER' | 'MODERATOR' | 'ADMIN' =>
        role === 'USER' || role === 'MODERATOR' || role === 'ADMIN',
    ),
    status: value.status,
    emailVerifiedAt: value.emailVerifiedAt,
  };
}
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type RefreshLock = (work: () => Promise<void>) => Promise<void>;
/** Credentials live only in this instance. No browser storage, URLs or logging. */
export class AuthClient {
  private accessToken: string | null = null;
  private refreshFlight: Promise<void> | null = null;
  private bootstrapFlight: Promise<void> | null = null;
  private epoch = 0;
  private snapshot: AuthSnapshot = INITIAL_AUTH;
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly lock: RefreshLock = (work) => work(),
  ) {}
  getSnapshot = (): AuthSnapshot => this.snapshot;
  getServerSnapshot = (): AuthSnapshot => INITIAL_AUTH;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(snapshot: AuthSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  private clear(status: AuthSnapshot['status'] = 'anonymous'): void {
    this.epoch++;
    this.accessToken = null;
    this.publish({ status, user: null });
  }
  private async send(path: string, init: RequestInit = {}): Promise<Response> {
    return this.api(`auth/${path}`, init);
  }
  async api(path: string, init: RequestInit = {}): Promise<Response> {
    const [pathname, query] = path.split('?');
    if (
      !pathname ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_/-]*$/.test(pathname) ||
      path.includes('//') ||
      path.split('?').length > 2 ||
      (query !== undefined && !/^[a-zA-Z0-9_=&%.,+-]*$/.test(query))
    )
      throw new AuthApiError(400, 'INVALID_API_PATH');
    const deadline = AbortSignal.timeout(10000);
    const signal = init.signal
      ? AbortSignal.any([init.signal, deadline])
      : deadline;
    const response = await this.fetcher(`/api/v1/${path}`, {
      ...init,
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code =
        body &&
        typeof body === 'object' &&
        'code' in body &&
        typeof body.code === 'string'
          ? body.code
          : 'REQUEST_FAILED';
      throw new AuthApiError(response.status, code);
    }
    return response;
  }
  private async acceptAccess(response: Response, epoch: number): Promise<void> {
    const value: unknown = await response.json();
    if (
      !value ||
      typeof value !== 'object' ||
      !('accessToken' in value) ||
      typeof value.accessToken !== 'string' ||
      value.accessToken.length > 4096 ||
      !('expiresIn' in value) ||
      typeof value.expiresIn !== 'number'
    )
      throw new AuthApiError(502, 'INVALID_API_RESPONSE');
    if (epoch === this.epoch) this.accessToken = value.accessToken;
  }
  refresh(): Promise<void> {
    if (this.refreshFlight) return this.refreshFlight;
    const epoch = this.epoch;
    this.refreshFlight = this.lock(async () => {
      try {
        await this.acceptAccess(
          await this.send('refresh', {
            method: 'POST',
            body: '{}',
            headers: { 'content-type': 'application/json' },
          }),
          epoch,
        );
      } catch (error) {
        if (epoch === this.epoch)
          this.clear(
            error instanceof AuthApiError &&
              (error.status === 401 || error.status === 403)
              ? 'anonymous'
              : 'unavailable',
          );
        throw error;
      }
    }).finally(() => {
      this.refreshFlight = null;
    });
    return this.refreshFlight;
  }
  async authenticated(path: string, init: RequestInit = {}): Promise<Response> {
    return this.apiAuthenticated(`auth/${path}`, init);
  }
  async apiAuthenticated(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    if (!this.accessToken) await this.refresh();
    const previous = this.accessToken;
    const attempt = () => {
      const headers = new Headers(init.headers);
      if (this.accessToken)
        headers.set('authorization', `Bearer ${this.accessToken}`);
      return this.api(path, { ...init, headers });
    };
    try {
      return await attempt();
    } catch (error) {
      if (
        error instanceof AuthApiError &&
        [
          'ACCOUNT_BLOCKED',
          'ACCOUNT_SUSPENDED',
          'EMAIL_VERIFICATION_REQUIRED',
        ].includes(error.code)
      )
        this.clear();
      if (!(error instanceof AuthApiError) || error.status !== 401) throw error;
      // Another request may have already replaced the credential during this request.
      if (this.accessToken === previous) await this.refresh();
      try {
        return await attempt();
      } catch (retryError) {
        if (
          retryError instanceof AuthApiError &&
          (retryError.status === 401 || retryError.status === 403)
        )
          this.clear();
        throw retryError;
      }
    }
  }
  async realtimeAccessToken(forceRefresh = false): Promise<string> {
    if (forceRefresh || !this.accessToken) await this.refresh();
    if (!this.accessToken)
      throw new AuthApiError(401, 'AUTHENTICATION_REQUIRED');
    return this.accessToken;
  }
  bootstrap(): Promise<void> {
    if (this.bootstrapFlight) return this.bootstrapFlight;
    if (
      this.snapshot.status === 'authenticated' ||
      this.snapshot.status === 'anonymous'
    )
      return Promise.resolve();
    const epoch = this.epoch;
    this.bootstrapFlight = (async () => {
      try {
        await this.refresh();
        const user = currentUser(await (await this.authenticated('me')).json());
        if (epoch === this.epoch)
          this.publish({ status: 'authenticated', user });
      } catch (error) {
        if (epoch === this.epoch)
          this.clear(
            error instanceof AuthApiError &&
              (error.status === 401 || error.status === 403)
              ? 'anonymous'
              : 'unavailable',
          );
      }
    })().finally(() => {
      this.bootstrapFlight = null;
    });
    return this.bootstrapFlight;
  }
  async login(email: string, password: string): Promise<void> {
    // Serialize against any bootstrap refresh before replacing the browser's session cookie.
    await this.bootstrapFlight;
    const epoch = ++this.epoch;
    await this.acceptAccess(
      await this.send('login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
      epoch,
    );
    const user = currentUser(await (await this.authenticated('me')).json());
    if (epoch === this.epoch) this.publish({ status: 'authenticated', user });
  }
  async post(
    path:
      | 'register'
      | 'email-verification/request'
      | 'email-verification/confirm'
      | 'password/forgot'
      | 'password/reset'
      | 'email-change/confirm',
    body: object,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.send(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (path === 'password/reset') this.clear();
  }
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.authenticated('password/change', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }
  async logout(all = false): Promise<void> {
    await this.refreshFlight?.catch(() => undefined);
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    };
    if (all) await this.authenticated('logout-all', init);
    else await this.send('logout', init);
    this.clear();
  }
  invalidateSession(): void {
    this.clear();
  }
  async reloadCurrentUser(): Promise<void> {
    const user = currentUser(await (await this.authenticated('me')).json());
    this.publish({ status: 'authenticated', user });
  }
}

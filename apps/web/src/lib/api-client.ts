export interface HealthResult {
  status: 'ok';
}
export class ApiClientError extends Error {
  constructor(
    readonly code: 'NETWORK_ERROR' | 'HTTP_ERROR' | 'INVALID_RESPONSE',
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super('API request failed');
  }
}
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly transport: typeof fetch = fetch,
  ) {}
  async health(signal?: AbortSignal): Promise<HealthResult> {
    const timeout = AbortSignal.timeout(3000);
    const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
    let response: Response;
    try {
      response = await this.transport(`${this.baseUrl}/api/v1/health`, {
        signal: combined,
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new ApiClientError('NETWORK_ERROR');
    }
    if (!response.ok)
      throw new ApiClientError(
        'HTTP_ERROR',
        response.status,
        response.headers.get('x-request-id') ?? undefined,
      );
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new ApiClientError('INVALID_RESPONSE');
    }
    if (
      typeof value !== 'object' ||
      value === null ||
      !('status' in value) ||
      value.status !== 'ok'
    )
      throw new ApiClientError('INVALID_RESPONSE');
    return { status: 'ok' };
  }
}

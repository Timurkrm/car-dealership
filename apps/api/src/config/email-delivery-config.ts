export interface EmailDeliveryConfig {
  provider: 'preview' | 'http';
  url?: string;
  apiKey?: string;
  fromAddress: string;
  fromName: string;
  batchSize: number;
  maxAttempts: number;
  leaseSeconds: number;
  concurrency: number;
  timeoutMs: number;
}

export function parseEmailDeliveryConfig(
  env: NodeJS.ProcessEnv,
  issues: string[],
): EmailDeliveryConfig {
  const production = env.NODE_ENV === 'production';
  const provider = env.EMAIL_PROVIDER ?? env.AUTH_EMAIL_MODE ?? 'preview';
  if (
    !['preview', 'http'].includes(provider) ||
    (production && provider !== 'http')
  )
    issues.push('Production requires EMAIL_PROVIDER=http');

  const url = env.EMAIL_DELIVERY_URL ?? env.AUTH_EMAIL_DELIVERY_URL;
  const apiKey = env.EMAIL_DELIVERY_KEY ?? env.AUTH_EMAIL_DELIVERY_KEY;
  if (provider === 'http') {
    try {
      const parsed = new URL(url ?? '');
      if (
        parsed.protocol !== 'https:' ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      )
        throw new Error();
    } catch {
      issues.push('EMAIL_DELIVERY_URL must be a configured HTTPS URL');
    }
    if (
      !apiKey ||
      apiKey.length < 32 ||
      apiKey.startsWith('replace-with-') ||
      /[\r\n]/.test(apiKey)
    )
      issues.push('EMAIL_DELIVERY_KEY is required');
  }

  const fromAddress =
    env.EMAIL_FROM_ADDRESS ??
    (production ? '' : 'no-reply@marketplace.example.test');
  if (
    !/^[^\s@]+@[^\s@]+$/.test(fromAddress) ||
    fromAddress.length > 254 ||
    /[\r\n]/.test(fromAddress)
  )
    issues.push('EMAIL_FROM_ADDRESS must be a valid bounded email address');
  const fromName = env.EMAIL_FROM_NAME ?? 'Vehicle Marketplace';
  if (!fromName.trim() || fromName.length > 100 || /[\r\n]/.test(fromName))
    issues.push('EMAIL_FROM_NAME must contain 1–100 characters');

  const integer = (
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number => {
    const text = env[key] ?? String(fallback);
    const value = Number(text);
    if (!/^\d+$/.test(text) || value < minimum || value > maximum)
      issues.push(
        `${key} must be an integer between ${minimum} and ${maximum}`,
      );
    return value;
  };

  return {
    provider: provider === 'http' ? 'http' : 'preview',
    url,
    apiKey,
    fromAddress,
    fromName,
    batchSize: integer('EMAIL_DELIVERY_BATCH_SIZE', 50, 1, 200),
    maxAttempts: integer('EMAIL_DELIVERY_MAX_ATTEMPTS', 8, 1, 25),
    leaseSeconds: integer('EMAIL_DELIVERY_LEASE_SECONDS', 120, 30, 3600),
    concurrency: integer('EMAIL_DELIVERY_CONCURRENCY', 8, 1, 20),
    timeoutMs: integer('EMAIL_DELIVERY_TIMEOUT_MS', 5000, 1000, 30000),
  };
}

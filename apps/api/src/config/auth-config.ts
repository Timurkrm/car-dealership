export interface AuthConfig {
  accessSecret: string;
  accessKeyId: string;
  previousAccessSecret?: string;
  previousAccessKeyId?: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  refreshIdleSeconds: number;
  verificationTtlSeconds: number;
  resetTtlSeconds: number;
  cookieSecure: boolean;
  cookieSameSite: 'strict' | 'lax';
  emailMode: 'preview' | 'http';
  emailUrl?: string;
  emailKey?: string;
}

export function parseAuthConfig(
  env: NodeJS.ProcessEnv,
  issues: string[],
): AuthConfig {
  const production = env.NODE_ENV === 'production';
  const secret = (key: string, optional = false): string | undefined => {
    const value = env[key];
    if (optional && !value) return undefined;
    if (
      !value ||
      !/^[a-f0-9]{64}$/.test(value) ||
      (production && new Set(value).size < 8)
    )
      issues.push(`${key} must be a strong 32-byte lowercase hex key`);
    return value ?? '';
  };
  const seconds = (
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number => {
    const text = env[key] ?? String(fallback);
    const value = Number(text);
    if (
      !/^\d+$/.test(text) ||
      !Number.isSafeInteger(value) ||
      value < min ||
      value > max
    )
      issues.push(`${key} is outside the supported seconds range`);
    return value;
  };
  const accessSecret = secret('AUTH_ACCESS_TOKEN_SECRET') ?? '';
  const previousAccessSecret = secret(
    'AUTH_PREVIOUS_ACCESS_TOKEN_SECRET',
    true,
  );
  const accessKeyId = env.AUTH_ACCESS_KEY_ID ?? 'current';
  const previousAccessKeyId = env.AUTH_PREVIOUS_ACCESS_KEY_ID;
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(accessKeyId))
    issues.push('AUTH_ACCESS_KEY_ID is invalid');
  if (
    Boolean(previousAccessSecret) !== Boolean(previousAccessKeyId) ||
    (previousAccessKeyId &&
      (!/^[a-zA-Z0-9_-]{1,32}$/.test(previousAccessKeyId) ||
        previousAccessKeyId === accessKeyId))
  )
    issues.push('Previous signing key requires a distinct valid key ID');
  const refreshTtlSeconds = seconds(
    'AUTH_REFRESH_TOKEN_TTL',
    2592000,
    3600,
    7776000,
  );
  const refreshIdleSeconds = seconds(
    'AUTH_REFRESH_IDLE_TTL',
    604800,
    300,
    refreshTtlSeconds,
  );
  const secure = env.AUTH_COOKIE_SECURE ?? String(production);
  if (!['true', 'false'].includes(secure) || (production && secure !== 'true'))
    issues.push('AUTH_COOKIE_SECURE must be true in production');
  const sameSite = env.AUTH_COOKIE_SAME_SITE ?? 'strict';
  if (sameSite !== 'strict' && sameSite !== 'lax')
    issues.push('AUTH_COOKIE_SAME_SITE must be strict or lax');
  const emailMode = env.AUTH_EMAIL_MODE ?? env.EMAIL_PROVIDER ?? 'preview';
  if (
    !['preview', 'http'].includes(emailMode) ||
    (production && emailMode !== 'http')
  )
    issues.push(
      'Production requires AUTH_EMAIL_MODE=http with a delivery adapter',
    );
  const emailUrl = env.AUTH_EMAIL_DELIVERY_URL ?? env.EMAIL_DELIVERY_URL;
  const emailKey = env.AUTH_EMAIL_DELIVERY_KEY ?? env.EMAIL_DELIVERY_KEY;
  if (emailMode === 'http') {
    try {
      const url = new URL(emailUrl ?? '');
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hash ||
        url.search
      )
        throw new Error();
    } catch {
      issues.push('AUTH_EMAIL_DELIVERY_URL must be a configured HTTPS URL');
    }
    if (
      !emailKey ||
      emailKey.length < 32 ||
      emailKey.startsWith('replace-with-') ||
      /[\r\n]/.test(emailKey)
    )
      issues.push('AUTH_EMAIL_DELIVERY_KEY is required');
  }
  return {
    accessSecret,
    accessKeyId,
    previousAccessSecret,
    previousAccessKeyId,
    accessTtlSeconds: seconds('AUTH_ACCESS_TOKEN_TTL', 600, 300, 900),
    refreshTtlSeconds,
    refreshIdleSeconds,
    verificationTtlSeconds: seconds(
      'AUTH_VERIFICATION_TOKEN_TTL',
      86400,
      300,
      172800,
    ),
    resetTtlSeconds: seconds('AUTH_PASSWORD_RESET_TOKEN_TTL', 1800, 300, 7200),
    cookieSecure: secure === 'true',
    cookieSameSite: sameSite === 'lax' ? 'lax' : 'strict',
    emailMode: emailMode === 'http' ? 'http' : 'preview',
    emailUrl,
    emailKey,
  };
}

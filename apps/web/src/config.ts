export interface WebConfig {
  apiUrl: string;
  showDiagnostics: boolean;
}
export function webConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  const value = env.API_URL;
  if (!value) throw new Error('API_URL is required');
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error();
  } catch {
    throw new Error('API_URL must be an HTTP(S) origin without credentials');
  }
  return {
    apiUrl: value.replace(/\/$/, ''),
    showDiagnostics: env.NODE_ENV === 'development',
  };
}

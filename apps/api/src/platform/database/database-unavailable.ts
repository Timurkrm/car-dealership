import { QueryFailedError } from 'typeorm';

const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EPIPE',
  '57P01',
  '57P02',
  '57P03',
  '53300',
]);

export function isDatabaseUnavailable(error: unknown): boolean {
  let current: unknown = error;
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 4 && current && !visited.has(current); depth++) {
    visited.add(current);
    if (typeof current !== 'object') return false;
    const candidate = current as {
      code?: unknown;
      cause?: unknown;
      driverError?: unknown;
      name?: unknown;
    };
    const code = typeof candidate.code === 'string' ? candidate.code : '';
    if (
      CONNECTION_CODES.has(code) ||
      (code.length === 5 && code.startsWith('08'))
    )
      return true;
    if (current instanceof QueryFailedError && candidate.driverError) {
      current = candidate.driverError;
      continue;
    }
    current = candidate.cause;
  }
  return false;
}

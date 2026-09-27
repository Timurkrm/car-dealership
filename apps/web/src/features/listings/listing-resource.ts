'use client';
import { useEffect, useState } from 'react';

export interface Resource<T> {
  value: T | null;
  error: unknown;
  loading: boolean;
}
/** The caller memoizes load; request cleanup prevents old selections overwriting current choices. */
export function useListingResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [result, setResult] = useState<{
    load: typeof load;
    value: T | null;
    error: unknown;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult({ load, value, error: null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ load, value: null, error });
      });
    return () => controller.abort();
  }, [load]);
  return result?.load === load
    ? { value: result.value, error: result.error, loading: false }
    : { value: null, error: null, loading: true };
}

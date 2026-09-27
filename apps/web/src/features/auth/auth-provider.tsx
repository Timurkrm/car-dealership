'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { AuthClient } from './auth-client';

const Context = createContext<AuthClient | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new AuthClient(fetch, async (work) => {
        await (typeof navigator !== 'undefined' && navigator.locks
          ? navigator.locks.request('marketplace-refresh', work)
          : work());
      }),
  );
  useEffect(() => {
    void client.bootstrap();
  }, [client]);
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useAuth() {
  const client = useContext(Context);
  if (!client) throw new Error('AuthProvider is required');
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getServerSnapshot,
  );
  return { client, ...snapshot };
}

'use client';
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-provider';
import { EngagementClient } from './engagement-client';
import { FavoriteState } from './favorite-state';
const Context = createContext<FavoriteState | null>(null);
export function FavoriteProvider({ children }: { children: ReactNode }) {
  const { client, status, user } = useAuth();
  const identity = status === 'authenticated' ? (user?.id ?? null) : null;
  const state = useMemo(() => {
    void identity;
    return new FavoriteState(new EngagementClient(client));
  }, [client, identity]);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useFavoriteState() {
  const state = useContext(Context);
  if (!state) throw new Error('FavoriteProvider is required');
  return state;
}

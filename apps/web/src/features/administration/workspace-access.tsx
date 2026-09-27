'use client';

import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-provider';
import { canAdminister, canModerate } from './workspace-types';

export function WorkspaceAccess({
  scope,
  children,
}: {
  scope: 'moderation' | 'admin';
  children: ReactNode;
}) {
  const auth = useAuth();
  if (auth.status === 'loading') return <p role="status">Проверяем доступ…</p>;
  if (auth.status !== 'authenticated' || !auth.user)
    return (
      <p role="alert">Войдите в аккаунт, чтобы открыть рабочую область.</p>
    );
  const allowed =
    scope === 'admin'
      ? canAdminister(auth.user.roles)
      : canModerate(auth.user.roles);
  if (!allowed)
    return <p role="alert">У вас нет доступа к этой рабочей области.</p>;
  return children;
}

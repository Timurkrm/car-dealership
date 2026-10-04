'use client';

import Link from 'next/link';
import { useAuth } from '../auth/auth-provider';
import { canAdminister, canModerate } from './workspace-types';

export function WorkspaceNavigation() {
  const { status, user } = useAuth();
  if (status !== 'authenticated' || !user) return null;
  return (
    <>
      {canModerate(user.roles) ? (
        <Link prefetch={false} href="/moderation">
          Модерация
        </Link>
      ) : null}
      {canAdminister(user.roles) ? (
        <Link prefetch={false} href="/admin/users">
          Пользователи
        </Link>
      ) : null}
      {canAdminister(user.roles) ? (
        <Link prefetch={false} href="/admin/audit">
          Аудит
        </Link>
      ) : null}
    </>
  );
}

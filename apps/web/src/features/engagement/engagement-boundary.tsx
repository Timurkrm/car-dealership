'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-provider';

export function EngagementBoundary({ children }: { children: ReactNode }) {
  const { client, status } = useAuth();
  if (status === 'loading') return <p role="status">Проверяем вход…</p>;
  if (status === 'unavailable')
    return (
      <p role="alert">
        Сервис входа временно недоступен.{' '}
        <button onClick={() => void client.bootstrap()}>Повторить</button>
      </p>
    );
  if (status !== 'authenticated')
    return (
      <p>
        Чтобы открыть личный раздел, <Link href="/login">войдите</Link>.
      </p>
    );
  return children;
}

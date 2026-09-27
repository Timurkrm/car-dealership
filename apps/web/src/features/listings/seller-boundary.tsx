'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-provider';

export function SellerBoundary({ children }: { children: ReactNode }) {
  const { client, status } = useAuth();
  if (status === 'loading') return <p role="status">Проверяем вход…</p>;
  if (status === 'unavailable')
    return (
      <div role="alert">
        Вход временно недоступен.{' '}
        <button onClick={() => void client.bootstrap()}>Повторить</button>
      </div>
    );
  if (status !== 'authenticated')
    return (
      <p>
        Чтобы управлять объявлениями, <Link href="/login">войдите</Link> или{' '}
        <Link href="/register">зарегистрируйтесь</Link>.
      </p>
    );
  return children;
}

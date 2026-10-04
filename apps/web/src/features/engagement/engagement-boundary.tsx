'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-provider';
import { EmptyState, ErrorState } from '../../components/ui/feedback';
import { LoadingState } from '../../components/ui/loading';

export function EngagementBoundary({ children }: { children: ReactNode }) {
  const { client, status } = useAuth();
  if (status === 'loading') return <LoadingState label="Проверяем вход…" />;
  if (status === 'unavailable')
    return (
      <ErrorState
        description="Сервис входа временно недоступен."
        onRetry={() => void client.bootstrap()}
      />
    );
  if (status !== 'authenticated')
    return (
      <EmptyState
        title="Войдите в аккаунт"
        description={
          <>
            Чтобы открыть личный раздел, <Link href="/login">войдите</Link>.
          </>
        }
      />
    );
  return children;
}

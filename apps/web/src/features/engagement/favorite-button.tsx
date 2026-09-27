'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { loginHref } from '../auth/auth-return';
import { EngagementClient } from './engagement-client';

export function FavoriteButton({ listingId }: { listingId: string }) {
  const { client, status } = useAuth();
  const pathname = usePathname();
  const api = useMemo(() => new EngagementClient(client), [client]);
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (status !== 'authenticated')
    return status === 'anonymous' ? (
      <Link href={loginHref(pathname)}>Войти, чтобы добавить в избранное</Link>
    ) : null;
  async function toggle() {
    const previous = favorite;
    setFavorite(!previous);
    setBusy(true);
    setError(false);
    try {
      if (previous) await api.unfavorite(listingId);
      else await api.favorite(listingId);
    } catch {
      setFavorite(previous);
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="favorite-control">
      <button
        type="button"
        aria-pressed={favorite}
        disabled={busy}
        onClick={() => void toggle()}
      >
        {favorite ? 'В избранном' : 'В избранное'}
      </button>
      {error ? <span role="alert"> Не удалось сохранить.</span> : null}
    </span>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { loginHref } from '../auth/auth-return';
import type { SearchParameters } from '../search/search-parameters';
import type { ListingType } from './engagement-client';
import { EngagementClient } from './engagement-client';

export function SaveSearchButton({
  type,
  filters,
  privateOrigin,
}: {
  type: ListingType;
  filters: SearchParameters;
  privateOrigin: boolean;
}) {
  const { client, status } = useAuth();
  const pathname = usePathname();
  const api = useMemo(() => new EngagementClient(client), [client]);
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  if (status === 'anonymous')
    return <Link href={loginHref(pathname)}>Войти, чтобы сохранить поиск</Link>;
  if (status !== 'authenticated') return null;
  if (privateOrigin)
    return (
      <p>
        Поиск «Рядом со мной» нельзя сохранять: точные координаты не
        записываются. Выберите область на карте.
      </p>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Сохранить поиск
      </button>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        void api
          .createSavedSearch({
            name,
            type,
            filters,
            notificationsEnabled: true,
          })
          .then(() => {
            setMessage('Поиск сохранён.');
            setOpen(false);
          })
          .catch(() => setMessage('Не удалось сохранить поиск.'))
          .finally(() => setBusy(false));
      }}
    >
      <label>
        Название поиска{' '}
        <input
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>{' '}
      <button disabled={busy}>Сохранить с уведомлениями</button>{' '}
      <button type="button" onClick={() => setOpen(false)}>
        Отмена
      </button>
      {message ? <span role="status"> {message}</span> : null}
    </form>
  );
}

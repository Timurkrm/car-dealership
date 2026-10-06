'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { loginHref } from '../auth/auth-return';
import type { SearchParameters } from '../search/search-parameters';
import type { ListingType } from './engagement-client';
import { EngagementClient } from './engagement-client';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/field';

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
    return (
      <Link
        prefetch={false}
        className="ui-button ui-button--outline"
        href={loginHref(pathname)}
      >
        Войти, чтобы сохранить поиск
      </Link>
    );
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
      <div className="search-save">
        <Button variant="outline" onClick={() => setOpen(true)}>
          Сохранить поиск
        </Button>
        {message && <p role="status">{message}</p>}
      </div>
    );
  return (
    <form
      className="search-save"
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
      <Input
        label="Название поиска"
        required
        maxLength={120}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Button type="submit" loading={busy}>
        Сохранить с уведомлениями
      </Button>{' '}
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Отмена
      </Button>
      {message ? <span role="status"> {message}</span> : null}
    </form>
  );
}

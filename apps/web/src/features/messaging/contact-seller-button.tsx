'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { loginHref } from '../auth/auth-return';
import { useAuth } from '../auth/auth-provider';
import { MessagingClient } from './messaging-client';

export function ContactSellerButton({
  listingId,
  sellerId,
}: {
  listingId: string;
  sellerId: string;
}) {
  const { client, status, user } = useAuth();
  const api = useMemo(() => new MessagingClient(client), [client]);
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (status === 'authenticated' && user?.id === sellerId) return null;
  if (status !== 'authenticated')
    return <Link href={loginHref(pathname)}>Написать продавцу</Link>;
  return (
    <span className="contact-seller">
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(false);
          void api.open(listingId).then(
            (conversation) =>
              router.push(`/account/messages/${conversation.id}`),
            () => {
              setBusy(false);
              setError(true);
            },
          );
        }}
      >
        {busy ? 'Открываем чат…' : 'Написать продавцу'}
      </button>
      {error ? <span role="alert"> Не удалось открыть чат.</span> : null}
    </span>
  );
}

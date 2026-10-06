'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loginHref } from '../auth/auth-return';
import { useAuth } from '../auth/auth-provider';
import { MessagingClient } from './messaging-client';
import { Button, ButtonLink } from '../../components/ui/button';
import { Icon } from '../../components/ui/icon';
import { sellerMarker } from '../detail/detail-model';

export function ContactSellerButton({
  listingId,
  sellerIdentity,
  published,
}: {
  listingId: string;
  sellerIdentity: string;
  published: boolean;
}) {
  const { client, status, user } = useAuth();
  const api = useMemo(() => new MessagingClient(client), [client]);
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState(false);
  const [identity, setIdentity] = useState<{ id: string; marker: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (user) void sellerMarker(listingId, user.id).then(marker => {
      if (active) setIdentity({ id: user.id, marker });
    }).catch(() => { /* Keep the action disabled if comparison is unavailable. */ });
    return () => { active = false; };
  }, [listingId, user]);
  if (status === 'authenticated' && identity?.id === user?.id && identity?.marker === sellerIdentity)
    return <ButtonLink variant="outline" href={`/account/listings/${listingId}`}>Управлять объявлением</ButtonLink>;
  if (!published) return <Button disabled>Объявление продано</Button>;
  if (status === 'anonymous')
    return <ButtonLink href={loginHref(pathname)}><Icon name="message" /> Написать продавцу</ButtonLink>;
  if (status !== 'authenticated' || identity?.id !== user?.id)
    return <Button disabled>Написать продавцу</Button>;
  return (
    <div className="contact-seller">
      <Button
        loading={busy}
        onClick={() => {
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError(false);
          void api.open(listingId).then(
            (conversation) =>
              router.push(`/account/messages/${conversation.id}`),
            () => {
              pending.current = false;
              setBusy(false);
              setError(true);
            },
          );
        }}
      >
        <Icon name="message" /> Написать продавцу
      </Button>
      {error ? <span role="alert">Не удалось открыть чат. Попробуйте ещё раз.</span> : null}
    </div>
  );
}

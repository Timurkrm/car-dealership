'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth/auth-provider';
import { ListingApi } from './listing-api';
import { SellerBoundary } from './seller-boundary';
import { ListingForm } from './listing-form';
import { ListingError } from './listing-feedback';

function SellForm() {
  const { client } = useAuth();
  const api = useMemo(() => new ListingApi(client), [client]);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <ListingError error={error} />
      <ListingForm
        api={api}
        disabled={busy}
        onError={setError}
        onSave={async (body) => {
          setBusy(true);
          setError(null);
          try {
            const result = await api.create(body);
            router.push(`/account/listings/${result.listing.id}`);
          } catch (failure) {
            setError(failure);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
export function SellScreen() {
  return (
    <main id="main">
      <h1>Продать автомобиль</h1>
      <p>
        Сохраните черновик, затем добавьте фотографии на странице управления
        объявлением.
      </p>
      <SellerBoundary>
        <SellForm />
      </SellerBoundary>
    </main>
  );
}

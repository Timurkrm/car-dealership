'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth/auth-provider';
import { ListingApi } from '../listings/listing-api';
import { SellerBoundary } from '../listings/seller-boundary';
import { ListingError } from '../listings/listing-feedback';
import { PartApi } from './part-api';
import { PartForm } from './part-form';
function SellPartForm() {
  const { client } = useAuth();
  const api = useMemo(() => new PartApi(client), [client]);
  const vehicles = useMemo(() => new ListingApi(client), [client]);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <ListingError error={error} />
      <PartForm
        api={api}
        vehicleApi={vehicles}
        disabled={busy}
        onError={setError}
        onSave={async (body) => {
          setBusy(true);
          setError(null);
          try {
            const result = await api.create(body);
            router.push('/account/listings/' + result.listing.id);
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
export function SellPartScreen() {
  return (
    <main id="main">
      <h1>Продать запчасть</h1>
      <p>
        Создайте черновик, затем добавьте фотографии и отправьте его на
        модерацию. Местоположение необязательно.
      </p>
      <SellerBoundary>
        <SellPartForm />
      </SellerBoundary>
    </main>
  );
}

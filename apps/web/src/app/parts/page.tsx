import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PartCatalogScreen } from '../../features/parts/part-catalog-screen';
export const metadata: Metadata = {
  title: 'Автомобильные запчасти',
  robots: { index: false, follow: true },
};
export default function Page() {
  return (
    <Suspense
      fallback={
        <main id="main">
          <h1>Запчасти</h1>
          <p role="status">Загрузка…</p>
        </main>
      }
    >
      <PartCatalogScreen />
    </Suspense>
  );
}

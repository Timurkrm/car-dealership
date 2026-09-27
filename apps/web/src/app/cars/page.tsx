import { Suspense } from 'react';
import { SearchScreen } from '../../features/search/search-screen';
export const metadata = {
  title: 'Каталог автомобилей',
  robots: { index: false, follow: true },
};
export default function Page() {
  return (
    <Suspense
      fallback={
        <main id="main">
          <h1>Каталог автомобилей</h1>
          <p role="status">Загружаем каталог…</p>
        </main>
      }
    >
      <SearchScreen />
    </Suspense>
  );
}

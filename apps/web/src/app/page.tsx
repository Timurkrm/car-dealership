import { Suspense } from 'react';
import { connection } from 'next/server';
import { webConfig } from '../config';
import { ApiStatus } from '../features/diagnostics/api-status';
import Link from 'next/link';

export default async function HomePage() {
  await connection();
  const config = webConfig();
  return (
    <main id="main">
      <h1>Автомобильная платформа</h1>
      <p>Сервис покупки и продажи автомобилей находится в разработке.</p>
      <nav aria-label="Аккаунт">
        <Link href="/login">Войти</Link>
        <Link href="/register">Зарегистрироваться</Link>
        <Link href="/account">Личный кабинет</Link>
      </nav>
      {config.showDiagnostics && (
        <aside aria-label="Проверка среды разработки">
          <h2>Среда разработки</h2>
          <Suspense fallback={<p role="status">Проверяем API…</p>}>
            <ApiStatus apiUrl={config.apiUrl} />
          </Suspense>
        </aside>
      )}
    </main>
  );
}

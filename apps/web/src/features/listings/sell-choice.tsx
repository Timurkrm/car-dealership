import Link from 'next/link';
export function SellChoice() {
  return (
    <main id="main">
      <h1>Что вы хотите продать?</h1>
      <div className="auth-actions">
        <Link prefetch={false} href="/sell/car">
          Автомобиль
        </Link>
        <Link prefetch={false} href="/sell/part">
          Запчасть
        </Link>
      </div>
    </main>
  );
}

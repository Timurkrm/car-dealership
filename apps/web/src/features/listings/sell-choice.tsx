import Link from 'next/link';
export function SellChoice() {
  return (
    <main id="main">
      <h1>Что вы хотите продать?</h1>
      <div className="auth-actions">
        <Link href="/sell/car">Автомобиль</Link>
        <Link href="/sell/part">Запчасть</Link>
      </div>
    </main>
  );
}

import Link from 'next/link';
export default function NotFoundPage() {
  return (
    <main id="main">
      <h1>Страница не найдена</h1>
      <Link href="/">На главную</Link>
    </main>
  );
}

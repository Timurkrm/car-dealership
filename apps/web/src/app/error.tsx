'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main">
      <h1>Не удалось загрузить страницу</h1>
      <p>Попробуйте ещё раз.</p>
      <button onClick={reset}>Повторить</button>
    </main>
  );
}

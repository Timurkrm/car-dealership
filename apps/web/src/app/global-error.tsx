'use client';
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="ru">
      <body>
        <main>
          <h1>Не удалось загрузить приложение</h1>
          <button onClick={reset}>Повторить</button>
        </main>
      </body>
    </html>
  );
}

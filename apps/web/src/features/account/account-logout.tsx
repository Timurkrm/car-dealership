'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../auth/auth-provider';

export function AccountLogout() {
  const { client } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className="auth-actions">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await client.logout(false);
            router.replace('/login');
          } catch {
            setError('Не удалось завершить сессию. Повторите попытку.');
            setBusy(false);
          }
        }}
      >
        {busy ? 'Выходим…' : 'Выйти'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

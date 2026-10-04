'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { Button } from '../../components/ui/button';
import { Alert } from '../../components/ui/feedback';

export function AccountLogout() {
  const { client } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className="auth-actions">
      <Button
        variant="outline"
        type="button"
        loading={busy}
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
        Выйти
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

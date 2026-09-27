'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-provider';

export function EmailChangeConfirmation() {
  const { client } = useAuth();
  const [token, setToken] = useState('');
  const [state, setState] = useState<'ready' | 'busy' | 'success' | 'error'>(
    'ready',
  );
  useEffect(() => {
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    window.history.replaceState(null, '', window.location.pathname);
    const timer = window.setTimeout(
      () => setToken(/^[A-Za-z0-9_-]{43}$/.test(value) ? value : ''),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  if (state === 'success')
    return (
      <p role="status">
        Email изменён, остальные сеансы завершены.{' '}
        <Link href="/account/security">Вернуться к безопасности</Link>.
      </p>
    );
  return (
    <section className="settings-panel">
      <p>Подтвердите изменение email. Ссылка одноразовая.</p>
      <button
        disabled={!token || state === 'busy'}
        onClick={async () => {
          setState('busy');
          try {
            await client.post('email-change/confirm', { token });
            await client.reloadCurrentUser().catch(() => undefined);
            setToken('');
            setState('success');
          } catch {
            setToken('');
            setState('error');
          }
        }}
      >
        {state === 'busy' ? 'Подтверждаем…' : 'Подтвердить новый email'}
      </button>
      {!token && state === 'ready' && (
        <p role="alert">Ссылка недействительна.</p>
      )}
      {state === 'error' && (
        <p role="alert">
          Ссылка истекла, уже использована или новый email занят.
        </p>
      )}
    </section>
  );
}

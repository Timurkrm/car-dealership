'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { AuthApiError } from '../auth/auth-client';
import { AccountClient, type AccountProfile } from './account-client';

const errorText = (error: unknown) =>
  error instanceof AuthApiError && error.code === 'VALIDATION_ERROR'
    ? 'Проверьте введённое имя.'
    : 'Не удалось сохранить профиль. Попробуйте ещё раз.';

export function ProfileScreen() {
  const { client } = useAuth();
  const api = useMemo(() => new AccountClient(client), [client]);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api
      .profile(controller.signal)
      .then((value) => {
        setProfile(value);
        setName(value.displayName);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorText(reason));
      });
    return () => controller.abort();
  }, [api]);
  if (!profile && !error) return <p role="status">Загружаем профиль…</p>;
  return (
    <section className="settings-panel">
      <h2>Профиль</h2>
      <form
        className="auth-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          setSaved('');
          try {
            const value = await api.updateProfile(name);
            setProfile(value);
            setName(value.displayName);
            setSaved('Профиль сохранён.');
          } catch (reason) {
            setError(errorText(reason));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || !profile}>
          <label>
            Отображаемое имя
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={1}
              maxLength={100}
              autoComplete="name"
            />
          </label>
          <label>
            Email
            <input value={profile?.email ?? ''} readOnly type="email" />
          </label>
          {profile?.pendingEmail && (
            <p role="status">Ожидает подтверждения: {profile.pendingEmail}</p>
          )}
          <button>Сохранить</button>
        </fieldset>
      </form>
      {saved && <p role="status">{saved}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

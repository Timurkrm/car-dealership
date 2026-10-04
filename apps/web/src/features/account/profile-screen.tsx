'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { AuthApiError } from '../auth/auth-client';
import { AccountClient, type AccountProfile } from './account-client';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/field';
import { Alert } from '../../components/ui/feedback';
import { LoadingState } from '../../components/ui/loading';

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
  if (!profile && !error) return <LoadingState label="Загружаем профиль…" />;
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
          <Input
            label="Отображаемое имя"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={1}
            maxLength={100}
            autoComplete="name"
          />
          <Input
            label="Email"
            hint="Изменить адрес можно в разделе «Безопасность»."
            value={profile?.email ?? ''}
            readOnly
            type="email"
          />
          {profile?.pendingEmail && (
            <Alert>Ожидает подтверждения: {profile.pendingEmail}</Alert>
          )}
          <Button type="submit" loading={busy}>
            Сохранить
          </Button>
        </fieldset>
      </form>
      {saved && <Alert tone="success">{saved}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}

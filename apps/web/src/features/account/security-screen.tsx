'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth/auth-provider';
import { AccountClient, type AccountSession } from './account-client';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/field';
import { Alert } from '../../components/ui/feedback';
import { LoadingState } from '../../components/ui/loading';
import { ConfirmationDialog } from '../../components/ui/dialog';

const date = (value: string) =>
  new Intl.DateTimeFormat('ru', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

export function SecurityScreen() {
  const router = useRouter();
  const { client } = useAuth();
  const api = useMemo(() => new AccountClient(client), [client]);
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const confirmationTrigger = useRef<HTMLButtonElement>(null);
  const [confirmation, setConfirmation] = useState<
    AccountSession | 'others' | null
  >(null);
  useEffect(() => {
    const controller = new AbortController();
    void api
      .sessions(controller.signal)
      .then((items) => {
        setSessions(items);
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Не удалось загрузить активные сеансы.');
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [api]);
  const run = async (work: () => Promise<void>, success: string) => {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await work();
      setStatus(success);
    } catch {
      setError('Операция не выполнена. Проверьте данные и повторите.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-stack">
      <section className="settings-panel">
        <h2>Email</h2>
        <p>
          Новый адрес станет активным только после перехода по ссылке из письма.
        </p>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const values = new FormData(form);
            void run(async () => {
              await api.requestEmailChange(
                String(values.get('newEmail')),
                String(values.get('currentPassword')),
              );
              form.reset();
            }, 'Ссылка подтверждения отправлена на новый адрес.');
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Новый email
              <Input name="newEmail" type="email" required maxLength={254} />
            </label>
            <label>
              Текущий пароль
              <Input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <Button type="submit" loading={busy}>
              Отправить подтверждение
            </Button>
          </fieldset>
        </form>
      </section>
      <section className="settings-panel">
        <h2>Пароль</h2>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const values = new FormData(form);
            const next = String(values.get('newPassword'));
            if (next !== String(values.get('confirmPassword'))) {
              setError('Новые пароли не совпадают.');
              return;
            }
            void run(async () => {
              await client.changePassword(
                String(values.get('currentPassword')),
                next,
              );
              form.reset();
            }, 'Пароль изменён, остальные сеансы завершены.');
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Текущий пароль
              <Input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <label>
              Новый пароль
              <Input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                maxLength={256}
                minLength={15}
              />
            </label>
            <label>
              Повторите новый пароль
              <Input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                maxLength={256}
                minLength={15}
              />
            </label>
            <Button type="submit" loading={busy}>
              Сменить пароль
            </Button>
          </fieldset>
        </form>
      </section>
      <section className="settings-panel">
        <h2>Активные сеансы</h2>
        {loading ? (
          <LoadingState label="Загружаем сеансы…" />
        ) : (
          <>
            <ul className="session-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <div>
                    <strong>
                      {session.current ? 'Текущий сеанс' : 'Другой сеанс'}
                    </strong>
                    <span>Активность: {date(session.lastActivityAt)}</span>
                    <span>Создан: {date(session.createdAt)}</span>
                    <span>Истекает: {date(session.expiresAt)}</span>
                  </div>
                  <Button
                    variant={session.current ? 'danger' : 'outline'}
                    disabled={busy}
                    onClick={(event) => {
                      confirmationTrigger.current = event.currentTarget;
                      setConfirmation(session);
                    }}
                  >
                    Завершить сеанс
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              disabled={busy || sessions.every((session) => session.current)}
              onClick={(event) => {
                confirmationTrigger.current = event.currentTarget;
                setConfirmation('others');
              }}
            >
              Завершить остальные сеансы
            </Button>
          </>
        )}
      </section>
      {status && <Alert tone="success">{status}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <ConfirmationDialog
        returnFocusRef={confirmationTrigger}
        open={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={
          confirmation === 'others'
            ? 'Завершить все остальные сеансы?'
            : confirmation?.current
              ? 'Завершить текущий сеанс и выйти?'
              : 'Завершить этот сеанс?'
        }
        description="На устройствах с завершённым сеансом потребуется снова войти в аккаунт."
        confirmLabel="Завершить"
        onConfirm={() => {
          const selected = confirmation;
          if (!selected) return;
          setConfirmation(null);
          if (selected === 'others') {
            void run(async () => {
              await api.revokeOthers();
              setSessions((current) => current.filter((item) => item.current));
            }, 'Остальные сеансы завершены.');
          } else {
            void run(async () => {
              await api.revokeSession(selected.id, selected.current);
              if (selected.current) {
                router.replace('/login');
                return;
              }
              setSessions((current) =>
                current.filter((item) => item.id !== selected.id),
              );
            }, 'Сеанс завершён.');
          }
        }}
      />
    </div>
  );
}

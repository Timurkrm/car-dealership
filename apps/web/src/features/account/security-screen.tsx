'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth/auth-provider';
import { AccountClient, type AccountSession } from './account-client';

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
              <input name="newEmail" type="email" required maxLength={254} />
            </label>
            <label>
              Текущий пароль
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <button>Отправить подтверждение</button>
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
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <label>
              Новый пароль
              <input
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
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                maxLength={256}
                minLength={15}
              />
            </label>
            <button>Сменить пароль</button>
          </fieldset>
        </form>
      </section>
      <section className="settings-panel">
        <h2>Активные сеансы</h2>
        {loading ? (
          <p role="status">Загружаем сеансы…</p>
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
                  <button
                    className={session.current ? 'danger-button' : undefined}
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          session.current
                            ? 'Завершить текущий сеанс и выйти?'
                            : 'Завершить этот сеанс?',
                        )
                      )
                        return;
                      void run(async () => {
                        await api.revokeSession(session.id, session.current);
                        if (session.current) {
                          router.replace('/login');
                          return;
                        }
                        setSessions((current) =>
                          current.filter((item) => item.id !== session.id),
                        );
                      }, 'Сеанс завершён.');
                    }}
                  >
                    Завершить сеанс
                  </button>
                </li>
              ))}
            </ul>
            <button
              disabled={busy || sessions.every((session) => session.current)}
              onClick={() => {
                if (!window.confirm('Завершить все остальные сеансы?')) return;
                void run(async () => {
                  await api.revokeOthers();
                  setSessions((current) =>
                    current.filter((item) => item.current),
                  );
                }, 'Остальные сеансы завершены.');
              }}
            >
              Завершить остальные сеансы
            </button>
          </>
        )}
      </section>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AuthApiError } from './auth-client';
import { useAuth } from './auth-provider';
import { safeReturnTo } from './auth-return';

type FormKind =
  'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-email';
const TITLES: Record<FormKind, string> = {
  login: 'Вход',
  register: 'Регистрация',
  'forgot-password': 'Восстановление пароля',
  'reset-password': 'Новый пароль',
  'verify-email': 'Подтверждение email',
};
function message(error: unknown): string {
  if (!(error instanceof AuthApiError))
    return 'Не удалось связаться с сервисом. Попробуйте ещё раз.';
  const messages: Record<string, string> = {
    INVALID_CREDENTIALS: 'Неверный email или пароль.',
    EMAIL_ALREADY_REGISTERED:
      'Этот email уже зарегистрирован. Войдите или восстановите пароль.',
    EMAIL_VERIFICATION_REQUIRED:
      'Подтвердите email перед входом. Ниже можно запросить новое письмо.',
    ACCOUNT_BLOCKED: 'Аккаунт недоступен.',
    ACCOUNT_SUSPENDED: 'Доступ к аккаунту приостановлен.',
    AUTH_RATE_LIMITED: 'Слишком много попыток. Попробуйте позже.',
    AUTH_RATE_LIMIT_UNAVAILABLE: 'Вход временно недоступен. Попробуйте позже.',
    AUTH_BUSY: 'Сервис занят. Попробуйте позже.',
    PASSWORD_POLICY_VIOLATION:
      'Используйте пароль длиной от 15 до 128 символов.',
    INVALID_CURRENT_PASSWORD: 'Текущий пароль неверен.',
    PASSWORD_UNCHANGED: 'Новый пароль должен отличаться от текущего.',
    INVALID_VERIFICATION_TOKEN:
      'Ссылка неверна или уже использована. Запросите новое письмо.',
    VERIFICATION_TOKEN_EXPIRED: 'Ссылка истекла. Запросите новое письмо.',
    INVALID_PASSWORD_RESET_TOKEN:
      'Ссылка неверна или уже использована. Запросите восстановление повторно.',
    PASSWORD_RESET_TOKEN_EXPIRED:
      'Ссылка истекла. Запросите восстановление повторно.',
    VALIDATION_ERROR: 'Проверьте введённые данные.',
  };
  return (
    messages[error.code] ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.'
  );
}
export function AuthForm({ kind }: { kind: FormKind }) {
  const { client } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const token = useRef('');
  const returnTo = useRef('/account');
  useEffect(() => {
    if (kind === 'login')
      returnTo.current = safeReturnTo(
        new URLSearchParams(window.location.search).get('returnTo'),
        window.location.origin,
      );
    if (kind === 'reset-password' || kind === 'verify-email') {
      if (window.location.hash)
        token.current =
          new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
      // Remove the action credential before submitting; it never enters server URLs.
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [kind]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (
        (kind === 'reset-password' || kind === 'verify-email') &&
        !/^[A-Za-z0-9_-]{43}$/.test(token.current)
      )
        throw new AuthApiError(
          400,
          kind === 'reset-password'
            ? 'INVALID_PASSWORD_RESET_TOKEN'
            : 'INVALID_VERIFICATION_TOKEN',
        );
      const email = String(values.get('email') ?? '');
      if (kind === 'login') {
        await client.login(email, String(values.get('password') ?? ''));
        form.reset();
        router.replace(returnTo.current);
      }
      if (kind === 'register') {
        await client.post('register', {
          email,
          displayName: String(values.get('displayName')),
          password: String(values.get('password')),
        });
        form.reset();
        setSuccess(
          'Аккаунт создан. Подтвердите email по ссылке из письма, затем войдите.',
        );
      }
      if (kind === 'forgot-password') {
        await client.post('password/forgot', { email });
        form.reset();
        setSuccess(
          'Если подходящий аккаунт существует, мы отправим инструкции для восстановления пароля.',
        );
      }
      if (kind === 'reset-password') {
        await client.post('password/reset', {
          token: token.current,
          newPassword: String(values.get('password')),
        });
        token.current = '';
        form.reset();
        setSuccess('Пароль обновлён. Войдите с новым паролем.');
      }
      if (kind === 'verify-email') {
        await client.post('email-verification/confirm', {
          token: token.current,
        });
        token.current = '';
        setSuccess('Email подтверждён. Теперь можно войти.');
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="auth-page">
      <h1>{TITLES[kind]}</h1>
      {kind === 'verify-email' && (
        <p>Нажмите кнопку, чтобы подтвердить email из полученного письма.</p>
      )}
      <form onSubmit={submit} aria-busy={busy} className="auth-form">
        <fieldset
          disabled={busy || Boolean(success && kind !== 'forgot-password')}
        >
          {kind === 'register' && (
            <label>
              Имя
              <input
                name="displayName"
                autoComplete="name"
                required
                maxLength={100}
              />
            </label>
          )}
          {['login', 'register', 'forgot-password'].includes(kind) && (
            <label>
              Email
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
          )}
          {['login', 'register', 'reset-password'].includes(kind) && (
            <label>
              Пароль
              <input
                type="password"
                name="password"
                autoComplete={
                  kind === 'login' ? 'current-password' : 'new-password'
                }
                required
                maxLength={256}
                aria-describedby={
                  kind === 'login' ? undefined : 'password-policy'
                }
              />
            </label>
          )}
          {(kind === 'register' || kind === 'reset-password') && (
            <p id="password-policy">
              От 15 до 128 символов. Можно использовать длинную парольную фразу.
            </p>
          )}
          <button type="submit">
            {busy
              ? 'Выполняем…'
              : kind === 'verify-email'
                ? 'Подтвердить email'
                : kind === 'forgot-password'
                  ? 'Получить инструкции'
                  : kind === 'reset-password'
                    ? 'Сохранить пароль'
                    : TITLES[kind]}
          </button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {success && <p role="status">{success}</p>}
      </form>
      <nav aria-label="Доступ к аккаунту">
        <Link href="/login">Вход</Link>
        <Link href="/register">Регистрация</Link>
        <Link href="/forgot-password">Забыли пароль?</Link>
      </nav>
      {(kind === 'login' || kind === 'verify-email') && <VerificationRequest />}
    </main>
  );
}
function VerificationRequest() {
  const { client } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  return (
    <details>
      <summary>Запросить новое письмо подтверждения</summary>
      <form
        className="auth-form"
        aria-busy={busy}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const email = String(new FormData(form).get('email'));
          setBusy(true);
          setError('');
          setResult('');
          try {
            await client.post('email-verification/request', { email });
            setResult(
              'Если подходящий аккаунт существует, инструкции будут отправлены.',
            );
            form.reset();
          } catch (err) {
            setError(message(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            disabled={busy}
          />
        </label>
        <button disabled={busy}>
          {busy ? 'Отправляем…' : 'Запросить письмо'}
        </button>
        {result && <p role="status">{result}</p>}
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
export function Account() {
  const { client, user, status } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  if (status === 'loading')
    return (
      <main id="main">
        <p role="status">Проверяем сессию…</p>
      </main>
    );
  if (status === 'unavailable')
    return (
      <main id="main">
        <h1>Аккаунт временно недоступен</h1>
        <p role="alert">Не удалось проверить сессию.</p>
        <button
          onClick={() => {
            void client.bootstrap();
          }}
        >
          Повторить
        </button>
      </main>
    );
  if (!user || status !== 'authenticated')
    return (
      <main id="main">
        <h1>Личный кабинет</h1>
        <p>
          Для доступа необходимо <Link href="/login">войти</Link>.
        </p>
      </main>
    );
  async function logout(all: boolean) {
    setBusy(true);
    setError('');
    try {
      await client.logout(all);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="auth-page">
      <h1>Личный кабинет</h1>
      <dl>
        <dt>Имя</dt>
        <dd>{user.displayName}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Роли</dt>
        <dd>{user.roles.join(', ')}</dd>
        <dt>Статус</dt>
        <dd>{user.status}</dd>
      </dl>
      <div className="auth-actions">
        <button
          disabled={busy}
          onClick={() => {
            void logout(false);
          }}
        >
          Выйти
        </button>
        <button
          disabled={busy}
          onClick={() => {
            void logout(true);
          }}
        >
          Выйти на всех устройствах
        </button>
      </div>
      <h2>Сменить пароль</h2>
      <form
        className="auth-form"
        aria-busy={busy}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = new FormData(form);
          setBusy(true);
          setError('');
          setSuccess('');
          try {
            await client.changePassword(
              String(values.get('currentPassword')),
              String(values.get('newPassword')),
            );
            form.reset();
            setSuccess(
              'Пароль изменён. Сессии на других устройствах завершены.',
            );
          } catch (err) {
            setError(message(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Текущий пароль
            <input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          <label>
            Новый пароль
            <input
              type="password"
              name="newPassword"
              autoComplete="new-password"
              required
              maxLength={256}
              aria-describedby="change-policy"
            />
          </label>
          <p id="change-policy">От 15 до 128 символов.</p>
          <button>Сменить пароль</button>
        </fieldset>
        {success && <p role="status">{success}</p>}
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}

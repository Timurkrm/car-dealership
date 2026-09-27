'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthApiError } from '../auth/auth-client';
import { useAuth } from '../auth/auth-provider';
import { WorkspaceApi } from './workspace-api';
import type {
  AdminUserDetail,
  AdminUserSummary,
  AuditItem,
  Role,
} from './workspace-types';
import { safeAuditMetadata } from './workspace-types';

const ACCOUNT_REASONS = [
  'TERMS_VIOLATION',
  'FRAUD_RISK',
  'HARASSMENT',
  'SECURITY_INCIDENT',
  'ADMINISTRATIVE_REVIEW',
  'OTHER',
] as const;

export function AdminUsersScreen() {
  const { client } = useAuth();
  const api = useMemo(() => new WorkspaceApi(client), [client]);
  const abort = useRef<AbortController | null>(null);
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [filters, setFilters] = useState({ status: '', role: '', email: '' });
  const [items, setItems] = useState<AdminUserSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(
    async (append = false) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      try {
        const page = await api.users(
          {
            status: filters.status || undefined,
            role: filters.role || undefined,
            email: filters.email || undefined,
            cursor: append ? (cursor ?? undefined) : undefined,
          },
          controller.signal,
        );
        setItems((current) =>
          append ? [...current, ...page.items] : page.items,
        );
        setCursor(page.page.nextCursor);
        setError('');
      } catch {
        if (!controller.signal.aborted)
          setError('Не удалось загрузить пользователей.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [api, cursor, filters],
  );
  useEffect(() => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    void api
      .users(
        {
          status: filters.status || undefined,
          role: filters.role || undefined,
          email: filters.email || undefined,
        },
        controller.signal,
      )
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setCursor(page.page.nextCursor);
        setError('');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Не удалось загрузить пользователей.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => abort.current?.abort();
  }, [api, filters]);
  return (
    <main id="main" className="workspace-page">
      <h1>Пользователи</h1>
      <form
        className="workspace-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          setCursor(null);
          setFilters({ status, role, email: email.trim() });
        }}
      >
        <label>
          Статус
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Все</option>
            <option>ACTIVE</option>
            <option>PENDING_VERIFICATION</option>
            <option>SUSPENDED</option>
            <option>BLOCKED</option>
          </select>
        </label>
        <label>
          Роль
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">Все</option>
            <option>USER</option>
            <option>MODERATOR</option>
            <option>ADMIN</option>
          </select>
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button type="submit">Применить</button>
        <button type="button" onClick={() => void load(false)}>
          Обновить
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {loading && items.length === 0 ? <p role="status">Загрузка…</p> : null}
      {!loading && !items.length ? <p>Пользователи не найдены.</p> : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Email</th>
              <th>Статус</th>
              <th>Роли</th>
              <th>Создан</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/admin/users/${item.id}`}>
                    {item.displayName}
                  </Link>
                </td>
                <td>{item.email}</td>
                <td>{item.status}</td>
                <td>{item.roles.join(', ')}</td>
                <td>{new Date(item.createdAt).toLocaleDateString('ru-RU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cursor ? (
        <button disabled={loading} onClick={() => void load(true)}>
          Загрузить ещё
        </button>
      ) : null}
    </main>
  );
}

export function AdminUserDetailScreen({ id }: { id: string }) {
  const { client, user: actor } = useAuth();
  const api = useMemo(() => new WorkspaceApi(client), [client]);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [reasonCode, setReasonCode] = useState<
    (typeof ACCOUNT_REASONS)[number]
  >('ADMINISTRATIVE_REVIEW');
  const [note, setNote] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const value = await api.user(id, signal);
        setUser(value);
        setRoles(value.roles);
        setError('');
      } catch {
        if (!signal?.aborted) setError('Не удалось загрузить пользователя.');
      }
    },
    [api, id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void api
      .user(id, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setUser(value);
        setRoles(value.roles);
        setError('');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Не удалось загрузить пользователя.');
      });
    return () => controller.abort();
  }, [api, id]);
  const statusAction = async (action: 'suspend' | 'block' | 'reactivate') => {
    if (!user || !note.trim()) {
      setError('Укажите причину действия.');
      return;
    }
    if (
      !window.confirm(
        `${action === 'block' ? 'Заблокировать' : action === 'suspend' ? 'Приостановить' : 'Активировать'} аккаунт ${user.displayName}?`,
      )
    )
      return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.userStatus(id, action, {
        expectedStatus: user.status,
        reasonCode,
        note: note.trim(),
      });
      setUser(updated);
      setRoles(updated.roles);
      setNotice('Статус обновлён. Старые сессии не восстанавливаются.');
    } catch (actionError) {
      setError(
        actionError instanceof AuthApiError &&
          [
            'USER_STATUS_CONFLICT',
            'LAST_ADMIN_PROTECTION',
            'SELF_ADMIN_ACTION_FORBIDDEN',
          ].includes(actionError.code)
          ? 'Действие отклонено: состояние изменилось или сработала защита администратора.'
          : 'Не удалось изменить статус.',
      );
      await load();
    } finally {
      setBusy(false);
    }
  };
  const saveRoles = async () => {
    if (!user) return;
    if (!roles.includes('USER')) {
      setError('Базовая роль USER обязательна.');
      return;
    }
    const grantsAdmin =
      !user.roles.includes('ADMIN') && roles.includes('ADMIN');
    if (
      !window.confirm(
        grantsAdmin
          ? `Выдать ADMIN пользователю ${user.displayName}?`
          : 'Сохранить роли пользователя?',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const updated = await api.roles(id, roles, user.roles);
      setUser(updated);
      setRoles(updated.roles);
      setNotice('Роли обновлены.');
    } catch {
      setError(
        'Не удалось изменить роли. Возможно, сработала защита последнего ADMIN.',
      );
      await load();
    } finally {
      setBusy(false);
    }
  };
  if (!user)
    return (
      <main id="main" className="workspace-page">
        <h1>Пользователь</h1>
        <p role={error ? 'alert' : 'status'}>{error || 'Загрузка…'}</p>
      </main>
    );
  return (
    <main id="main" className="workspace-page">
      <Link href="/admin/users">← К пользователям</Link>
      <h1>{user.displayName}</h1>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <section>
        <h2>Аккаунт</h2>
        <dl className="workspace-definition">
          <div>
            <dt>ID</dt>
            <dd>{user.id}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Статус</dt>
            <dd>{user.status}</dd>
          </div>
          <div>
            <dt>Активные сессии</dt>
            <dd>{user.activeSessionCount}</dd>
          </div>
        </dl>
      </section>
      <section>
        <h2>Объявления</h2>
        {user.listingCounts.length ? (
          <ul>
            {user.listingCounts.map((row) => (
              <li key={`${row.type}-${row.status}`}>
                {row.type} · {row.status}: {row.count}
              </li>
            ))}
          </ul>
        ) : (
          <p>Нет объявлений.</p>
        )}
      </section>
      <section className="decision-panel">
        <h2>Статус аккаунта</h2>
        <label>
          Причина
          <select
            value={reasonCode}
            onChange={(event) =>
              setReasonCode(
                event.target.value as (typeof ACCOUNT_REASONS)[number],
              )
            }
          >
            {ACCOUNT_REASONS.map((reason) => (
              <option key={reason}>{reason}</option>
            ))}
          </select>
        </label>
        <label>
          Внутренняя заметка
          <textarea
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {user.status === 'ACTIVE' && actor?.id !== user.id ? (
          <>
            <button
              disabled={busy}
              onClick={() => void statusAction('suspend')}
            >
              Приостановить
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => void statusAction('block')}
            >
              Заблокировать
            </button>
          </>
        ) : null}
        {user.status === 'SUSPENDED' ? (
          <>
            <button
              disabled={busy}
              onClick={() => void statusAction('reactivate')}
            >
              Активировать
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => void statusAction('block')}
            >
              Заблокировать
            </button>
          </>
        ) : null}
        {user.status === 'BLOCKED' ? (
          <button
            disabled={busy}
            onClick={() => void statusAction('reactivate')}
          >
            Активировать
          </button>
        ) : null}
      </section>
      <section className="decision-panel">
        <h2>Роли</h2>
        {(['USER', 'MODERATOR', 'ADMIN'] as Role[]).map((role) => (
          <label className="checkbox-label" key={role}>
            <input
              type="checkbox"
              checked={roles.includes(role)}
              disabled={
                role === 'USER' || (role === 'ADMIN' && actor?.id === user.id)
              }
              onChange={(event) =>
                setRoles((current) =>
                  event.target.checked
                    ? [...current, role]
                    : current.filter((item) => item !== role),
                )
              }
            />
            {role}
          </label>
        ))}
        <button disabled={busy} onClick={() => void saveRoles()}>
          Сохранить роли
        </button>
      </section>
      <section>
        <h2>Недавний аудит</h2>
        <AuditTable items={user.recentAudit} />
      </section>
    </main>
  );
}

export function AdminAuditScreen() {
  const { client } = useAuth();
  const api = useMemo(() => new WorkspaceApi(client), [client]);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [filters, setFilters] = useState({ action: '', targetType: '' });
  const [items, setItems] = useState<AuditItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(
    async (append = false, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const page = await api.audit(
          {
            action: filters.action || undefined,
            targetType: filters.targetType || undefined,
            cursor: append ? (cursor ?? undefined) : undefined,
          },
          signal,
        );
        setItems((current) =>
          append ? [...current, ...page.items] : page.items,
        );
        setCursor(page.page.nextCursor);
        setError('');
      } catch {
        if (!signal?.aborted) setError('Не удалось загрузить аудит.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [api, cursor, filters],
  );
  useEffect(() => {
    const controller = new AbortController();
    void api
      .audit(
        {
          action: filters.action || undefined,
          targetType: filters.targetType || undefined,
        },
        controller.signal,
      )
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setCursor(page.page.nextCursor);
        setError('');
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Не удалось загрузить аудит.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, filters]);
  return (
    <main id="main" className="workspace-page">
      <h1>Аудит безопасности</h1>
      <form
        className="workspace-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          setCursor(null);
          setFilters({ action: action.trim(), targetType: targetType.trim() });
        }}
      >
        <label>
          Action
          <input
            value={action}
            pattern="[A-Z][A-Z0-9_]*"
            onChange={(event) => setAction(event.target.value.toUpperCase())}
          />
        </label>
        <label>
          Target type
          <input
            value={targetType}
            pattern="[A-Z][A-Z0-9_]*"
            onChange={(event) =>
              setTargetType(event.target.value.toUpperCase())
            }
          />
        </label>
        <button type="submit">Применить</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {loading && !items.length ? <p role="status">Загрузка…</p> : null}
      <AuditTable items={items} />
      {cursor ? (
        <button disabled={loading} onClick={() => void load(true)}>
          Загрузить ещё
        </button>
      ) : null}
    </main>
  );
}

function AuditTable({ items }: { items: AuditItem[] }) {
  if (!items.length) return <p>Записей нет.</p>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Время</th>
            <th>Действие</th>
            <th>Актор</th>
            <th>Цель</th>
            <th>Контекст</th>
            <th>Request ID</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{new Date(item.createdAt).toLocaleString('ru-RU')}</td>
              <td>{item.action}</td>
              <td>{item.actorUserId ?? 'system'}</td>
              <td>
                {item.targetType} · {item.targetId}
              </td>
              <td>{safeAuditMetadata(item)}</td>
              <td>{item.requestId ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

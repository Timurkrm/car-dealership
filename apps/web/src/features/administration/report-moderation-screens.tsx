'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthApiError } from '../auth/auth-client';
import { useAuth } from '../auth/auth-provider';
import { WorkspaceApi } from './workspace-api';
import type { ReportDetail, ReportSummary } from './workspace-types';

export function ReportQueueScreen() {
  const { client } = useAuth();
  const api = useMemo(() => new WorkspaceApi(client), [client]);
  const abort = useRef<AbortController | null>(null);
  const [status, setStatus] = useState('OPEN');
  const [targetType, setTargetType] = useState('');
  const [items, setItems] = useState<ReportSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (append = false) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      setError('');
      try {
        const page = await api.reportQueue(
          {
            status,
            targetType: targetType || undefined,
            cursor: append ? (cursor ?? undefined) : undefined,
          },
          controller.signal,
        );
        setItems((current) =>
          append ? [...current, ...page.items] : page.items,
        );
        setCursor(page.page.nextCursor);
      } catch {
        if (!controller.signal.aborted)
          setError('Не удалось загрузить жалобы.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [api, cursor, status, targetType],
  );
  useEffect(() => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    void api
      .reportQueue(
        { status, targetType: targetType || undefined },
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
          setError('Не удалось загрузить жалобы.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => abort.current?.abort();
  }, [api, status, targetType]);

  return (
    <main id="main" className="workspace-page">
      <h1>Жалобы</h1>
      <div className="workspace-filters">
        <label>
          Статус
          <select
            value={status}
            onChange={(event) => {
              setLoading(true);
              setStatus(event.target.value);
            }}
          >
            <option>OPEN</option>
            <option>IN_REVIEW</option>
            <option>RESOLVED</option>
            <option>DISMISSED</option>
          </select>
        </label>
        <label>
          Цель
          <select
            value={targetType}
            onChange={(event) => {
              setLoading(true);
              setTargetType(event.target.value);
            }}
          >
            <option value="">Все</option>
            <option>LISTING</option>
            <option>USER</option>
            <option>MESSAGE</option>
          </select>
        </label>
        <button type="button" onClick={() => void load(false)}>
          Обновить
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {loading && items.length === 0 ? <p role="status">Загрузка…</p> : null}
      {!loading && items.length === 0 ? <p>Жалоб нет.</p> : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Создана</th>
              <th>Цель</th>
              <th>Причина</th>
              <th>Автор</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/moderation/reports/${item.id}`}>
                    {new Date(item.createdAt).toLocaleString('ru-RU')}
                  </Link>
                </td>
                <td>{item.targetType}</td>
                <td>{item.reason}</td>
                <td>{item.reporter.displayName}</td>
                <td>{item.status}</td>
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

export function ReportDetailScreen({ id }: { id: string }) {
  const { client } = useAuth();
  const api = useMemo(() => new WorkspaceApi(client), [client]);
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [outcome, setOutcome] = useState<'RESOLVED' | 'DISMISSED'>('RESOLVED');
  const [resolution, setResolution] = useState('NO_ACTION');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setReport(await api.report(id, signal));
        setError('');
      } catch {
        if (!signal?.aborted) setError('Не удалось загрузить жалобу.');
      }
    },
    [api, id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void api
      .report(id, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setReport(value);
        setError('');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Не удалось загрузить жалобу.');
      });
    return () => controller.abort();
  }, [api, id]);
  const resolve = async () => {
    if (!report) return;
    if (
      !window.confirm(
        outcome === 'DISMISSED'
          ? 'Отклонить жалобу без действия?'
          : resolution === 'CONTENT_REMOVED'
            ? 'Разрешить жалобу и снять объявление?'
            : 'Завершить рассмотрение?',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const targetVersion =
        typeof report.target?.version === 'number'
          ? report.target.version
          : undefined;
      setReport(
        await api.resolveReport(id, {
          outcome,
          resolution: outcome === 'DISMISSED' ? 'NO_ACTION' : resolution,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(resolution === 'CONTENT_REMOVED' && targetVersion
            ? { targetVersion }
            : {}),
        }),
      );
      setNotice('Жалоба рассмотрена.');
    } catch (resolveError) {
      setError(
        resolveError instanceof AuthApiError &&
          resolveError.code === 'REPORT_ALREADY_RESOLVED'
          ? 'Жалоба уже рассмотрена другим сотрудником.'
          : 'Не удалось сохранить решение.',
      );
      await load();
    } finally {
      setBusy(false);
    }
  };
  if (!report)
    return (
      <main id="main" className="workspace-page">
        <h1>Жалоба</h1>
        <p role={error ? 'alert' : 'status'}>{error || 'Загрузка…'}</p>
      </main>
    );
  return (
    <main id="main" className="workspace-page">
      <Link href="/moderation/reports">← К жалобам</Link>
      <h1>Жалоба {report.id}</h1>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <section>
        <h2>Жалоба</h2>
        <dl className="workspace-definition">
          <div>
            <dt>Цель</dt>
            <dd>
              {report.targetType} · {report.targetId}
            </dd>
          </div>
          <div>
            <dt>Причина</dt>
            <dd>{report.reason}</dd>
          </div>
          <div>
            <dt>Описание</dt>
            <dd>{report.details ?? '—'}</dd>
          </div>
          <div>
            <dt>Автор</dt>
            <dd>{report.reporter.displayName}</dd>
          </div>
          <div>
            <dt>Связанные жалобы</dt>
            <dd>{report.relatedReports}</dd>
          </div>
        </dl>
      </section>
      <section>
        <h2>Контекст цели</h2>
        <TargetSummary value={report.target} />
      </section>
      <section>
        <h2>История</h2>
        {report.moderationHistory.length ? (
          <ul>
            {report.moderationHistory.map((item) => (
              <li key={item.id}>
                {item.action} · {item.reasonCode} ·{' '}
                {new Date(item.createdAt).toLocaleString('ru-RU')}
              </li>
            ))}
          </ul>
        ) : (
          <p>Нет действий.</p>
        )}
      </section>
      {report.status === 'OPEN' || report.status === 'IN_REVIEW' ? (
        <section className="decision-panel">
          <h2>Решение</h2>
          <label>
            Исход
            <select
              value={outcome}
              onChange={(event) =>
                setOutcome(event.target.value as 'RESOLVED' | 'DISMISSED')
              }
            >
              <option value="RESOLVED">Рассмотрена</option>
              <option value="DISMISSED">Отклонена</option>
            </select>
          </label>
          {outcome === 'RESOLVED' ? (
            <label>
              Результат
              <select
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
              >
                <option>NO_ACTION</option>
                <option>CONTENT_REMOVED</option>
                <option>WARNING</option>
                <option>OTHER</option>
              </select>
            </label>
          ) : null}
          <label>
            Внутренняя заметка
            <textarea
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button
            className={resolution === 'CONTENT_REMOVED' ? 'danger-button' : ''}
            disabled={busy}
            onClick={() => void resolve()}
          >
            Сохранить решение
          </button>
        </section>
      ) : (
        <p>Итог: {report.resolution}</p>
      )}
    </main>
  );
}

function TargetSummary({ value }: { value: Record<string, unknown> | null }) {
  if (!value) return <p>Цель недоступна.</p>;
  const keys = [
    'id',
    'type',
    'title',
    'status',
    'displayName',
    'version',
    'reportedMessageId',
    'conversationId',
  ];
  return (
    <dl className="workspace-definition">
      {keys.flatMap((key) => {
        const item = value[key];
        return typeof item === 'string' ||
          typeof item === 'number' ||
          typeof item === 'boolean'
          ? [
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(item)}</dd>
              </div>,
            ]
          : [];
      })}
    </dl>
  );
}

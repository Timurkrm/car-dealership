'use client';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { MediaClient, uploadDirect } from './media-client';
import type { MediaList } from './media-client';
import {
  failureMessage,
  moved,
  processing,
  validateFiles,
} from './media-model';
import { ListingError } from '../listings/listing-feedback';
interface LocalUpload {
  id: string;
  name: string;
  percent: number;
  status: 'QUEUED' | 'UPLOADING' | 'PROCESSING' | 'FAILED';
}
export function MediaEditor({
  listingId,
  editable,
}: {
  listingId: string;
  editable: boolean;
}) {
  const { client } = useAuth(),
    api = useMemo(() => new MediaClient(client), [client]);
  const [data, setData] = useState<MediaList | null>(null),
    [uploads, setUploads] = useState<LocalUpload[]>([]);
  const [error, setError] = useState<unknown>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const controllers = useRef(new Set<AbortController>());
  const selecting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api.list(listingId, controller.signal);
        if (!controller.signal.aborted) {
          setData(result);
          setError(null);
          timer = setTimeout(
            () => void poll(),
            processing(result.items) ? 5000 : 240000,
          );
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure);
          timer = setTimeout(() => void poll(), 15000);
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, listingId, reload]);
  useEffect(() => {
    const active = controllers.current;
    return () => {
      for (const controller of active) controller.abort();
    };
  }, []);
  async function select(files: File[]) {
    if (!data || !editable || selecting.current || !files.length) return;
    const validation = validateFiles(files, data.items.length, data.limits);
    if (validation) {
      setMessage(validation);
      return;
    }
    selecting.current = true;
    setMessage('');
    setError(null);
    const jobs = files.map((file) => ({ file, id: crypto.randomUUID() }));
    setUploads(
      jobs.map((job) => ({
        id: job.id,
        name: job.file.name,
        percent: 0,
        status: 'QUEUED',
      })),
    );
    const update = (id: string, changes: Partial<LocalUpload>) =>
      setUploads((current) =>
        current.map((row) => (row.id === id ? { ...row, ...changes } : row)),
      );
    let index = 0;
    const work = async () => {
      while (index < jobs.length) {
        const job = jobs[index++]!,
          controller = new AbortController();
        controllers.current.add(controller);
        try {
          update(job.id, { status: 'UPLOADING' });
          const intent = await api.initialize(
            listingId,
            job.file,
            controller.signal,
          );
          await uploadDirect(
            intent.url,
            intent.contentType,
            job.file,
            (percent) => update(job.id, { percent }),
            controller.signal,
          );
          await api.mutate(
            listingId,
            'complete',
            intent.mediaId,
            undefined,
            controller.signal,
          );
          if (!controller.signal.aborted) {
            update(job.id, { status: 'PROCESSING', percent: 100 });
            setReload((value) => value + 1);
          }
        } catch (failure) {
          if (!controller.signal.aborted) {
            update(job.id, { status: 'FAILED' });
            setError(failure);
            setMessage(
              'Не удалось загрузить файл. Незавершённую загрузку можно удалить ниже.',
            );
            setReload((value) => value + 1);
          }
        } finally {
          controllers.current.delete(controller);
        }
        if (controller.signal.aborted) break;
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, work));
    selecting.current = false;
    setUploads((current) => current.filter((row) => row.status === 'FAILED'));
  }
  async function mutate(work: () => Promise<MediaList | null>) {
    if (busy || selecting.current) return;
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      const result = await work();
      if (!result) return;
      setData(result);
      setMessage('Фотографии обновлены.');
      setReload((value) => value + 1);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const disabled =
    busy ||
    uploads.some(
      (row) => row.status === 'UPLOADING' || row.status === 'QUEUED',
    );
  return (
    <section aria-labelledby="media-heading">
      <h2 id="media-heading">Фотографии</h2>
      <ListingError error={error} />
      {message && <p role="status">{message}</p>}
      {!data ? (
        <p role="status">Загружаем фотографии…</p>
      ) : (
        <>
          <p>
            {data.items.length} / {data.limits.maxImages}. JPEG, PNG, WebP. До{' '}
            {Math.floor(data.limits.maxFileSize / 1048576)} МБ.
          </p>
          {editable ? (
            <div
              className="media-drop"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (!disabled)
                  void select(Array.from(event.dataTransfer.files));
              }}
            >
              <label>
                Добавить фотографии{' '}
                <input
                  type="file"
                  multiple
                  accept={data.limits.supportedTypes.join(',')}
                  disabled={
                    disabled || data.items.length >= data.limits.maxImages
                  }
                  onChange={(event) => {
                    void select(Array.from(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
              </label>
              <p>Или перетащите фотографии сюда.</p>
            </div>
          ) : (
            <p>В этом статусе фотографии доступны только для просмотра.</p>
          )}
          <ul aria-live="polite">
            {uploads.map((row) => (
              <li key={row.id}>
                {row.name}:{' '}
                {row.status === 'FAILED'
                  ? 'Ошибка загрузки'
                  : row.status === 'PROCESSING'
                    ? 'Обработка'
                    : `Загрузка ${row.percent}%`}
                <progress
                  value={row.percent}
                  max={100}
                  aria-label={`Загрузка ${row.name}`}
                />
              </li>
            ))}
          </ul>
          <ol className="media-grid">
            {data.items.map((photo, index) => (
              <li key={photo.id}>
                {photo.variants && (
                  <Image
                    unoptimized
                    src={photo.variants.thumbnail.url}
                    width={photo.variants.thumbnail.width}
                    height={photo.variants.thumbnail.height}
                    alt={`Фотография ${index + 1}`}
                  />
                )}
                <p>
                  {photo.isPrimary ? 'Главное фото' : `Фото ${index + 1}`}:{' '}
                  {photo.status === 'READY'
                    ? 'Готово'
                    : photo.status === 'FAILED'
                      ? failureMessage(photo.failureCode)
                      : photo.status === 'PENDING'
                        ? 'Ожидает загрузки'
                        : 'Обрабатывается…'}
                </p>
                {editable && (
                  <div className="auth-actions">
                    <button
                      disabled={disabled || index === 0}
                      aria-label={`Переместить фото ${index + 1} выше`}
                      onClick={() =>
                        void mutate(() =>
                          api.mutate(
                            listingId,
                            'order',
                            undefined,
                            moved(
                              data.items.map((row) => row.id),
                              photo.id,
                              -1,
                            ),
                          ),
                        )
                      }
                    >
                      Выше
                    </button>
                    <button
                      disabled={disabled || index === data.items.length - 1}
                      aria-label={`Переместить фото ${index + 1} ниже`}
                      onClick={() =>
                        void mutate(() =>
                          api.mutate(
                            listingId,
                            'order',
                            undefined,
                            moved(
                              data.items.map((row) => row.id),
                              photo.id,
                              1,
                            ),
                          ),
                        )
                      }
                    >
                      Ниже
                    </button>
                    <button
                      disabled={
                        disabled || photo.status !== 'READY' || photo.isPrimary
                      }
                      onClick={() =>
                        void mutate(() =>
                          api.mutate(listingId, 'primary', photo.id),
                        )
                      }
                    >
                      Сделать главным
                    </button>
                    <button
                      disabled={disabled}
                      onClick={() => {
                        void mutate(() =>
                          api.deleteConfirmed(listingId, photo.id, () =>
                            window.confirm('Удалить эту фотографию?'),
                          ),
                        );
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <button
            disabled={disabled}
            onClick={() => setReload((value) => value + 1)}
          >
            Обновить фотографии
          </button>
        </>
      )}
    </section>
  );
}

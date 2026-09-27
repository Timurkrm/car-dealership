'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { AccountClient, type NotificationPreferences } from './account-client';

export function NotificationSettingsScreen() {
  const { client } = useAuth();
  const api = useMemo(() => new AccountClient(client), [client]);
  const [value, setValue] = useState<NotificationPreferences | null>(null);
  const [saved, setSaved] = useState<NotificationPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api
      .preferences(controller.signal)
      .then((preferences) => {
        setValue(preferences);
        setSaved(preferences);
      })
      .catch(
        () =>
          !controller.signal.aborted &&
          setError('Не удалось загрузить настройки.'),
      );
    return () => controller.abort();
  }, [api]);
  if (!value)
    return (
      <p role={error ? 'alert' : 'status'}>{error || 'Загружаем настройки…'}</p>
    );
  const toggle = (key: keyof Omit<NotificationPreferences, 'securityEmail'>) =>
    setValue((current) =>
      current ? { ...current, [key]: !current[key] } : current,
    );
  return (
    <form
      className="settings-panel preference-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setMessage('');
        try {
          const updated = await api.updatePreferences({
            messagesEmail: value.messagesEmail,
            savedSearchesEmail: value.savedSearchesEmail,
            favoritesEmail: value.favoritesEmail,
            moderationEmail: value.moderationEmail,
          });
          setValue(updated);
          setSaved(updated);
          setMessage('Настройки сохранены.');
        } catch {
          setValue(saved);
          setError('Не удалось сохранить настройки. Изменения отменены.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <legend>Письма о событиях</legend>
        <label>
          <input
            type="checkbox"
            checked={value.messagesEmail}
            onChange={() => toggle('messagesEmail')}
          />{' '}
          Новые сообщения
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.savedSearchesEmail}
            onChange={() => toggle('savedSearchesEmail')}
          />{' '}
          Совпадения сохранённых поисков
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.favoritesEmail}
            onChange={() => toggle('favoritesEmail')}
          />{' '}
          Статусы избранных объявлений
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.moderationEmail}
            onChange={() => toggle('moderationEmail')}
          />{' '}
          Результаты модерации
        </label>
        <label>
          <input type="checkbox" checked disabled /> Письма безопасности —
          всегда включены
        </label>
        <button>Сохранить</button>
      </fieldset>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

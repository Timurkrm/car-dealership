import Link from 'next/link';

export function AccountNavigation() {
  return (
    <nav className="account-navigation" aria-label="Разделы аккаунта">
      <Link href="/account/profile">Профиль</Link>
      <Link href="/account/security">Безопасность</Link>
      <Link href="/account/listings">Объявления</Link>
      <Link href="/account/favorites">Избранное</Link>
      <Link href="/account/saved-searches">Сохранённые поиски</Link>
      <Link href="/account/messages">Сообщения</Link>
      <Link href="/account/notifications">Уведомления</Link>
      <Link href="/account/notifications/settings">Настройки уведомлений</Link>
    </nav>
  );
}

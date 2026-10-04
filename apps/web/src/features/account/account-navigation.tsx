import Link from 'next/link';
import { WorkspaceNavigation } from '../administration/workspace-navigation';

export function AccountNavigation() {
  return (
    <nav className="account-navigation" aria-label="Разделы аккаунта">
      <Link prefetch={false} href="/account/profile">
        Профиль
      </Link>
      <Link prefetch={false} href="/account/security">
        Безопасность
      </Link>
      <Link prefetch={false} href="/account/listings">
        Объявления
      </Link>
      <Link prefetch={false} href="/account/favorites">
        Избранное
      </Link>
      <Link prefetch={false} href="/account/saved-searches">
        Сохранённые поиски
      </Link>
      <Link prefetch={false} href="/account/messages">
        Сообщения
      </Link>
      <Link prefetch={false} href="/account/notifications">
        Уведомления
      </Link>
      <Link prefetch={false} href="/account/notifications/settings">
        Настройки уведомлений
      </Link>
      <WorkspaceNavigation />
    </nav>
  );
}

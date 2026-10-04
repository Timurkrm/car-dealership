'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { useAuth } from '../auth/auth-provider';
import { useUnreadCounts } from '../engagement/use-unread-counts';
import { AccountLogout } from '../account/account-logout';
import { WorkspaceNavigation } from '../administration/workspace-navigation';
import { Button, ButtonLink, IconButton } from '../../components/ui/button';
import { Icon } from '../../components/ui/icon';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/loading';
import { Container } from '../../components/ui/layout';
import { Dialog } from '../../components/ui/dialog';
import {
  boundedUnread,
  isAuthRoute,
  isNavigationActive,
  unreadLabel,
} from './navigation-model';

export function PersonalLink({
  href,
  label,
  icon,
  count = null,
  expanded = false,
}: {
  href: string;
  label: string;
  icon: ComponentProps<typeof Icon>['name'];
  count?: number | null;
  expanded?: boolean;
}) {
  const value = boundedUnread(count);
  return (
    <Link
      prefetch={false}
      href={href}
      className={`shell-personal-link${expanded ? ' shell-personal-link--expanded' : ''}`}
      aria-label={unreadLabel(label, count)}
      title={expanded ? undefined : label}
    >
      <Icon name={icon} />
      <span className={expanded ? '' : 'visually-hidden'}>{label}</span>
      {value && (
        <Badge tone="danger" className="shell-unread" aria-hidden="true">
          {value}
        </Badge>
      )}
    </Link>
  );
}

export function GlobalHeader() {
  const path = usePathname();
  const { client, user, status } = useAuth();
  const unread = useUnreadCounts();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const open = openPath === path;
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 64rem)');
    const resize = () => {
      if (desktop.matches) setOpenPath(null);
    };
    const close = () => setOpenPath(null);
    desktop.addEventListener('change', resize);
    window.addEventListener('popstate', close);
    return () => {
      desktop.removeEventListener('change', resize);
      window.removeEventListener('popstate', close);
    };
  }, []);
  const auth = status === 'authenticated' && user;
  const primary = (
    <>
      <Link
        prefetch={false}
        href="/cars"
        aria-current={isNavigationActive(path, '/cars') ? 'page' : undefined}
      >
        Автомобили
      </Link>
      <Link
        prefetch={false}
        href="/parts"
        aria-current={isNavigationActive(path, '/parts') ? 'page' : undefined}
      >
        Запчасти
      </Link>
    </>
  );
  const personal = (expanded: boolean) => (
    <>
      <PersonalLink
        href="/account/favorites"
        label="Избранное"
        icon="heart"
        expanded={expanded}
      />
      <PersonalLink
        href="/account/messages"
        label="Сообщения"
        icon="message"
        count={unread.messages}
        expanded={expanded}
      />
      <PersonalLink
        href="/account/notifications"
        label="Уведомления"
        icon="bell"
        count={unread.notifications}
        expanded={expanded}
      />
    </>
  );
  return (
    <>
      <header className="shell-header">
        <Container width="public" className="shell-header-inner">
          <Link
            prefetch={false}
            href="/"
            className="shell-logo"
            aria-label="Automotive Marketplace — Главная"
          >
            Automotive<span> Marketplace</span>
          </Link>
          {isAuthRoute(path) ? (
            <Link prefetch={false} href="/" className="shell-back">
              На главную
            </Link>
          ) : (
            <>
              <nav
                aria-label="Основная навигация"
                className="shell-desktop shell-primary"
              >
                {primary}
              </nav>
              <ButtonLink
                href="/sell"
                size="md"
                className="shell-desktop shell-sell"
              >
                <Icon name="plus" />
                Продать
              </ButtonLink>
              <nav
                aria-label="Личный раздел"
                className="shell-desktop shell-account"
              >
                {status === 'loading' ? (
                  <div
                    className="shell-auth-loading"
                    role="group"
                    aria-label="Проверяем вход"
                    aria-busy="true"
                  >
                    <Skeleton />
                    <Skeleton />
                  </div>
                ) : auth ? (
                  <>
                    {personal(false)}
                    <Link
                      prefetch={false}
                      href="/account"
                      className="shell-account-link"
                      aria-label="Аккаунт"
                      title={user.displayName}
                    >
                      <Icon name="user" />
                      <span>{user.displayName}</span>
                    </Link>
                  </>
                ) : status === 'unavailable' ? (
                  <Button
                    variant="ghost"
                    onClick={() => void client.bootstrap()}
                  >
                    Повторить проверку входа
                  </Button>
                ) : (
                  <>
                    <ButtonLink href="/login" variant="ghost">
                      Вход
                    </ButtonLink>
                    <ButtonLink href="/register" variant="outline">
                      Регистрация
                    </ButtonLink>
                  </>
                )}
              </nav>
              <div className="shell-mobile shell-mobile-actions">
                {auth && (
                  <PersonalLink
                    href="/account/favorites"
                    label="Избранное"
                    icon="heart"
                  />
                )}
                <IconButton
                  ref={trigger}
                  label="Открыть меню"
                  aria-expanded={open}
                  aria-controls="marketplace-menu"
                  onClick={() => setOpenPath(path)}
                >
                  <Icon name="menu" />
                </IconButton>
              </div>
            </>
          )}
        </Container>
      </header>
      {!isAuthRoute(path) && (
        <Dialog
          id="marketplace-menu"
          variant="drawer"
          closeOnBackdrop
          open={open}
          onClose={() => setOpenPath(null)}
          returnFocusRef={trigger}
          title="Меню"
        >
          <nav
            aria-label="Мобильная навигация"
            className="shell-drawer-nav"
            onClick={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest('a[href]')
              )
                setOpenPath(null);
            }}
          >
            <div className="shell-drawer-group shell-primary">
              {primary}
              <ButtonLink href="/sell">
                <Icon name="plus" />
                Продать
              </ButtonLink>
            </div>
            {status === 'loading' ? (
              <div role="group" aria-label="Проверяем вход" aria-busy="true">
                <Skeleton />
              </div>
            ) : auth ? (
              <>
                <div className="shell-drawer-group">
                  {personal(true)}
                  <Link prefetch={false} href="/account/listings">
                    Мои объявления
                  </Link>
                  <Link
                    prefetch={false}
                    href="/account"
                    className="shell-drawer-account"
                    aria-label="Аккаунт"
                  >
                    <Icon name="user" />
                    <span>
                      Аккаунт
                      <span className="ui-metadata">{user.displayName}</span>
                    </span>
                  </Link>
                  <Link prefetch={false} href="/account/saved-searches">
                    Сохранённые поиски
                  </Link>
                </div>
                <div className="shell-drawer-group">
                  <WorkspaceNavigation />
                  <AccountLogout />
                </div>
              </>
            ) : status === 'unavailable' ? (
              <Button variant="outline" onClick={() => void client.bootstrap()}>
                Повторить проверку входа
              </Button>
            ) : (
              <div className="shell-drawer-group">
                <ButtonLink href="/login">Вход</ButtonLink>
                <ButtonLink href="/register" variant="outline">
                  Регистрация
                </ButtonLink>
              </div>
            )}
          </nav>
        </Dialog>
      )}
    </>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { useAuth } from '../auth/auth-provider';
import { loginHref } from '../auth/auth-return';
import { useFavoriteState } from './favorite-provider';
import { Button, IconButton } from '../../components/ui/button';
import { Icon } from '../../components/ui/icon';
export function FavoriteButton({
  listingId,
  variant = 'text',
  removeOnly = false,
  onRemoved,
}: {
  listingId: string;
  variant?: 'text' | 'icon';
  removeOnly?: boolean;
  onRemoved?: () => void;
}) {
  const { status } = useAuth();
  const pathname = usePathname();
  const store = useFavoriteState();
  const state = useSyncExternalStore(
    store.subscribe,
    () => store.read(listingId),
    store.serverSnapshot,
  );
  const saved = removeOnly || state.value === true;
  const label = saved ? 'Удалить из избранного' : 'Добавить в избранное';
  const icon = (
    <Icon name="heart" className={saved ? 'favorite-heart--saved' : ''} />
  );
  if (status === 'anonymous')
    return (
      <Link
        prefetch={false}
        href={loginHref(pathname)}
        className={variant === 'icon' ? 'favorite-login' : undefined}
        aria-label="Войти, чтобы добавить в избранное"
      >
        {variant === 'icon' ? icon : 'Войти, чтобы добавить в избранное'}
      </Link>
    );
  if (status !== 'authenticated')
    return variant === 'icon' ? (
      <IconButton label="Избранное недоступно до проверки входа" disabled>
        {icon}
      </IconButton>
    ) : null;
  async function toggle() {
    if (await store.set(listingId, !saved)) {
      if (saved) onRemoved?.();
    }
  }
  const props = {
    disabled: state.pending,
    loading: state.pending,
    'aria-pressed': state.value === null && !removeOnly ? undefined : saved,
    onClick: () => void toggle(),
  };
  return (
    <span className="favorite-control">
      {variant === 'icon' ? (
        <IconButton label={label} {...props}>
          {icon}
        </IconButton>
      ) : (
        <Button variant="outline" {...props}>
          {label}
        </Button>
      )}
      {state.error && (
        <span className="favorite-error" role="alert">
          Не удалось сохранить. Попробуйте ещё раз.
        </span>
      )}
    </span>
  );
}

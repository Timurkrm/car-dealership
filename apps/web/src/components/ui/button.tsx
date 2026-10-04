import type { ComponentProps, ReactNode } from 'react';
import { Spinner } from './loading';
import Link from 'next/link';

export type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
    >
      <span className="ui-button-label">{children}</span>
      {loading && (
        <span className="ui-button-progress">
          <Spinner />
        </span>
      )}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: Omit<ButtonProps, 'children' | 'aria-label'> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      {...props}
      aria-label={label}
      className={`ui-icon-button ${className}`}
    >
      {children}
    </Button>
  );
}

/** Navigation shares Button visuals while retaining link semantics. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}) {
  return (
    <Link
      prefetch={false}
      {...props}
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`}
    />
  );
}

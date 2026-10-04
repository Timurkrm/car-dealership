import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type CardProps = { children: ReactNode; className?: string } & (
  | { variant: 'interactive'; href: string; 'aria-label'?: string }
  | { variant?: 'default' | 'selected'; href?: never; 'aria-label'?: string }
);
export function Card({
  variant = 'default',
  className = '',
  ...props
}: CardProps) {
  const classes = `ui-card ui-card--${variant} ${className}`;
  if (props.href !== undefined)
    return (
      <Link
        prefetch={false}
        href={props.href}
        className={classes}
        aria-label={props['aria-label']}
      >
        {props.children}
      </Link>
    );
  return (
    <div className={classes} aria-label={props['aria-label']}>
      {variant === 'selected' && (
        <span className="visually-hidden">Выбрано. </span>
      )}
      {props.children}
    </div>
  );
}
export function Divider(props: ComponentProps<'hr'>) {
  return <hr {...props} className={`ui-divider ${props.className ?? ''}`} />;
}

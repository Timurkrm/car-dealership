import type { ComponentProps } from 'react';
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export function Badge({
  tone = 'neutral',
  className = '',
  ...props
}: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span {...props} className={`ui-badge ui-tone--${tone} ${className}`} />
  );
}
// The feature owns status labels and their tone mapping; UI has no domain imports.
export function StatusBadge(props: ComponentProps<typeof Badge>) {
  return (
    <Badge {...props} className={`ui-status-badge ${props.className ?? ''}`} />
  );
}

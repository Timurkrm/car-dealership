import type { ComponentProps, ReactNode } from 'react';
import { Icon } from './icon';

export function Chip({ className = '', ...props }: ComponentProps<'span'>) {
  return <span {...props} className={`ui-chip ${className}`} />;
}
type FilterChipProps = Omit<ComponentProps<'button'>, 'children'> & {
  children: ReactNode;
} & (
    | { removable: true; removeLabel: string; selected?: never }
    | { removable?: false; removeLabel?: never; selected: boolean }
  );
export function FilterChip({
  selected,
  removable,
  removeLabel,
  children,
  className = '',
  ...props
}: FilterChipProps) {
  return (
    <button
      {...props}
      type="button"
      className={`ui-chip ui-filter-chip ${className}`}
      aria-pressed={removable ? undefined : selected}
      aria-label={removable ? removeLabel : props['aria-label']}
    >
      {selected && <Icon name="check" />}
      {children}
      {removable && <Icon name="close" />}
    </button>
  );
}

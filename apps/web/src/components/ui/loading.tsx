import type { ComponentProps } from 'react';

export function Spinner() {
  return <span className="ui-spinner" aria-hidden="true" />;
}

export function Skeleton({ className = '', ...props }: ComponentProps<'span'>) {
  return (
    <span
      {...props}
      className={`ui-skeleton ${className}`}
      aria-hidden="true"
    />
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="ui-loading" role="status" aria-live="polite">
      <span>{label}</span>
      <div className="ui-stack" aria-hidden="true">
        <Skeleton />
        <Skeleton className="ui-skeleton--short" />
      </div>
    </div>
  );
}

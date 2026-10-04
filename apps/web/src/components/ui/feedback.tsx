import type { ReactNode } from 'react';
import { Icon } from './icon';
import { Button } from './button';

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  children: ReactNode;
}) {
  return (
    <div
      className={`ui-alert ui-tone--${tone === 'error' ? 'danger' : tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon
        name={
          tone === 'success'
            ? 'check'
            : tone === 'error' || tone === 'warning'
              ? 'warning'
              : 'info'
        }
      />
      <div>{children}</div>
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <div className="ui-empty-state">
      {icon && (
        <span className="ui-state-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {(action || secondaryAction) && (
        <div className="ui-actions">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
export function ErrorState({
  title = 'Не удалось загрузить данные',
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ui-error-state">
      <Alert tone="error">
        <strong>{title}</strong>
        <p>{description}</p>
      </Alert>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

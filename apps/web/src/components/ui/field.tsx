import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Icon } from './icon';

type FieldOptions = { label?: string; hint?: ReactNode; error?: string };
function fieldMetadata(
  id: string,
  hint: ReactNode,
  error: string | undefined,
  describedBy?: string,
) {
  return (
    [describedBy, hint ? `${id}-hint` : '', error ? `${id}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined
  );
}
function FieldFrame({
  id,
  label,
  hint,
  error,
  children,
}: FieldOptions & { id: string; children: ReactNode }) {
  if (!label && !hint && !error) return children;
  return (
    <div className="ui-field">
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      {hint && (
        <div id={`${id}-hint`} className="ui-field-hint">
          {hint}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="ui-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}: ComponentProps<'input'> & FieldOptions) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame {...{ id: fieldId, label, hint, error }}>
      <input
        {...props}
        id={fieldId}
        className={`ui-input ${className}`}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={fieldMetadata(
          fieldId,
          hint,
          error,
          props['aria-describedby'],
        )}
      />
    </FieldFrame>
  );
}

export function Textarea({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}: ComponentProps<'textarea'> & FieldOptions) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame {...{ id: fieldId, label, hint, error }}>
      <textarea
        {...props}
        id={fieldId}
        className={`ui-input ${className}`}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={fieldMetadata(
          fieldId,
          hint,
          error,
          props['aria-describedby'],
        )}
      />
    </FieldFrame>
  );
}

export function Select({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}: ComponentProps<'select'> & FieldOptions) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame {...{ id: fieldId, label, hint, error }}>
      <select
        {...props}
        id={fieldId}
        className={`ui-input ${className}`}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={fieldMetadata(
          fieldId,
          hint,
          error,
          props['aria-describedby'],
        )}
      />
    </FieldFrame>
  );
}

type ChoiceProps = Omit<ComponentProps<'input'>, 'type'> & { label: string };
export function Checkbox({ label, className = '', ...props }: ChoiceProps) {
  return (
    <label className={`ui-choice ${className}`}>
      <input {...props} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}
export function Radio({ label, className = '', ...props }: ChoiceProps) {
  return (
    <label className={`ui-choice ${className}`}>
      <input {...props} type="radio" />
      <span>{label}</span>
    </label>
  );
}
export function Switch({ label, className = '', ...props }: ChoiceProps) {
  return (
    <label className={`ui-choice ui-switch ${className}`}>
      <input {...props} type="checkbox" role="switch" />
      <span>{label}</span>
    </label>
  );
}
export function SearchInput({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'> & { label: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame {...{ id: fieldId, label, hint, error }}>
      <div className="ui-search-input">
        <input
          {...props}
          id={fieldId}
          type="search"
          className={`ui-input ${className}`}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={fieldMetadata(
            fieldId,
            hint,
            error,
            props['aria-describedby'],
          )}
        />
        <Icon name="search" />
      </div>
    </FieldFrame>
  );
}

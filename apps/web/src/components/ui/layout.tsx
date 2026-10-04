import type { ComponentProps, ReactNode } from 'react';

export function Container({
  as: Tag = 'div',
  width = 'content',
  density = 'account',
  className = '',
  ...props
}: ComponentProps<'div'> & {
  as?: 'div' | 'main';
  width?: 'public' | 'content' | 'form';
  density?: 'public' | 'account' | 'compact';
}) {
  return (
    <Tag
      {...props}
      data-density={density}
      className={`ui-container ui-container--${width} ${className}`}
    />
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="ui-page-description">{description}</p>}
      </div>
      {actions && <div className="ui-actions">{actions}</div>}
    </header>
  );
}
export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="ui-section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions}
    </div>
  );
}
export function Section({
  className = '',
  ...props
}: ComponentProps<'section'>) {
  return <section {...props} className={`ui-section ${className}`} />;
}
export function Stack({ className = '', ...props }: ComponentProps<'div'>) {
  return <div {...props} className={`ui-stack ${className}`} />;
}

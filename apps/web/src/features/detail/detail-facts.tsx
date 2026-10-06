import type { ReactNode } from 'react';
export function DetailFacts({ rows, compact = false }: { rows: [string, ReactNode][]; compact?: boolean }) {
  return <dl className={compact ? 'detail-facts' : 'detail-specs'}>{rows.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>;
}

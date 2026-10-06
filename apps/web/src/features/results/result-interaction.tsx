'use client';
import type { ReactNode } from 'react';
export interface ResultInteractionProps {
  variant?: 'grid' | 'list';
  selected?: boolean;
  hovered?: boolean;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
  onNavigate?: () => void;
  headingLevel?: 2 | 3;
}
export function ResultInteraction({
  id,
  selected,
  hovered,
  variant = 'grid',
  onSelect,
  onHover,
  children,
}: ResultInteractionProps & { id: string; children: ReactNode }) {
  return (
    <article
      id={`listing-card-${id}`}
      tabIndex={-1}
      className={`result-card result-card--${variant}${selected ? ' result-card--selected' : ''}${hovered ? ' result-card--hovered' : ''}`}
      onMouseEnter={() => {
        onHover?.(id);
      }}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onSelect?.(id)}
    >
      {selected && (
        <span className="visually-hidden">Выбранное объявление</span>
      )}
      {children}
    </article>
  );
}

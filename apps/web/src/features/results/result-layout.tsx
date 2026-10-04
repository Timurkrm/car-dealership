import type { ReactNode } from 'react';
import { Skeleton } from '../../components/ui/loading';
export function ResultLayout({
  children,
  variant = 'grid',
}: {
  children: ReactNode;
  variant?: 'grid' | 'list';
}) {
  return (
    <div className={`result-layout result-layout--${variant}`}>{children}</div>
  );
}
export function ResultCardSkeleton() {
  return (
    <div className="result-skeleton" aria-hidden="true">
      <Skeleton className="result-skeleton-media" />
      <div className="result-body">
        <Skeleton />
        <Skeleton className="ui-skeleton--short" />
        <Skeleton />
        <Skeleton className="ui-skeleton--short" />
      </div>
    </div>
  );
}
export function ResultLoading({ count = 4 }: { count?: number }) {
  return (
    <div role="group" aria-label="Загружаем объявления" aria-busy="true">
      <ResultLayout>
        {Array.from({ length: Math.min(8, Math.max(1, count)) }, (_, index) => (
          <ResultCardSkeleton key={index} />
        ))}
      </ResultLayout>
    </div>
  );
}

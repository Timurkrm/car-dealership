import type { SearchSession } from './search-session';
import { MarketplaceResult } from '../results/marketplace-result';
import { ResultLayout, ResultLoading } from '../results/result-layout';
import { EmptyState, ErrorState } from '../../components/ui/feedback';
import { Button } from '../../components/ui/button';
import { searchErrorMessage } from './search-presentation';
export function SearchResults({
  state,
  onReset,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onNavigate,
  onRetry,
  variant = 'grid',
}: {
  state: ReturnType<SearchSession['snapshot']>;
  onReset: () => void;
  selectedId?: string | null;
  hoveredId?: string | null;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
  onNavigate?: () => void;
  onRetry?: () => void;
  variant?: 'grid' | 'list';
}) {
  return (
    <section aria-label="Результаты поиска" aria-busy={state.loading}>
      {state.loading && (
        <p role="status">
          {state.items.length ? 'Загружаем ещё…' : 'Ищем объявления…'}
        </p>
      )}
      {state.loading && state.items.length === 0 && <ResultLoading count={3} />}
      {Boolean(state.error) && (
        <ErrorState
          description={searchErrorMessage(state.error)}
          onRetry={onRetry}
        />
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <EmptyState
          title="По вашему запросу ничего не найдено"
          description="Попробуйте убрать часть условий поиска."
          action={
            <Button variant="outline" onClick={onReset}>
              Сбросить фильтры
            </Button>
          }
        />
      )}
      <ResultLayout variant={variant}>
        {state.items.map((listing) => (
          <MarketplaceResult
            key={listing.id}
            listing={listing}
            variant={variant}
            selected={listing.id === selectedId}
            hovered={listing.id === hoveredId}
            onSelect={onSelect}
            onHover={onHover}
            onNavigate={onNavigate}
          />
        ))}
      </ResultLayout>
    </section>
  );
}

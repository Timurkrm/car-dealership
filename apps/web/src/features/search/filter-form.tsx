'use client';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Input, Select } from '../../components/ui/field';
import { Alert } from '../../components/ui/feedback';
import { Icon } from '../../components/ui/icon';
import { CURRENCIES } from '../listings/listing-types';
import { decimalFromMinor } from '../listings/listing-form-model';
import { requestSearchOrigin } from './search-parameters';
import type {
  SearchParameters,
  PrivateSearchOrigin,
} from './search-parameters';
import { publicSearchInput, removeSearchFilter } from './search-presentation';

export interface FilterFormProps {
  parameters: SearchParameters;
  privateOriginActive?: boolean;
  onApply: (filters: SearchParameters, origin?: PrivateSearchOrigin) => void;
  mobile?: boolean;
}
export interface FilterDraft {
  draft: SearchParameters;
  change: (next: SearchParameters) => void;
  error: string | null;
}
export function FilterForm({
  parameters,
  privateOriginActive = false,
  onApply,
  mobile,
  parse,
  children,
}: FilterFormProps & {
  parse: (data: FormData, draft: SearchParameters) => SearchParameters;
  children: (props: FilterDraft) => ReactNode;
}) {
  const [draft, change] = useState(parameters);
  const [privateOrigin, setPrivate] = useState(privateOriginActive);
  const [error, setError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const alive = useRef(true);
  const geoEpoch = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function nearMe() {
    const epoch = ++geoEpoch.current;
    setLocating(true);
    setGeoError(null);
    try {
      const origin = await requestSearchOrigin(navigator.geolocation);
      if (!alive.current || epoch !== geoEpoch.current) return;
      setPrivate(true);
      change((current) => ({
        ...removeSearchFilter(current, 'geo'),
        ...origin,
        radiusMeters: current.radiusMeters ?? '50000',
      }));
    } catch (failure) {
      if (alive.current && epoch === geoEpoch.current)
        setGeoError(
          failure instanceof Error ? failure.message : 'Геолокация недоступна.',
        );
    } finally {
      if (alive.current && epoch === geoEpoch.current) setLocating(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const next = parse(new FormData(event.currentTarget), draft);
      const safe = publicSearchInput(next, privateOrigin);
      setError(null);
      onApply(safe.filters, safe.origin);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Проверьте фильтры.',
      );
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
    }
  }
  return (
    <form ref={form} className="search-filter-form" onSubmit={submit}>
      {children({ draft, change, error })}
      <fieldset>
        <legend>Цена</legend>
        <Select
          label="Валюта"
          name="currency"
          defaultValue={parameters.currency ?? ''}
          error={
            error?.includes('валют') ||
            error?.includes('цен') ||
            error?.includes('Цен')
              ? error
              : undefined
          }
        >
          <option value="">Любая</option>
          {CURRENCIES.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
        <div className="search-range">
          {(['From', 'To'] as const).map((bound) => (
            <Input
              key={bound}
              label={bound === 'From' ? 'Цена от' : 'Цена до'}
              name={`price${bound}`}
              inputMode="decimal"
              maxLength={22}
              error={
                error &&
                (error.includes('цен') ||
                  error.includes('Цен') ||
                  error.includes('не больше'))
                  ? error
                  : undefined
              }
              defaultValue={
                parameters[`price${bound}Minor`] && parameters.currency
                  ? decimalFromMinor(
                      parameters[`price${bound}Minor`]!,
                      parameters.currency,
                    )
                  : ''
              }
            />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Местоположение</legend>
        <Button
          variant="outline"
          loading={locating}
          onClick={() => void nearMe()}
        >
          <Icon name="location" />
          Рядом со мной
        </Button>
        <p className="ui-field-hint">
          Только для этого поиска. Местоположение не сохраняется.
        </p>
        {geoError && <Alert tone="error">{geoError}</Alert>}
        {privateOrigin ? (
          <p role="status">Используется ваше местоположение.</p>
        ) : (
          <details>
            <summary>Указать координаты вручную</summary>
            <div className="search-range">
              {(['lat', 'lng'] as const).map((key) => (
                <Input
                  key={key}
                  label={key === 'lat' ? 'Широта' : 'Долгота'}
                  type="number"
                  step="any"
                  min={key === 'lat' ? -90 : -180}
                  max={key === 'lat' ? 90 : 180}
                  value={draft[key] ?? ''}
                  onChange={(event) => {
                    const next = { ...draft, [key]: event.target.value };
                    delete next.bbox;
                    change(next);
                  }}
                />
              ))}
            </div>
          </details>
        )}
        {(draft.lat || draft.lng) && (
          <Input
            label="Радиус, км"
            type="number"
            min={0.001}
            max={250}
            step={0.001}
            value={draft.radiusMeters ? Number(draft.radiusMeters) / 1000 : ''}
            onChange={(event) =>
              change({
                ...draft,
                radiusMeters: event.target.value
                  ? String(Math.round(Number(event.target.value) * 1000))
                  : '',
              })
            }
          />
        )}
        {draft.bbox && <p>Задана область поиска.</p>}
        {(draft.bbox || draft.lat || draft.lng) && (
          <Button
            variant="ghost"
            onClick={() => {
              geoEpoch.current++;
              setLocating(false);
              setPrivate(false);
              change(removeSearchFilter(draft, 'geo'));
            }}
          >
            Убрать местоположение
          </Button>
        )}
        {['lat', 'lng', 'radiusMeters', 'bbox', 'sort'].map((key) => (
          <input key={key} type="hidden" name={key} value={draft[key] ?? ''} />
        ))}
      </fieldset>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="search-filter-actions">
        <Button type="submit" disabled={locating}>
          {mobile ? 'Показать результаты' : 'Применить фильтры'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            geoEpoch.current++;
            setLocating(false);
            onApply({});
          }}
        >
          Сбросить фильтры
        </Button>
      </div>
    </form>
  );
}

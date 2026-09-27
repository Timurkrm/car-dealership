'use client';
import { useState } from 'react';
import { CURRENCIES } from './listing-types';
import type { MarketplaceOwner } from './listing-types';
import { decimalFromMinor } from './listing-form-model';
export function ListingFields({
  initial,
  disabled,
}: {
  initial?: MarketplaceOwner;
  disabled: boolean;
}) {
  const [hasLocation, setHasLocation] = useState(Boolean(initial?.location));
  const [hasPublicPoint, setHasPublicPoint] = useState(
    Boolean(initial?.location?.publicPoint),
  );
  const [currency, setCurrency] = useState(initial?.price.currency ?? 'RUB');
  return (
    <>
      <fieldset disabled={disabled}>
        <legend>Объявление</legend>
        <label>
          Заголовок
          <input
            name="title"
            required
            minLength={1}
            maxLength={200}
            defaultValue={initial?.title}
          />
        </label>
        <label>
          Описание
          <textarea
            name="description"
            maxLength={20000}
            rows={6}
            defaultValue={initial?.description ?? ''}
          />
        </label>
        <p>
          Для модерации нужны описание и готовое главное фото. Добавьте
          фотографии после сохранения черновика. Для автомобиля также
          обязательно местоположение.
        </p>
        <div className="form-grid">
          <label>
            Цена в выбранной валюте
            <input
              name="price"
              inputMode="decimal"
              required
              maxLength={22}
              defaultValue={
                initial
                  ? decimalFromMinor(
                      initial.price.amountMinor,
                      initial.price.currency,
                    )
                  : ''
              }
            />
          </label>
          <label>
            Валюта
            <select
              name="currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {CURRENCIES.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
        </div>
        <p>
          {currency === 'JPY'
            ? 'Цена в целых иенах.'
            : 'Допускается до двух знаков после запятой.'}{' '}
          При смене валюты проверьте цену: пересчёт не выполняется.
        </p>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>Местоположение</legend>
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="hasLocation"
            checked={hasLocation}
            onChange={(event) => setHasLocation(event.target.checked)}
          />
          Указать местоположение
        </label>
        {hasLocation && (
          <>
            <div className="form-grid">
              <label>
                Город
                <input
                  name="city"
                  required
                  maxLength={120}
                  defaultValue={initial?.location?.city}
                />
              </label>
              <label>
                Регион (необязательно)
                <input
                  name="region"
                  maxLength={120}
                  defaultValue={initial?.location?.region ?? ''}
                />
              </label>
              <label>
                Код страны (например, RU или NL)
                <input
                  name="countryCode"
                  required
                  minLength={2}
                  maxLength={2}
                  defaultValue={initial?.location?.countryCode ?? 'RU'}
                />
              </label>
              <label>
                Точная широта, от −90 до 90
                <input
                  name="latitude"
                  type="number"
                  required
                  min={-90}
                  max={90}
                  step="any"
                  defaultValue={initial?.location?.exactPoint.latitude}
                />
              </label>
              <label>
                Точная долгота, от −180 до 180
                <input
                  name="longitude"
                  type="number"
                  required
                  min={-180}
                  max={180}
                  step="any"
                  defaultValue={initial?.location?.exactPoint.longitude}
                />
              </label>
            </div>
            <p>
              Точные координаты скрыты от посетителей. Адрес дома указывать не
              нужно.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="hasPublicPoint"
                checked={hasPublicPoint}
                onChange={(event) => setHasPublicPoint(event.target.checked)}
              />
              Показать отдельно выбранную публичную точку
            </label>
            {hasPublicPoint && (
              <div className="form-grid">
                <label>
                  Публичная широта
                  <input
                    name="publicLatitude"
                    type="number"
                    required
                    min={-90}
                    max={90}
                    step="any"
                    defaultValue={initial?.location?.publicPoint?.latitude}
                  />
                </label>
                <label>
                  Публичная долгота
                  <input
                    name="publicLongitude"
                    type="number"
                    required
                    min={-180}
                    max={180}
                    step="any"
                    defaultValue={initial?.location?.publicPoint?.longitude}
                  />
                </label>
              </div>
            )}
          </>
        )}
      </fieldset>
    </>
  );
}

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { AuthProvider } from '../src/features/auth/auth-provider';
import { FavoriteProvider } from '../src/features/engagement/favorite-provider';
import { FavoriteState } from '../src/features/engagement/favorite-state';
import { VehicleCard } from '../src/features/results/vehicle-card';
import { PartCard } from '../src/features/results/part-card';
import { MarketplaceResult } from '../src/features/results/marketplace-result';
import { ResultMedia } from '../src/features/results/result-media';
import { FavoriteResult } from '../src/features/results/favorite-result';
import {
  resultPrice,
  compatibilitySummary,
} from '../src/features/results/result-format';
import { vehicleResult, partResult } from './result-fixtures';
const card = (element: ReactNode) =>
  render(h(AuthProvider, null, h(FavoriteProvider, null, element)));

test('vehicle hierarchy has exact grouped money, readable specs, public distance and semantic title link', () => {
  const html = card(h(VehicleCard, { listing: vehicleResult }));
  for (const text of [
    vehicleResult.title,
    'Автоматическая',
    'Бензин',
    '2022',
    '12 км',
    '48 000 км',
    '90 071 992 547 409,93 EUR',
  ])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /AUTOMATIC|PETROL|PUBLISHED|\/ шт\./);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /width="640" height="480"/);
  assert.match(html, /href="\/listings\//);
  assert.doesNotMatch(html, /<a[^>]*>[^<]*<button/);
});
test('optional location and specs are omitted without separators or false distance', () => {
  const html = card(
    h(VehicleCard, {
      listing: {
        ...vehicleResult,
        location: null,
        vehicle: { ...vehicleResult.vehicle, fuelType: '', transmission: '' },
      },
    }),
  );
  assert.doesNotMatch(html, /result-location|12 км|NaN|undefined/);
});
test('part presents unit price, separate numbers, condition, quantity and seller-declared fitment summary', () => {
  const html = card(h(PartCard, { listing: partResult }));
  for (const text of [
    '179,99 EUR',
    '/ шт.',
    'Новая',
    'OEM',
    'Артикул производителя',
    partResult.part.oemNumber!,
    partResult.part.manufacturerPartNumber!,
    'В наличии: 3 шт.',
    '2019–2024',
    'ещё 2',
    'По данным продавца',
  ])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /VEHICLE_SPECIFIC|VERIFIED|NEW/);
});
test('part optional data and universal compatibility need no invented brand or fitments', () => {
  const html = card(
    h(PartCard, {
      listing: {
        ...partResult,
        part: {
          ...partResult.part,
          brand: null,
          oemNumber: null,
          manufacturerPartNumber: null,
          quantityAvailable: 1000000,
          fitment: { mode: 'UNIVERSAL', count: 0, samples: [] },
        },
      },
    }),
  );
  assert.match(html, /Универсальная совместимость/);
  assert.match(html, /1\u00a0000\u00a0000 шт\./);
  assert.doesNotMatch(html, /Без бренда|Артикул производителя|result-numbers/);
  assert.equal(
    compatibilitySummary({ mode: 'VEHICLE_SPECIFIC', count: 0, samples: [] }),
    null,
  );
});
test('result dispatcher preserves subtype, list and controlled selected semantics', () => {
  const vehicle = card(
    h(MarketplaceResult, {
      listing: vehicleResult,
      selected: true,
      variant: 'list',
      headingLevel: 3,
    }),
  );
  assert.match(vehicle, /result-card--list/);
  assert.match(vehicle, /Выбранное объявление/);
  assert.match(vehicle, /<h3/);
  assert.match(
    card(h(MarketplaceResult, { listing: partResult })),
    /\/parts\//,
  );
});
test('missing media is a neutral subtype placeholder without a broken img', () => {
  for (const type of ['VEHICLE', 'PART'] as const) {
    const html = render(
      h(ResultMedia, { type, cover: null, label: 'Предложение' }),
    );
    assert.match(html, /Фото недоступно/);
    assert.doesNotMatch(html, /<img/);
  }
});
test('money stays exact across two-decimal and zero-decimal currencies', () => {
  assert.equal(resultPrice('199999900', 'EUR'), '1 999 999 EUR');
  assert.equal(resultPrice('1999999', 'JPY'), '1 999 999 JPY');
});
test('card markup escapes title and omits private/unrelated properties', () => {
  const listing = {
    ...vehicleResult,
    title: '<script>alert(1)</script>',
    sellerId: 'private-seller',
    exactPoint: { longitude: 77.123456 },
    vin: 'PRIVATEVIN',
    storageKey: 'private-key',
    version: 123,
  };
  const html = card(h(VehicleCard, { listing }));
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(
    html,
    /private-seller|77.123456|PRIVATEVIN|private-key|version=/,
  );
});
test('unavailable favorites reveal no former content and sold favorites keep explicit status', () => {
  const html = card(
    h(FavoriteResult, {
      item: {
        kind: 'UNAVAILABLE',
        listingId: vehicleResult.id,
        availability: 'UNAVAILABLE',
        addedAt: '2026-01-01',
      },
      onRemoved() {},
    }),
  );
  assert.match(html, /Объявление недоступно/);
  assert.doesNotMatch(html, /<img|href="\/listings/);
  const sold = card(
    h(FavoriteResult, {
      item: {
        kind: 'VEHICLE',
        listingId: vehicleResult.id,
        title: 'Проданный автомобиль',
        availability: 'SOLD',
        price: vehicleResult.price,
        cover: vehicleResult.cover,
        addedAt: '2026-01-01',
        vehicle: vehicleResult.vehicle,
      },
      onRemoved() {},
    }),
  );
  assert.match(sold, /Продано/);
});
test('favorite shared state bounds concurrent mutations and commits server acknowledgement', async () => {
  let release!: () => void;
  let calls = 0;
  const store = new FavoriteState({
    favorite: async () => {
      calls++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    unfavorite: async () => {
      calls++;
    },
  });
  assert.equal(store.read('id').value, null);
  const first = store.set('id', true);
  assert.equal(store.read('id').pending, true);
  assert.equal(await store.set('id', true), false);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, true);
  assert.equal(store.read('id').value, true);
  assert.equal(await store.set('id', false), true);
  assert.equal(calls, 2);
});
test('favorite failure rolls back confirmed and unknown states without throwing', async () => {
  const fail = async () => {
    throw new Error('private backend message');
  };
  const store = new FavoriteState({ favorite: fail, unfavorite: fail });
  store.observe(['known']);
  await store.set('known', false);
  assert.deepEqual(store.read('known'), {
    value: true,
    pending: false,
    error: true,
  });
  await store.set('unknown', true);
  assert.equal(store.read('unknown').value, null);
  const other = new FavoriteState({ favorite: fail, unfavorite: fail });
  assert.equal(other.read('known').value, null);
});

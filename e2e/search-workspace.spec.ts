import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { observeBrowserErrors } from './helpers';
import { vehicleResult } from '../apps/web/test/result-fixtures';

const fixtureCover = {
  url: 'http://127.0.0.1:3200/test-cover.svg',
  width: 320,
  height: 240,
};
test.beforeEach(async ({ page }) => {
  await page.route('**/test-cover.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#dce3ed"/></svg>',
    }),
  );
});

async function accessibleSearch(page: Page) {
  const result = await new AxeBuilder({ page })
    .include('main, dialog[open]')
    .analyze();
  expect(
    result.violations.filter(
      (row) => row.impact === 'serious' || row.impact === 'critical',
    ),
  ).toEqual([]);
}

for (const type of ['VEHICLE', 'PART'] as const) {
  test(`${type} map cluster, selection, hover and explicit area search @critical`, async ({
    page,
  }, info) => {
    const clean = observeBrowserErrors(page);
    const listingId =
      type === 'VEHICLE'
        ? vehicleResult.id
        : '93000000-0000-4000-8000-000000000001';
    const path = type === 'VEHICLE' ? '/cars' : '/parts';
    const requests: URL[] = [];
    await page.route('**/api/v1/search/listings/map?**', async (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      const cluster = Number(url.searchParams.get('zoom')) < 13;
      await route.fulfill({
        json: {
          features: cluster
            ? [
                {
                  kind: 'CLUSTER',
                  clusterId: 'fixture',
                  center: { latitude: 52.37, longitude: 4.89 },
                  count: 12,
                  bounds: {
                    west: 4.89,
                    east: 4.89,
                    south: 52.37,
                    north: 52.37,
                  },
                },
              ]
            : [
                {
                  kind: 'LISTING',
                  type,
                  listingId,
                  title:
                    type === 'VEHICLE'
                      ? 'BMW 3 Series map'
                      : 'Bosch brake pads map',
                  publicPoint: { latitude: 52.37, longitude: 4.89 },
                  price: { amountMinor: '2500000', currency: 'EUR' },
                  cover: fixtureCover,
                  location: {
                    city: 'Amsterdam',
                    region: null,
                    countryCode: 'NL',
                    distanceMeters: null,
                  },
                  ...(type === 'VEHICLE'
                    ? {
                        vehicle: {
                          make: 'BMW',
                          model: '3 Series',
                          year: 2022,
                          mileageKm: 10000,
                        },
                      }
                    : {
                        part: {
                          name: 'Brake pads',
                          category: 'Brakes',
                          brand: 'Bosch',
                          condition: 'NEW',
                          fitment: { mode: 'VEHICLE_SPECIFIC', count: 1 },
                        },
                      }),
                },
              ],
          limit: 500,
          truncated: false,
        },
      });
    });
    await page.goto(path + '?mapLat=52.3700&mapLng=4.8900&mapZoom=12.00');
    await expect(page.locator('.result-card').first()).toBeVisible();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    await expect(page.getByText('Обновляем карту…')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Искать в этой области' }),
    ).not.toBeVisible();
    const canvas = page.locator('.maplibregl-canvas');
    await canvas.hover();
    await expect(canvas).toHaveCSS('cursor', 'pointer');
    await canvas.click();
    await expect
      .poll(() =>
        requests.some((url) => Number(url.searchParams.get('zoom')) >= 13),
      )
      .toBeTruthy();
    await expect(page.getByText('Обновляем карту…')).not.toBeVisible();
    await canvas.click();
    await expect(
      page.getByRole('article', { name: 'Выбранное объявление' }),
    ).toBeVisible();
    const card = page.locator(`#listing-card-${listingId}`);
    await expect(card).toHaveClass(/result-card--selected/);
    await card.hover();
    await expect(card).toHaveClass(/result-card--hovered/);
    await page.locator('h1').hover();
    await expect(card).not.toHaveClass(/result-card--hovered/);
    await page.screenshot({ path: info.outputPath('search-map-selected.png') });
    await page.getByRole('button', { name: 'Искать в этой области' }).click();
    await expect(page).toHaveURL(/bbox=/);
    await expect(
      page.getByRole('button', { name: 'Искать в этой области' }),
    ).not.toBeVisible();
    await expect
      .poll(() =>
        requests.some(
          (url) =>
            url.searchParams.has('bbox') && url.searchParams.has('viewport'),
        ),
      )
      .toBeTruthy();
    await expect(page.locator('.map-preview')).toHaveCount(0);
    await page.goBack();
    await expect(page).not.toHaveURL(/bbox=/);
    await expect(page.locator('.map-preview')).toHaveCount(0);
    await page.getByRole('button', { name: 'Карта', exact: true }).click();
    await accessibleSearch(page);
    clean();
  });
}

test('cursor load more ignores duplicates and preserves opaque cursor @critical', async ({
  page,
}) => {
  const clean = observeBrowserErrors(page);
  const seen: string[] = [];
  await page.route('**/api/v1/listings?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const cursor = query.get('cursor');
    if (cursor) seen.push(cursor);
    const item = {
      ...vehicleResult,
      cover: fixtureCover,
    };
    await route.fulfill({
      json: {
        items: cursor
          ? [item, { ...item, id: '60000000-0000-4000-8000-000000000002' }]
          : [item],
        page: {
          nextCursor: cursor ? null : 'opaque-cursor-fixture',
          hasNextPage: !cursor,
        },
      },
    });
  });
  await page.goto('/cars?view=list');
  await expect(page.locator('.result-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Показать ещё', exact: true }).click();
  await expect(page.locator('.result-card')).toHaveCount(2);
  expect(seen).toEqual(['opaque-cursor-fixture']);
  await expect(
    page.getByRole('button', { name: 'Показать ещё', exact: true }),
  ).toBeDisabled();
  await expect(page).not.toHaveURL(/opaque-cursor/);
  clean();
});

test('search draft, chips, sorting, facets and URL history @critical', async ({
  page,
}) => {
  const clean = observeBrowserErrors(page);
  let requests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/listings') requests++;
  });
  await page.goto('/cars?view=list');
  await expect(page.locator('.result-card').first()).toBeVisible();
  const previous = requests;
  await page
    .getByRole('combobox', { name: 'Марка', exact: true })
    .selectOption({ label: 'BMW' });
  await page
    .getByRole('combobox', { name: 'Модель', exact: true })
    .selectOption({ label: '3 Series' });
  await page
    .getByRole('combobox', { name: 'Поколение (необязательно)', exact: true })
    .selectOption({ index: 1 });
  await page
    .getByRole('combobox', { name: 'Марка', exact: true })
    .selectOption('');
  await expect(
    page.getByRole('combobox', { name: 'Модель', exact: true }),
  ).toHaveValue('');
  await expect(
    page.getByRole('combobox', {
      name: 'Поколение (необязательно)',
      exact: true,
    }),
  ).toHaveValue('');
  await page
    .getByRole('combobox', { name: 'Марка', exact: true })
    .selectOption({ label: 'BMW' });
  await page
    .getByRole('combobox', { name: 'Модель', exact: true })
    .selectOption({ label: '3 Series' });
  await page.getByLabel('Год от', { exact: true }).fill('2020');
  await page.getByLabel('Валюта', { exact: true }).selectOption('EUR');
  await page.getByLabel('Цена до', { exact: true }).fill('30000');
  expect(requests).toBe(previous);
  await page.getByRole('button', { name: 'Применить фильтры' }).click();
  await expect(page).toHaveURL(/priceToMinor=3000000/);
  await expect(
    page.getByRole('group', { name: 'Применённые фильтры' }),
  ).toContainText('Год: от 2020');
  await page.getByLabel('Порядок выдачи').selectOption('price_asc');
  await expect(page).toHaveURL(/sort=price_asc/);
  await page
    .getByRole('button', { name: 'Убрать фильтр: EUR', exact: true })
    .click();
  await expect(page).not.toHaveURL(/priceToMinor|price_asc|currency/);
  await page.goBack();
  await expect(page).toHaveURL(/sort=price_asc/);
  await page.reload();
  await expect(page.getByLabel('Порядок выдачи')).toHaveValue('price_asc');
  await accessibleSearch(page);
  await page.getByText('Варианты по фильтрам', { exact: true }).click();
  const facets = page.waitForResponse(/\/search\/listings\/facets/);
  await page
    .getByRole('button', { name: 'Посчитать варианты по фильтрам' })
    .click();
  await facets;
  await expect(
    page.getByRole('button', { name: 'Посчитать варианты по фильтрам' }),
  ).toBeDisabled();
  await page.getByLabel('Год от', { exact: true }).fill('2025');
  await page.getByLabel('Год до', { exact: true }).fill('2020');
  await page.getByRole('button', { name: 'Применить фильтры' }).click();
  await expect(
    page.locator('.search-filter-form').getByRole('alert'),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/yearFrom=2025/);
  clean();
});

test('mobile filter drawer discards drafts, traps focus, applies and restores trigger @mobile', async ({
  page,
}) => {
  const clean = observeBrowserErrors(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          error: PositionErrorCallback,
        ) => error({ code: 1 } as GeolocationPositionError),
      },
    }),
  );
  await page.goto('/cars');
  const trigger = page.getByRole('button', { name: /^Фильтры/ });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Фильтры поиска' });
  await expect(drawer).toBeVisible();
  await accessibleSearch(page);
  await drawer.getByLabel('Год от', { exact: true }).fill('2020');
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(drawer.getByLabel('Год от', { exact: true })).toHaveValue('');
  await drawer.getByRole('button', { name: 'Рядом со мной' }).click();
  await expect(
    drawer.getByText(
      'Доступ к местоположению отклонён. Поиск доступен без него.',
    ),
  ).toBeVisible();
  await drawer.getByLabel('Год от', { exact: true }).fill('2020');
  await drawer.getByRole('button', { name: 'Показать результаты' }).click();
  await expect(page).toHaveURL(/yearFrom=2020/);
  await expect(drawer).not.toBeVisible();
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(page.locator('.discovery-map-pane')).toBeVisible();
  await accessibleSearch(page);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Искать в этой области' }).click();
  await expect(page).toHaveURL(/bbox=/);
  await page.getByRole('button', { name: 'Список', exact: true }).click();
  await expect(page.locator('.discovery-list-pane')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  clean();
});

test('Parts structured filters and responsive search workspace @chromium', async ({
  page,
}, info) => {
  const clean = observeBrowserErrors(page);
  await page.goto('/parts?view=list');
  await expect(page.locator('.result-card').first()).toBeVisible();
  await page
    .getByLabel('Категория', { exact: true })
    .selectOption({ label: 'Brakes' });
  await page.getByLabel('Новая', { exact: true }).check();
  await page.getByLabel('Валюта').selectOption('EUR');
  await page.getByLabel('Цена до', { exact: true }).fill('500');
  await page.getByRole('button', { name: 'Применить фильтры' }).click();
  await expect(page).toHaveURL(/condition=NEW/);
  await expect(page.locator('.search-active-filters')).toContainText('Brakes');
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.result-card').first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `overflow at ${width}`,
    ).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`search-parts-${width}.png`),
      fullPage: false,
    });
  }
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(
    axe.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  clean();
});

test('Near Me is ephemeral, applied explicitly and can be cleared @critical', async ({
  page,
}) => {
  const clean = observeBrowserErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 52.370216, longitude: 4.895168 },
          } as GeolocationPosition),
      },
    });
  });
  await page.goto('/cars?view=list');
  await page
    .getByRole('button', { name: 'Рядом со мной', exact: true })
    .click();
  await expect(
    page.getByText('Используется ваше местоположение.'),
  ).toBeVisible();
  const located = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/listings?') &&
      response.url().includes('lat=52.370216'),
  );
  await page.getByRole('button', { name: 'Применить фильтры' }).click();
  await located;
  await expect(page).not.toHaveURL(/52.370216|4.895168|radiusMeters/);
  await page.getByLabel('Порядок выдачи').selectOption('distance');
  await expect(page.getByLabel('Порядок выдачи')).toHaveValue('distance');
  await expect(page).not.toHaveURL(/sort=distance|lat=/);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toMatch(/52.370216|4.895168/);
  await page
    .getByRole('button', { name: 'Убрать фильтр: Рядом со мной' })
    .click();
  await expect(page.getByLabel('Порядок выдачи')).toHaveValue('newest');
  await expect(
    page.getByLabel('Порядок выдачи').locator('option[value="distance"]'),
  ).toHaveCount(0);
  clean();
});

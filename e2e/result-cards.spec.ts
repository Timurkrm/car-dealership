import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { observeBrowserErrors } from './helpers';

test('result grid/list long-content and missing-data states @chromium @mobile', async ({
  page,
}, info) => {
  const require = createRequire(resolve('package.json'));
  execFileSync(process.execPath, [
    require.resolve('typescript/bin/tsc'),
    '-p',
    'apps/web/tsconfig.test.json',
  ]);
  const {
    AuthProvider,
  } = require('./apps/web/.test-build/src/features/auth/auth-provider.js');
  const {
    FavoriteProvider,
  } = require('./apps/web/.test-build/src/features/engagement/favorite-provider.js');
  const {
    MarketplaceResult,
  } = require('./apps/web/.test-build/src/features/results/marketplace-result.js');
  const {
    ResultLayout,
  } = require('./apps/web/.test-build/src/features/results/result-layout.js');
  const {
    vehicleResult,
    partResult,
  } = require('./apps/web/.test-build/test/result-fixtures.js');
  const css = [
    'app/globals.css',
    'styles/tokens.css',
    'styles/foundation.css',
    'styles/primitives.css',
    'styles/results.css',
  ]
    .map((path) => readFileSync(`apps/web/src/${path}`, 'utf8'))
    .join('\n');
  const listings = [
    { ...vehicleResult, cover: null, location: null },
    { ...partResult, cover: null },
    {
      ...partResult,
      id: '60000000-0000-4000-8000-000000000003',
      cover: null,
      title:
        'Универсальная запчасть с длинным названием для проверки мобильной карточки',
      part: {
        ...partResult.part,
        brand: null,
        oemNumber: null,
        manufacturerPartNumber: null,
        quantityAvailable: 1000000,
        fitment: { mode: 'UNIVERSAL', count: 0, samples: [] },
      },
    },
  ];
  const sections = (['grid', 'list'] as const).map((variant) =>
    h(
      'section',
      { key: variant },
      h('h2', {}, variant === 'grid' ? 'Сетка' : 'Список'),
      h(
        ResultLayout,
        { variant },
        ...listings.map((listing, index) =>
          h(MarketplaceResult, {
            key: listing.id,
            listing: {
              ...listing,
              id: listing.id.replace(
                /.$/,
                String(index + (variant === 'grid' ? 4 : 7)),
              ),
            },
            variant,
            headingLevel: 3,
            selected: index === 0,
          }),
        ),
      ),
    ),
  );
  const content = renderToStaticMarkup(
    h(
      AuthProvider,
      null,
      h(
        FavoriteProvider,
        null,
        h(
          'main',
          { id: 'main' },
          h('h1', {}, 'Карточки объявлений'),
          ...sections,
        ),
      ),
    ),
  );
  await page.setContent(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Result cards</title><style>${css}</style></head><body>${content}</body></html>`,
  );
  const widths = info.project.name.startsWith('mobile')
    ? [page.viewportSize()!.width]
    : [320, 375, 390, 768, 1024, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => innerWidth)).toBe(width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    if (width >= 768) {
      const mediaWidths = await page
        .locator('.result-card--list .result-media')
        .evaluateAll((elements) =>
          elements.map((element) => element.getBoundingClientRect().width),
        );
      expect(Math.max(...mediaWidths) - Math.min(...mediaWidths)).toBeLessThan(
        1,
      );
    }
    const a11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      a11y.violations.filter(
        (item) => item.impact === 'serious' || item.impact === 'critical',
      ),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`cards-${width}.png`),
      fullPage: true,
    });
  }
});

test('public cards navigate independently from anonymous favorite and recover broken media @critical @mobile', async ({
  page,
}) => {
  const assertNoErrors = observeBrowserErrors(page);
  await page.goto('/');
  const car = page
    .getByRole('region', { name: 'Свежие автомобили' })
    .locator('.result-card')
    .first();
  await expect(car.locator('.result-price')).toContainText('EUR');
  const favorite = car.getByRole('link', {
    name: 'Войти, чтобы добавить в избранное',
  });
  await favorite.focus();
  await expect(favorite).toBeFocused();
  await favorite.press('Enter');
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await page.locator('.shell-logo').click();
  await car.getByRole('link', { name: /BMW/ }).click();
  await expect(page).toHaveURL(/\/listings\//);
  await page.locator('.shell-logo').click();
  const part = page
    .getByRole('region', { name: 'Свежие запчасти' })
    .locator('.result-card')
    .first();
  await expect(part).toContainText('/ шт.');
  await part.getByRole('link', { name: 'Bosch brake pads E2E' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(
    /\/parts\/93000000-0000-4000-8000-000000000001$/,
  );
  await page.goto('/cars');
  const image = page.locator('.result-media img').first();
  await expect(image).toBeVisible();
  await image.evaluate((element) => element.dispatchEvent(new Event('error')));
  await expect(page.locator('.result-media-placeholder').first()).toContainText(
    'Фото недоступно',
  );
  assertNoErrors();
});

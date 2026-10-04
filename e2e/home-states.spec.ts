import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Isolated browser rendering of actual server components, without exposing a
// production fixture route or intercepting unrelated browser API requests.
test('Home section empty, partial failure and slow-loading layouts @chromium', async ({
  page,
}, info) => {
  // Playwright's TSX transform builds component-test descriptors, not React
  // server elements. Use the repository's normal React test compilation.
  const require = createRequire(resolve('package.json'));
  execFileSync(process.execPath, [
    require.resolve('typescript/bin/tsc'),
    '-p',
    'apps/web/tsconfig.test.json',
  ]);
  const {
    LatestContent,
    LatestLoading,
  } = require('./apps/web/.test-build/src/features/home/latest-listings.js');
  const css = [
    'app/globals.css',
    'styles/tokens.css',
    'styles/foundation.css',
    'styles/primitives.css',
    'styles/home.css',
    'styles/results.css',
  ]
    .map((path) => readFileSync(`apps/web/src/${path}`, 'utf8'))
    .join('\n');
  const content = renderToStaticMarkup(
    h(
      'main',
      { className: 'ui-container', id: 'main' },
      h('h1', {}, 'Состояния подборок'),
      h(
        'section',
        { 'aria-label': 'Автомобили' },
        h('h2', {}, 'Свежие автомобили'),
        h(LatestContent, { type: 'VEHICLE', state: { status: 'error' } }),
      ),
      h(
        'section',
        { 'aria-label': 'Запчасти' },
        h('h2', {}, 'Свежие запчасти'),
        h(LatestContent, {
          type: 'PART',
          state: { status: 'ready', items: [] },
        }),
      ),
      h(
        'section',
        { 'aria-label': 'Загрузка' },
        h('h2', {}, 'Загрузка подборки'),
        h(LatestLoading),
      ),
    ),
  );
  await page.setContent(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Home section states</title><style>${css}</style></head><body>${content}</body></html>`,
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByText('Объявления временно недоступны'),
    ).toBeVisible();
    await expect(page.getByText('Новые запчасти появятся здесь')).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'Загружаем объявления' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const a11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      a11y.violations.filter(
        (row) => row.impact === 'critical' || row.impact === 'serious',
      ),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`home-states-${width}.png`),
      fullPage: true,
    });
  }
});

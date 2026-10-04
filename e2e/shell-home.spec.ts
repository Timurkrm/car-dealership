import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { observeBrowserErrors } from './helpers';

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter(
      (row) => row.impact === 'serious' || row.impact === 'critical',
    ),
  ).toEqual([]);
}

test('marketplace home and anonymous shell support both categories @critical @mobile', async ({
  page,
}, info) => {
  const clean = observeBrowserErrors(page);
  const browserSearch: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/v1\/listings\?/.test(request.url()))
      browserSearch.push(request.url());
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Найдите то, что вам нужно' }),
  ).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  await expect(
    page
      .getByRole('region', { name: 'Свежие автомобили' })
      .getByRole('link', { name: /BMW 3 Series/ })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Свежие запчасти' })
      .getByRole('link', { name: 'Bosch brake pads E2E' }),
  ).toBeVisible();
  expect(browserSearch).toHaveLength(0); // Latest data is already streamed by the server.
  const find = page.getByRole('button', { name: 'Найти автомобиль' });
  const rect = await find.boundingBox();
  expect(rect).not.toBeNull();
  expect((rect?.y ?? 0) + (rect?.height ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  await accessible(page);
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  await page.evaluate(() => window.scrollTo(0, 700));
  expect((await page.locator('.shell-header').boundingBox())?.y).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));

  const mobile = info.project.name.startsWith('mobile');
  if (mobile) {
    const menu = page.getByRole('button', { name: 'Открыть меню' });
    await menu.click();
    const dialog = page.getByRole('dialog', { name: 'Меню', exact: true });
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(
      dialog.getByRole('link', { name: 'Автомобили', exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('link', { name: 'Запчасти', exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('link', { name: 'Вход', exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('link', { name: 'Регистрация', exact: true }),
    ).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await accessible(page);
    await page.screenshot({ path: info.outputPath('mobile-menu.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(menu).toBeFocused();
    await menu.click();
    await page.mouse.click(4, 100);
    await expect(dialog).not.toBeVisible();
    await menu.click();
    await dialog.getByRole('link', { name: 'Продать', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  } else {
    const header = page.locator('.shell-header');
    await expect(
      header.getByRole('link', { name: 'Вход', exact: true }),
    ).toBeVisible();
    await expect(
      header.getByRole('link', { name: 'Регистрация', exact: true }),
    ).toBeVisible();
    await header.getByRole('link', { name: 'Продать', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/sell$/);
  await expect(
    page.getByRole('heading', { name: 'Что вы хотите продать?' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Автомобиль', exact: true }).click();
  await expect(
    page.locator('main').getByRole('link', { name: 'войдите', exact: true }),
  ).toBeVisible();
  await page.locator('.shell-logo').click();
  await page.getByLabel('Год от', { exact: true }).fill('2020');
  await page.getByRole('button', { name: 'Найти автомобиль' }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/cars' && url.searchParams.get('yearFrom') === '2020',
  );
  await expect(
    page.getByRole('region', { name: 'Результаты поиска' }),
  ).toContainText('BMW');
  if (!mobile)
    await expect(
      page
        .getByRole('navigation', { name: 'Основная навигация' })
        .getByRole('link', { name: 'Автомобили' }),
    ).toHaveAttribute('aria-current', 'page');
  await page.locator('.shell-logo').click();
  await page.getByRole('button', { name: 'Запчасти', exact: true }).click();
  await page.getByLabel('Номер запчасти или OEM').fill('OEM-E2E-001');
  await page.getByRole('button', { name: 'Найти запчасть' }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/parts' &&
      url.searchParams.get('partNumber') === 'OEM-E2E-001',
  );
  await expect(
    page.getByRole('link', { name: 'Bosch brake pads E2E' }),
  ).toBeVisible();
  await page.locator('.shell-logo').click();
  if (mobile) {
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    await page
      .getByRole('dialog', { name: 'Меню', exact: true })
      .getByRole('link', { name: 'Вход', exact: true })
      .click();
  } else {
    await page
      .locator('.shell-header')
      .getByRole('link', { name: 'Вход', exact: true })
      .click();
  }
  await expect(
    page.locator('.shell-header').getByRole('link', { name: 'На главную' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toHaveCount(
    0,
  );
  clean();
});

test('loading auth header stays neutral and drawer closes across breakpoints @chromium', async ({
  page,
}, info) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.shell-auth-loading')).toBeVisible();
  await expect(
    page
      .locator('.shell-header')
      .getByRole('link', { name: 'Вход', exact: true }),
  ).toHaveCount(0);
  const before = await page.locator('.shell-header').boundingBox();
  await accessible(page);
  release();
  await expect(
    page
      .locator('.shell-header')
      .getByRole('link', { name: 'Вход', exact: true }),
  ).toBeVisible();
  expect(await page.locator('.shell-header').boundingBox()).toEqual(before);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Меню', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole('dialog', { name: 'Меню', exact: true }),
  ).not.toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Tab');
  await page.screenshot({ path: info.outputPath('header-focus.png') });
});

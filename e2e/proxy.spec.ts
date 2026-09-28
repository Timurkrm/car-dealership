import { test, expect } from '@playwright/test';
import { login, observeBrowserErrors } from './helpers';

test('production proxy journey covers Cars, Parts, Map, realtime and logout @chromium @proxy', async ({
  page,
}, testInfo) => {
  const assertClean = observeBrowserErrors(page);

  await page.goto('/cars');
  await expect(page.getByText(/BMW 3 Series/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(
    page.getByRole('application', { name: /Интерактивная карта/ }),
  ).toBeVisible();

  await page.goto('/parts');
  await expect(page.getByText('Bosch brake pads E2E')).toBeVisible();

  await login(page);
  await page.goto('/account/messages/70000000-0000-4000-8000-000000000001');
  await expect(page.getByText('Is this vehicle available?')).toBeVisible();
  const body = `Proxy E2E ${testInfo.project.name} ${Date.now()}`;
  await page.getByLabel('Сообщение').fill(body);
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText(body)).toBeVisible();

  await page.goto('/account');
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  assertClean();
});

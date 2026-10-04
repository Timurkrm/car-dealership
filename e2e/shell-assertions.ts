import { expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { verifyResultFavorite } from './result-card-assertions';

/** Runs inside an existing signed-in UI scenario, avoiding extra auth attempts. */
export async function verifyPersonalShell(
  page: Page,
  info: TestInfo,
  socketConnections: () => number,
) {
  const mobile = info.project.name.startsWith('mobile');
  let countRequests = 0;
  await page.route('**/api/v1/me/**/unread-count', async (route) => {
    countRequests++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 1254 }),
    });
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      response,
      json: {
        ...data,
        displayName: 'Очень длинное имя пользователя Automotive Marketplace',
      },
    });
  });
  await page.goto('/account');
  const menu = page.getByRole('button', { name: 'Открыть меню' });
  if (mobile) await menu.click();
  const scope = mobile
    ? page.getByRole('dialog', { name: 'Меню', exact: true })
    : page.locator('.shell-header');
  await expect(
    scope.getByRole('link', { name: 'Сообщения, непрочитанных: 99+' }),
  ).toBeVisible();
  await expect(
    scope.getByRole('link', { name: 'Уведомления, непрочитанных: 99+' }),
  ).toBeVisible();
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
  await page.screenshot({ path: info.outputPath('authenticated-header.png') });
  if (mobile)
    await scope.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const socketsBefore = socketConnections();
  const countsBefore = countRequests;
  for (const [name, path] of [
    ['Избранное', '/account/favorites'],
    ['Сообщения, непрочитанных: 99+', '/account/messages'],
    ['Уведомления, непрочитанных: 99+', '/account/notifications'],
    ['Аккаунт', '/account'],
    ['Продать', '/sell'],
  ]) {
    if (mobile) await menu.click();
    await scope.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    if (mobile) await expect(scope).not.toBeVisible();
    await expect(page.locator('main h1')).toBeVisible();
    if (path === '/account/messages')
      await page.screenshot({ path: info.outputPath('messages-shell.png') });
  }
  expect(socketConnections()).toBe(socketsBefore); // SPA navigation must not create another connection.
  // Measure SPA navigation separately from login and the explicit initial reload.
  // Allow one pending focus/reconnect reconciliation, not one pair per route.
  expect(countRequests - countsBefore).toBeLessThanOrEqual(2);
  await verifyResultFavorite(page);
  await page.unroute('**/api/v1/me/**/unread-count');
  await page.unroute('**/api/v1/auth/me');
}

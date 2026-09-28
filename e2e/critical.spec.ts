import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  issueActionToken,
  login,
  observeBrowserErrors,
  password,
  users,
} from './helpers';

test('anonymous Cars catalog, filters, map and detail @critical', async ({
  page,
}) => {
  const assertClean = observeBrowserErrors(page);
  await page.goto('/cars');
  await expect(
    page.getByRole('heading', { name: 'Каталог автомобилей' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Результаты поиска' }),
  ).toContainText('BMW');
  await page.getByLabel('Год от').fill('2020');
  await page.getByLabel('Валюта').selectOption('EUR');
  await page.getByLabel('Цена до').fill('30000');
  await page.getByRole('button', { name: 'Применить фильтры' }).click();
  await expect(page).toHaveURL(/yearFrom=2020/);
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(
    page.getByRole('application', { name: /Интерактивная карта/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Список', exact: true }).click();
  await page
    .getByRole('link', { name: /BMW 3 Series/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/listings\/60000000-/);
  await expect(
    page.getByRole('heading', { name: /BMW 3 Series/ }),
  ).toBeVisible();
  assertClean();
});

test('login, favorites, saved searches, notifications and messaging @critical', async ({
  page,
}, testInfo) => {
  const navigationCounts = Promise.all([
    page.waitForResponse(/\/api\/v1\/me\/notifications\/unread-count/),
    page.waitForResponse(/\/api\/v1\/me\/conversations\/unread-count/),
  ]);
  await login(page);
  await navigationCounts;
  const assertClean = observeBrowserErrors(page);
  await page.goto('/account/favorites');
  await expect(
    page.getByRole('heading', { name: /BMW 3 Series/ }),
  ).toBeVisible();
  await page.goto('/account/saved-searches');
  await expect(
    page.getByRole('heading', { name: 'Сохранённые поиски' }),
  ).toBeVisible();
  await expect(page.getByText('BMW near Amsterdam')).toBeVisible();
  const notificationsLoaded = page.waitForResponse(
    /\/api\/v1\/me\/notifications\?limit=20/,
  );
  await page.goto('/account/notifications');
  await notificationsLoaded;
  await expect(
    page.getByRole('heading', { name: 'Уведомления' }),
  ).toBeVisible();
  await page.goto('/account/messages/70000000-0000-4000-8000-000000000001');
  await expect(page.getByText('Is this vehicle available?')).toBeVisible();
  const message = `Browser E2E ${testInfo.project.name}`;
  await page.getByLabel('Сообщение').fill(message);
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText(message)).toBeVisible();
  assertClean();
});

test('parts fitment catalog and detail @critical', async ({ page }) => {
  const assertClean = observeBrowserErrors(page);
  await page.goto('/parts');
  await expect(
    page.getByRole('heading', { name: 'Автомобильные запчасти' }),
  ).toBeVisible();
  await expect(page.getByText('Bosch brake pads E2E')).toBeVisible();
  await page.getByRole('link', { name: 'Bosch brake pads E2E' }).click();
  await expect(page).toHaveURL(/\/parts\/93000000-/);
  await expect(
    page.getByRole('heading', { name: 'Bosch brake pads E2E' }),
  ).toBeVisible();
  await expect(page.getByText(/BMW/)).toBeVisible();
  assertClean();
});

test('authentication errors do not disclose account state @critical', async ({
  page,
}) => {
  await page.goto('/login?returnTo=https://evil.example/');
  const form = page.locator('main form').first();
  await form.getByLabel('Email').fill('missing@example.test');
  await form.getByLabel('Пароль').fill(password);
  await form.getByRole('button', { name: 'Вход' }).click();
  await expect(page.getByText('Неверный email или пароль.')).toBeVisible();
  await form.getByLabel('Email').fill(users.blocked);
  await form.getByRole('button', { name: 'Вход' }).click();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await form.getByLabel('Email').fill(users.seller);
  await form.getByRole('button', { name: 'Вход' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3200/account');
});

test('registration, verification, reset and account security @critical', async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '-');
  const email = `browser-${suffix}@example.test`;
  const initialPassword = `Browser-${suffix}-password-2026!`;
  const resetPassword = `Reset-${suffix}-password-2026!`;
  const changedPassword = `Changed-${suffix}-password-2026!`;
  await page.goto('/register');
  await page.getByLabel('Имя').fill(`Browser ${suffix}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(initialPassword);
  await page.getByRole('button', { name: 'Регистрация' }).click();
  await expect(page.getByRole('status')).toContainText('Аккаунт создан');

  const verification = await issueActionToken(email, 'EMAIL_VERIFICATION');
  await page.goto(`/verify-email#token=${verification}`);
  await page.getByRole('button', { name: 'Подтвердить email' }).click();
  await expect(page.getByRole('status')).toContainText('Email подтверждён');

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Получить инструкции' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Если подходящий аккаунт существует',
  );
  const reset = await issueActionToken(email, 'PASSWORD_RESET');
  await page.goto(`/reset-password#token=${reset}`);
  await page.getByLabel('Пароль').fill(resetPassword);
  await page.getByRole('button', { name: 'Сохранить пароль' }).click();
  await expect(page.getByRole('status')).toContainText('Пароль обновлён');

  await page.goto('/login');
  const loginForm = page.locator('main form').first();
  await loginForm.getByLabel('Email').fill(email);
  await loginForm.getByLabel('Пароль').fill(resetPassword);
  await loginForm.getByRole('button', { name: 'Вход' }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.goto('/account/security');
  await expect(page.getByText('Текущий сеанс')).toBeVisible();
  const passwordPanel = page
    .getByRole('heading', { name: 'Пароль' })
    .locator('..');
  await passwordPanel.getByLabel('Текущий пароль').fill(resetPassword);
  await passwordPanel
    .getByLabel('Новый пароль', { exact: true })
    .fill(changedPassword);
  await passwordPanel
    .getByLabel('Повторите новый пароль')
    .fill(changedPassword);
  await passwordPanel.getByRole('button', { name: 'Сменить пароль' }).click();
  await expect(page.getByRole('status')).toContainText('Пароль изменён');
});

test('seller, moderation and admin workspaces enforce browser roles @critical', async ({
  page,
}) => {
  await login(page, users.seller);
  await page.goto('/sell/car');
  await expect(
    page.getByRole('heading', { name: 'Продать автомобиль' }),
  ).toBeVisible();
  await page.goto('/sell/part');
  await expect(
    page.getByRole('heading', { name: 'Продать запчасть' }),
  ).toBeVisible();

  await page.context().clearCookies();
  await login(page, users.moderator);
  await page.goto('/moderation');
  await expect(page.getByRole('heading', { name: 'Модерация' })).toBeVisible();
  await page.goto('/moderation/reports');
  await expect(page.getByRole('heading', { name: 'Жалобы' })).toBeVisible();
  await page.goto('/admin');
  await expect(
    page.getByText('У вас нет доступа к этой рабочей области.'),
  ).toBeVisible();

  await page.context().clearCookies();
  await login(page, users.admin);
  await page.goto('/admin/users');
  await expect(
    page.getByRole('heading', { name: 'Пользователи' }),
  ).toBeVisible();
  await expect(page.getByText('seller@example.test')).toBeVisible();
  await page.goto('/admin/audit');
  await expect(
    page.getByRole('heading', { name: 'Аудит безопасности' }),
  ).toBeVisible();
});

test('core pages have no serious or critical accessibility violations @chromium', async ({
  page,
}) => {
  for (const path of ['/', '/cars', '/parts', '/login']) {
    await page.goto(path);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.filter(
        (item) => item.impact === 'serious' || item.impact === 'critical',
      ),
      path,
    ).toEqual([]);
  }
});

test('near-me is user initiated and denial is recoverable @chromium', async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  await page.goto('/cars');
  await page.getByRole('button', { name: 'Рядом со мной' }).click();
  await expect(
    page.getByText(
      'Доступ к местоположению отклонён. Поиск доступен без него.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Результаты поиска' }),
  ).toBeVisible();
});

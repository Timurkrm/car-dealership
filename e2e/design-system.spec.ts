import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, observeBrowserErrors, users } from './helpers';
import { verifyPersonalShell } from './shell-assertions';

async function checkA11y(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter(
      (item) => item.impact === 'serious' || item.impact === 'critical',
    ),
  ).toEqual([]);
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test('design foundation representative pages, contrast and reflow @chromium @mobile', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const assertClean = observeBrowserErrors(page);
  // This visual suite runs against Next directly; production WebSocket proxy
  // coverage lives in proxy.spec.ts. Give the UI a deterministic live transport.
  let socketConnections = 0;
  await page.routeWebSocket('**/socket.io/**', (socket) => {
    socketConnections++;
    socket.send(
      '0{"sid":"ui-shell","upgrades":[],"pingInterval":25000,"pingTimeout":20000}',
    );
    socket.onMessage((message) => {
      if (String(message).startsWith('40/realtime,'))
        socket.send('40/realtime,{"sid":"ui-shell"}');
      else if (message === '2') socket.send('3');
    });
  });
  for (const path of [
    '/login',
    '/register',
    '/',
    '/cars',
    '/parts',
    '/account',
    '/account/profile',
  ]) {
    // Keep the UI matrix off the buyer identity used by the critical/security suite.
    // Production authentication rate limits remain enabled in E2E.
    if (path === '/account') {
      await login(page, users.secondSeller);
      await verifyPersonalShell(page, info, () => socketConnections);
    }
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    if (path === '/cars')
      await expect(
        page.getByRole('region', { name: 'Результаты поиска' }),
      ).toContainText('BMW');
    if (path === '/parts')
      await expect(
        page.getByRole('link', { name: 'Bosch brake pads E2E' }),
      ).toBeVisible();
    if (path === '/account/profile')
      await expect(page.getByLabel('Отображаемое имя')).toBeEnabled();
    if (path === '/account')
      await expect(
        page.getByRole('button', { name: 'Выйти', exact: true }),
      ).toBeEnabled();
    await noOverflow(page);
    await checkA11y(page);
    const name = path === '/' ? 'home' : path.slice(1).replaceAll('/', '-');
    const image = info.outputPath(`${name}.png`);
    await page.screenshot({ path: image, fullPage: true });
    await info.attach(name, { path: image, contentType: 'image/png' });
    // 1440 physical pixels at 200% browser zoom gives a 720px CSS viewport.
    // CSS zoom alone keeps desktop media queries, so it is not equivalent.
    if (!info.project.name.startsWith('mobile')) {
      const viewport = page.viewportSize();
      if (!viewport) throw new Error('This project requires a fixed viewport');
      await page.setViewportSize({
        width: viewport.width / 2,
        height: viewport.height / 2,
      });
      await noOverflow(page);
      await page.setViewportSize(viewport);
    }
  }
  assertClean();
});

test('confirmation traps focus, escapes, returns focus and preserves session action @critical', async ({
  page,
}, info) => {
  await login(page, users.secondSeller);
  await page.goto('/account/security');
  const session = page
    .locator('.session-list li')
    .filter({ hasText: 'Текущий сеанс' });
  const trigger = session.getByRole('button', {
    name: 'Завершить сеанс',
    exact: true,
  });
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'DELETE' &&
      request.url().includes('/me/sessions/')
    )
      mutations.push(request.url());
  });
  await trigger.click();
  const dialog = page.getByRole('dialog', {
    name: 'Завершить текущий сеанс и выйти?',
  });
  const cancel = dialog.getByRole('button', { name: 'Отмена' });
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: 'Завершить', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: 'Закрыть', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Завершить', exact: true }),
  ).toBeFocused();
  await checkA11y(page);
  await page.screenshot({ path: info.outputPath('confirmation.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(mutations).toHaveLength(0);
  await trigger.click();
  await cancel.click();
  await expect(trigger).toBeFocused();
  expect(mutations).toHaveLength(0);
  await trigger.click();
  await dialog.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(mutations).toHaveLength(1);
});

test('form loading, keyboard focus, long labels, errors and reduced motion @chromium @mobile', async ({
  page,
}, info) => {
  await login(page, users.secondSeller);
  await page.goto('/account/profile');
  const input = page.getByLabel('Отображаемое имя');
  await expect(input).toBeEnabled();
  await input.focus();
  await expect(input).toHaveCSS('outline-style', 'solid');
  const submit = page.getByRole('button', { name: 'Сохранить', exact: true });
  const original = await submit.boundingBox();
  expect(original).not.toBeNull();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/me/profile', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await gate;
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid name' },
      }),
    });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute('aria-busy', 'true');
  await expect(input).toBeDisabled();
  const loading = await submit.boundingBox();
  expect(loading?.width).toBe(original?.width);
  expect(loading?.height).toBe(original?.height);
  await expect(submit.locator('.ui-spinner')).toHaveCSS(
    'animation-name',
    'none',
  );
  release();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(submit).toBeEnabled();
  await noOverflow(page);
  await checkA11y(page);
  await page.screenshot({
    path: info.outputPath('profile-error.png'),
    fullPage: true,
  });
  // Stress a real button's layout without changing application state or API behavior.
  await submit.locator('.ui-button-label').evaluate((element) => {
    element.textContent =
      'Сохранить изменения профиля и отображаемого имени пользователя';
  });
  await noOverflow(page);
  const longLabel = await page
    .getByRole('button', {
      name: 'Сохранить изменения профиля и отображаемого имени пользователя',
    })
    .boundingBox();
  expect(longLabel?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: info.outputPath('long-label.png'),
    fullPage: true,
  });
});

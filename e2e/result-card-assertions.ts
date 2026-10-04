import { expect, type Page } from '@playwright/test';
/** Uses an already authenticated scenario; no additional login or relaxed limits. */
export async function verifyResultFavorite(page: Page) {
  let reads = 0;
  const observe = (request: { method(): string; url(): string }) => {
    if (
      request.method() === 'GET' &&
      request.url().includes('/api/v1/me/favorites')
    )
      reads++;
  };
  page.on('request', observe);
  await page.goto('/cars');
  const card = page.locator('.result-card').filter({
    has: page.getByRole('link', {
      name: 'BMW 3 Series — Rotterdam',
      exact: true,
    }),
  });
  const add = card.getByRole('button', { name: 'Добавить в избранное' });
  await expect(add).toBeEnabled();
  const before = new URL(page.url()).pathname;
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  let mutations = 0;
  const pattern = '**/api/v1/me/favorites/*';
  await page.route(pattern, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    mutations++;
    started();
    await gate;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  try {
    await add.click();
    await pending;
    const remove = card.getByRole('button', { name: 'Удалить из избранного' });
    await expect(remove).toBeDisabled();
    await remove.evaluate((element) => {
      (element as HTMLButtonElement).click();
      (element as HTMLButtonElement).click();
    });
    expect(mutations).toBe(1);
    release();
    await expect(remove).toBeEnabled();
    await expect(remove).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(page.url()).pathname).toBe(before);
    await remove.focus();
    await expect(remove).toBeFocused();
    await remove.press('Enter');
    await expect(add).toBeEnabled();
    await expect(add).toHaveAttribute('aria-pressed', 'false');
    expect(new URL(page.url()).pathname).toBe(before);
    expect(reads).toBe(0);
  } finally {
    release();
    await page.unroute(pattern);
    page.off('request', observe);
  }
}

import { test, expect } from '@playwright/test';

test('catalog list and map remain usable on mobile @mobile', async ({
  page,
}) => {
  await page.goto('/cars');
  await expect(
    page.getByRole('heading', { name: 'Каталог автомобилей' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(
    page.getByRole('application', { name: /Интерактивная карта/ }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.goto('/parts');
  await expect(
    page.getByRole('heading', { name: 'Автомобильные запчасти' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(
    page.getByRole('application', { name: /Интерактивная карта/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

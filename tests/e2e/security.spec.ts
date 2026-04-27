import { test, expect } from '@playwright/test';

test.describe('Unauthorized access', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('blocks API access without session', async ({ request }) => {
    const res = await request.post('/api/agents/invoke');
    expect(res.status()).toBe(401);
  });
});

test('logout flow clears persistent state', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /logout/i }).click();
  await expect(page).toHaveURL(/\/login/);

  const state = await page.context().storageState();
  expect(state.cookies).toHaveLength(0);
});

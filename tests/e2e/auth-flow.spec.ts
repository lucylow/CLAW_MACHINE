import { test, expect } from '@playwright/test';

test.use({ storageState: 'playwright/.auth/user.json' });

test('user can open dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
});

test('user can access agent session management', async ({ page }) => {
  await page.goto('/sessions');
  await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
});

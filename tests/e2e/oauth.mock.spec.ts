import { test, expect } from '@playwright/test';

test('oauth flow proceeds through mocked redirect', async ({ page }) => {
  await page.route('**/auth/provider/google**', async (route) => {
    const url = new URL(route.request().url());
    const state = url.searchParams.get('state');
    const redirectUri = url.searchParams.get('redirect_uri');

    await route.fulfill({
      status: 302,
      headers: {
        Location: `${redirectUri}?code=mock-code&state=${state}`,
      },
    });
  });

  await page.goto('/login');
  await page.getByRole('button', { name: /continue with google/i }).click();

  await expect(page).toHaveURL(/\/dashboard/);
});

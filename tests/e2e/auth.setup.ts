import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const authFile = path.join(__dirname, '../../playwright/.auth/user.json');

setup('authenticate user', async ({ page }) => {
  await page.goto('/login');

  // Stable selectors for CLAW MACHINE credential login form.
  await page.getByLabel(/email/i).fill(process.env.E2E_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait until authenticated navigation is complete.
  await page.waitForURL(/\/dashboard|\/sessions/);
  await expect(page.getByText(/welcome/i)).toBeVisible();

  await fs.mkdir(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});

import { test, expect } from '@playwright/test';

test.describe('Gateway API Authentication', () => {
  test('rejects request with missing token', async ({ request }) => {
    const res = await request.get('/api/sessions');
    expect(res.status()).toBe(401);
  });

  test('accepts valid gateway bearer token', async ({ request }) => {
    const res = await request.get('/api/sessions', {
      headers: {
        Authorization: `Bearer ${process.env.GATEWAY_TOKEN}`,
      },
    });
    expect(res.ok()).toBeTruthy();
  });
});

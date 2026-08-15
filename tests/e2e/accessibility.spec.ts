import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('accessibility smoke checks', () => {
  test('landing page has no serious axe violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test('admin sign-in exposes labelled controls', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('textbox', { name: /login/i })).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });
});

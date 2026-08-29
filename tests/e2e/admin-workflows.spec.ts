import { expect, test } from '@playwright/test';

const ADMIN_LOGIN = process.env.E2E_ADMIN_LOGIN ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin';

const POLYGON_AREA = JSON.stringify({
  type: 'Polygon',
  coordinates: [
    [
      [-75.9, 45.2],
      [-75.4, 45.2],
      [-75.4, 45.7],
      [-75.9, 45.7],
      [-75.9, 45.2],
    ],
  ],
});

async function csrfHeader(page: any) {
  const csrf = await page.evaluate(() => {
    const match = document.cookie.match(/(?:^|;)\s*impact_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1] ?? '') : '';
  });
  return { 'x-csrf-token': csrf };
}

async function signIn(page: any) {
  await page.goto('/admin');
  await page.fill('input[name="login"]', ADMIN_LOGIN);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button:has-text("Sign in")');
  try {
    await page.waitForSelector('text=Incident maps', { timeout: 5000 });
  } catch {
    await page.request.post('/api/admin/login', {
      data: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
    });
    await page.goto('/admin');
    await page.waitForSelector('text=Incident maps');
  }
}

async function createAndPublishIncident(page: any, title: string) {
  // Use the admin API to create/publish so the polygon-drawing workflow is not
  // blocked by create-form contention when many projects run in parallel.
  const headers = await csrfHeader(page);
  const createResponse = await page.request.post('/api/admin/incidents', {
    headers,
    data: {
      title,
      templateKey: 'storm-damage',
      center: { latitude: 45.42, longitude: -75.69, zoom: 10 },
      reportingArea: JSON.parse(POLYGON_AREA),
      reportGeometryMode: 'polygon',
    },
  });
  if (!createResponse.ok()) {
    const body = await createResponse.text().catch(() => '');
    throw new Error(`Create incident failed: ${createResponse.status()} ${body}`);
  }
  const created = (await createResponse.json()) as { id: string; url: string };

  const publishResponse = await page.request.post(`/api/admin/incidents/${created.id}/publish`, {
    headers,
    data: {},
  });
  expect(publishResponse.ok()).toBeTruthy();

  return created.url;
}

test.describe('admin workflows', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });
  });

  test('polygon report submission works on pointer and touch viewports', async ({ page }) => {
    await signIn(page);
    const title = `E2E Polygon ${Date.now()}`;
    const urlCell = await createAndPublishIncident(page, title);
    expect(urlCell).toBeTruthy();

    await page.goto(`${urlCell}/report`);
    const map = page.locator('.geometry-picker .picker-map');
    await map.waitFor({ state: 'visible', timeout: 15_000 });

    // Draw a triangle on the polygon picker map.
    const box = await map.boundingBox();
    expect(box).toBeTruthy();
    await map.click({ position: { x: box!.width * 0.4, y: box!.height * 0.4 } });
    await map.click({ position: { x: box!.width * 0.6, y: box!.height * 0.4 } });
    await map.click({ position: { x: box!.width * 0.5, y: box!.height * 0.6 } });

    await page.click('button:has-text("Finish area")');
    await expect(page.locator('button:has-text("Continue")').first()).toBeEnabled();
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.selectOption('select[name="damage_type"]', 'tree_down');
    await page.locator('input[name="severity"][value="minor"]').check();
    await page.fill('input[name="observed_at"]', '2026-08-12T10:30');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Submit report")');
    await page.waitForSelector('text=your report has been saved');
  });

  test('template field editing retains focus and persists', async ({ page }) => {
    await signIn(page);
    const key = `e2e-field-${Date.now()}`;
    const headers = await csrfHeader(page);
    const created = await page.request.post('/api/admin/templates', {
      headers,
      data: {
        key,
        title: 'E2E Field Focus',
        schema: {
          version: 1,
          fields: [
            {
              key: 'details',
              type: 'short_text',
              label: 'Details',
              required: false,
              order: 0,
            },
          ],
        },
      },
    });
    expect(created.ok()).toBeTruthy();
    try {
      await page.goto(`/admin/templates/${key}`);
      await page.getByRole('button', { name: 'Details' }).click();
      const labelInput = page
        .locator('.u-field-stack label')
        .filter({ hasText: 'Label' })
        .locator('input');
      await labelInput.fill('Updated details');
      await expect(labelInput).toBeFocused();
      await expect(labelInput).toHaveValue('Updated details');
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByText('Saved')).toBeVisible();
      await page.reload();
      await expect(page.getByText('Updated details')).toBeVisible();
    } finally {
      // The next isolated run also removes this prefix. Keep cleanup bounded so a
      // temporarily unhealthy app cannot turn a useful focus regression into a hang.
      await page.request
        .delete(`/api/admin/templates/${key}`, { headers, timeout: 5_000 })
        .catch(() => undefined);
    }
  });
});

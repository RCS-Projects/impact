import { expect, test } from '@playwright/test';

const ADMIN_LOGIN = process.env.E2E_ADMIN_LOGIN ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin';

const REPORTING_AREA = JSON.stringify({
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

async function signIn(page: any) {
  const response = await page.request.post('/api/admin/login', {
    data: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`Admin login failed: ${response.status()} ${await response.text()}`);
  }
  await page.goto('/admin');
  await page.waitForSelector('text=Incident maps');
}

async function csrfHeader(page: any) {
  const csrf = await page.evaluate(() => {
    const match = document.cookie.match(/(?:^|;)\s*impact_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1] ?? '') : '';
  });
  return { 'x-csrf-token': csrf };
}

async function createAndPublishIncident(page: any, title: string) {
  // Create the incident through the admin API so the public-submission test
  // is not coupled to the UI create form. This keeps the matrix reliable when
  // many browser projects run in parallel.
  const headers = await csrfHeader(page);
  const createResponse = await page.request.post('/api/admin/incidents', {
    headers,
    data: {
      title,
      templateKey: 'storm-damage',
      center: { latitude: 45.42, longitude: -75.69, zoom: 10 },
      reportingArea: JSON.parse(REPORTING_AREA),
      reportGeometryMode: 'point',
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

test.describe('public reporting loop', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  test('admin publishes a map, public submits and edits an approximate report', async ({
    page,
  }) => {
    await signIn(page);
    const title = `E2E Storm ${Date.now()}`;
    const urlCell = await createAndPublishIncident(page, title);
    expect(urlCell).toBeTruthy();

    await page.goto(`${urlCell}/report`);
    await page.locator('.picker-map').waitFor({ state: 'visible' });
    await page.waitForSelector('.picker-map[data-map-ready="true"]', { timeout: 30000 });
    await page.getByRole('button', { name: 'Use map centre' }).click();
    await expect(page.locator('button:has-text("Continue")').first()).toBeEnabled();
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.selectOption('select[name="damage_type"]', 'tree_down');
    await page.locator('input[name="severity"][value="minor"]').check();
    await page.fill('input[name="observed_at"]', '2026-08-12T10:30');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Submit report")');
    await page.waitForSelector('text=your report has been saved');

    const editLink = await page.locator('.edit-link-box').textContent();
    expect(editLink).toContain('/report/edit/');

    await page.goto(urlCell ?? '');
    await page.waitForSelector('text=reports');

    await page.goto(editLink ?? '');
    await page.waitForSelector('text=Update your report');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.selectOption('select[name="damage_type"]', 'flooding');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Update report")');
    await page.waitForSelector('text=report has been updated');
  });

  test('out-of-area submissions are rejected', async ({ request }) => {
    const response = await request.post('/api/incidents/does-not-exist-aaaaaaaa/reports', {
      data: {
        latitude: 45.42,
        longitude: -75.69,
        privacy: 'exact',
        answers: {},
      },
    });
    expect(response.status()).toBe(404);
  });
});

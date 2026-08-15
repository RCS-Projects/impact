import { chromium, devices } from 'playwright-core';

const BASE = process.env.E2E_BASE_URL ?? 'http://192.168.120.7:3000';
const REF = process.env.E2E_REFERENCE ?? 'renfrew-county-storm-damage-kxs8wdc5';
const OUT = '/tmp/opencode/mobile-shots';

async function main() {
  const browser = await chromium.launch();
  const failures: string[] = [];
  const check = (label: string, ok: boolean) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failures.push(label);
  };

  for (const deviceName of ['Pixel 5', 'iPhone 14']) {
    const device = devices[deviceName];
    if (!device) throw new Error(`unknown device ${deviceName}`);
    const context = await browser.newContext({ ...device });
    const page = await context.newPage();
    const tag = deviceName.replace(/\s+/g, '-').toLowerCase();
    console.log(`\n=== ${deviceName} (${device.viewport.width}x${device.viewport.height}) ===`);

    await page.goto(`${BASE}/map/${REF}`);
    await page.waitForSelector('.maplibregl-map');
    await page.waitForTimeout(3_000);

    check('map page: FAB visible', await page.locator('.fab').isVisible());
    check('map page: topbar CTA hidden', !(await page.locator('.topbar-cta').isVisible()));
    check(
      'map page: viewport meta covers device width',
      (await page.locator('meta[name="viewport"]').getAttribute('content'))?.includes(
        'viewport-fit=cover',
      ) ?? false,
    );
    await page.screenshot({ path: `${OUT}/${tag}-map.png` });

    await page.click('button:has-text("Filters")');
    await page.waitForSelector('.filter-panel');
    const filterBox = await page.locator('.filter-panel').boundingBox();
    check(
      'filters: bottom sheet anchored to bottom',
      Boolean(
        filterBox &&
          filterBox.y + filterBox.height >= device.viewport.height - 2 &&
          filterBox.width >= device.viewport.width - 2,
      ),
    );
    await page.screenshot({ path: `${OUT}/${tag}-filters.png` });

    await page.locator('details summary:has-text("Report list")').click();
    const listButton = page.locator('.filter-panel details button').first();
    if ((await listButton.count()) > 0) {
      await listButton.click();
      await page.waitForSelector('.detail-panel');
      const detailBox = await page.locator('.detail-panel').boundingBox();
      check(
        'detail: opens as bottom sheet',
        Boolean(detailBox && detailBox.y > device.viewport.height * 0.4),
      );
      check(
        'detail: shows crowdsourced label',
        (await page.locator('.detail-panel').textContent())?.includes('Crowdsourced') ?? false,
      );
      await page.screenshot({ path: `${OUT}/${tag}-detail.png` });
      await page.click('.detail-close');
    } else {
      check('detail: report present in list', false);
    }

    await page.goto(`${BASE}/map/${REF}/report`);
    await page.waitForSelector('.picker-map');
    const cards = page.locator('.privacy-card');
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    check(
      'report form: privacy cards stack vertically',
      Boolean(first && second && second.y >= first.y + first.height - 1),
    );
    const inputFontSize = await page
      .locator('input#geocode-query')
      .evaluate((el) => window.getComputedStyle(el).fontSize);
    check(`report form: inputs are 16px (got ${inputFontSize})`, inputFontSize === '16px');
    const buttonHeight = await page
      .locator('button:has-text("Submit report")')
      .evaluate((el) => el.getBoundingClientRect().height);
    check(`report form: submit button >= 44px (got ${buttonHeight})`, buttonHeight >= 44);
    await page.screenshot({ path: `${OUT}/${tag}-report-form.png`, fullPage: true });

    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('input[name="login"]');
    await page.screenshot({ path: `${OUT}/${tag}-admin-login.png` });
    await context.close();
  }

  await browser.close();
  console.log(
    failures.length === 0 ? '\nALL MOBILE CHECKS PASSED' : `\n${failures.length} FAILURES`,
  );
  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

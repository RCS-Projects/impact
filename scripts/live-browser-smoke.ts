import { chromium } from 'playwright';

const url = process.env.SMOKE_BASE_URL ?? 'https://impact.renfrewcountyscanner.com/';
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  const text = await page.locator('body').innerText();
  console.log(
    JSON.stringify({
      status: response?.status(),
      title: await page.title(),
      text: text.slice(0, 500),
      errors,
    }),
  );
  await page.screenshot({ path: '/tmp/impact-live.png', fullPage: true });
  await browser.close();
  if (!response || response.status() >= 400 || !text.trim() || errors.length) process.exitCode = 1;
}

void main();

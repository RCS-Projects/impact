const base = (
  process.env.SMOKE_BASE_URL ??
  process.env.E2E_BASE_URL ??
  'http://127.0.0.1:3000'
).replace(/\/$/, '');

const checks: Array<[string, number]> = [
  ['/api/health', 200],
  ['/api/ready', 200],
  ['/', 200],
  ['/admin', 200],
];

async function main() {
  const failures: string[] = [];
  for (const [path, expected] of checks) {
    const response = await fetch(`${base}${path}`, { redirect: 'manual' });
    const ok = response.status === expected;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${path} (${response.status})`);
    if (!ok) failures.push(`${path}: expected ${expected}, got ${response.status}`);
    if (path === '/') {
      for (const header of [
        'content-security-policy',
        'x-content-type-options',
        'referrer-policy',
      ]) {
        if (!response.headers.get(header)) failures.push(`${path}: missing ${header}`);
      }
    }
  }

  const sse = await fetch(`${base}/api/incidents/does-not-exist/events`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (sse.status !== 404)
    failures.push(`SSE missing-incident check: expected 404, got ${sse.status}`);
  else console.log('PASS SSE endpoint responds to an unknown incident');

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Deployment smoke checks passed');
  }
}

void main();

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    return String(pkg.version ?? '0.2.0');
  } catch {
    return '0.2.0';
  }
}

export function GET() {
  return NextResponse.json({
    service: 'impact-system',
    version: readPackageVersion(),
    commit: process.env.GIT_COMMIT || 'unknown',
    builtAt: process.env.BUILD_TIME || 'unknown',
  });
}

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import crypto from 'node:crypto';
import { logError } from './log';
export { AppError } from './app-error';
import { AppError } from './app-error';

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { ...error.headers, 'Cache-Control': 'no-store' } },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Invalid input',
        code: 'bad_request',
        details: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  logError('unhandled_api_error', error);
  return NextResponse.json(
    { error: 'Something went wrong', code: 'internal' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function handleApi<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    const requestId = crypto.randomUUID();
    try {
      const response = await handler(...args);
      response.headers.set('X-Request-ID', requestId);
      return response;
    } catch (error) {
      const response = errorResponse(error);
      response.headers.set('X-Request-ID', requestId);
      return response;
    }
  };
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message = 'Invalid request') { return new AppError(400, 'bad_request', message); }
  static unauthorized(message = 'Unauthorized') { return new AppError(401, 'unauthorized', message); }
  static forbidden(message = 'Forbidden') { return new AppError(403, 'forbidden', message); }
  static notFound(message = 'Not found') { return new AppError(404, 'not_found', message); }
  static conflict(message: string) { return new AppError(409, 'conflict', message); }
  static unprocessable(message: string) { return new AppError(422, 'unprocessable', message); }
  static rateLimited(retryAfterSeconds: number) {
    return new AppError(429, 'rate_limited', 'Too many requests. Please try again later.', { 'Retry-After': String(retryAfterSeconds) });
  }
  static serverUnavailable(message = 'Service temporarily unavailable') { return new AppError(503, 'unavailable', message); }
}

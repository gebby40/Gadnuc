/**
 * Shared error handling middleware and helpers.
 *
 * Provides:
 *  - AppError class for structured error responses
 *  - asyncHandler wrapper to catch rejected promises in route handlers
 *  - globalErrorHandler Express error middleware
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Insufficient permissions'): AppError {
    return new AppError(403, message, 'FORBIDDEN');
  }

  static notFound(resource = 'Resource'): AppError {
    return new AppError(404, `${resource} not found`, 'NOT_FOUND');
  }

  static conflict(message: string): AppError {
    return new AppError(409, message, 'CONFLICT');
  }

  static validationFailed(issues: unknown): AppError {
    return new AppError(422, 'Validation failed', 'VALIDATION_ERROR', issues);
  }

  static tooManyRequests(retryAfterMs: number): AppError {
    return new AppError(429, 'Too many requests', 'RATE_LIMITED', { retry_after_ms: retryAfterMs });
  }
}

/**
 * Wraps an async route handler so rejected promises are forwarded to
 * Express error middleware instead of causing unhandled rejections.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global Express error handler — must be registered LAST with `app.use()`.
 *
 * Formats AppError instances into structured JSON responses.
 * Unknown errors return 500 with a generic message (details only in dev).
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: err.message,
    };
    if (err.code) body.code = err.code;
    if (err.details) body.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }

  // CORS errors from the cors middleware
  if (err.message.startsWith('CORS:')) {
    res.status(403).json({ error: err.message });
    return;
  }

  // Log unexpected errors
  console.error('[error-handler] Unhandled error:', err);

  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: 'Internal server error',
    ...(isDev ? { detail: err.message, stack: err.stack } : {}),
  });
}

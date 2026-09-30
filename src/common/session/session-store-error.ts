import { Logger } from '@nestjs/common';
import { RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RedisClientType } from 'redis';

export const SESSION_STORE_RETRY_AFTER_SECONDS = 5;
const OAUTH_SESSION_PATHS = new Set(['/auth/google', '/auth/google/callback']);

export function createOAuthSessionMiddleware(sessionMiddleware: RequestHandler): RequestHandler {
  return (request, response, next): void => {
    if (!OAUTH_SESSION_PATHS.has(request.path)) {
      next();
      return;
    }

    sessionMiddleware(request, response, next);
  };
}

export function handleSessionStoreError(
  error: unknown,
  response: Response,
  logger: Pick<Logger, 'error'>
): void {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  logger.error(`Session store unavailable (${errorName})`);
  response.setHeader('Retry-After', String(SESSION_STORE_RETRY_AFTER_SECONDS));
  response.status(503).json({
    statusCode: 503,
    message: 'Session service temporarily unavailable',
    retryAfterSeconds: SESSION_STORE_RETRY_AFTER_SECONDS,
  });
}

export function createOAuthSessionStorePreflight(
  redis: Pick<RedisClientType, 'set' | 'del'>,
  logger: Pick<Logger, 'error'>
): RequestHandler {
  return async (request, response, next): Promise<void> => {
    if (!OAUTH_SESSION_PATHS.has(request.path)) {
      next();
      return;
    }

    try {
      const probeKey = `calassist:session:preflight:${randomUUID()}`;
      await redis.set(probeKey, '1', { EX: 5 });
      await redis.del(probeKey);
    } catch (error) {
      handleSessionStoreError(error, response, logger);
      return;
    }

    next();
  };
}

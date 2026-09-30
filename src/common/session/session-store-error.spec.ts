import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RedisClientType } from 'redis';
import {
  createOAuthSessionMiddleware,
  createOAuthSessionStorePreflight,
  handleSessionStoreError,
  SESSION_STORE_RETRY_AFTER_SECONDS,
} from './session-store-error';

describe('handleSessionStoreError', () => {
  it('fails session requests closed with 503 and a retry hint', () => {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    const logger = { error: jest.fn() } as unknown as Logger;

    handleSessionStoreError(new Error('Redis unavailable'), response, logger);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      String(SESSION_STORE_RETRY_AFTER_SECONDS)
    );
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 503,
      message: 'Session service temporarily unavailable',
      retryAfterSeconds: SESSION_STORE_RETRY_AFTER_SECONDS,
    });
    expect(logger.error).toHaveBeenCalledWith('Session store unavailable (Error)');
  });
});

describe('createOAuthSessionMiddleware', () => {
  it('does not read a stale session cookie on ordinary API routes', () => {
    const sessionMiddleware = jest.fn();
    const next = jest.fn();
    const middleware = createOAuthSessionMiddleware(sessionMiddleware);
    const request = {
      path: '/api/tasks',
      headers: { cookie: 'connect.sid=stale-session' },
    } as Request;

    middleware(request, {} as Response, next as NextFunction);

    expect(sessionMiddleware).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each(['/auth/google', '/auth/google/callback'])(
    'runs session middleware for OAuth route %s',
    (path) => {
      const sessionMiddleware = jest.fn();
      const next = jest.fn();
      const middleware = createOAuthSessionMiddleware(sessionMiddleware);

      middleware({ path } as Request, {} as Response, next as NextFunction);

      expect(sessionMiddleware).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    }
  );
});

describe('createOAuthSessionStorePreflight', () => {
  it.each(['/auth/google', '/auth/google/callback'])(
    'rejects %s with a retryable 503 when Redis cannot persist session state',
    async (path) => {
      const redis: Pick<RedisClientType, 'set' | 'del'> = {
        set: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
        del: jest.fn(),
      };
      const response = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const logger = { error: jest.fn() } as unknown as Logger;
      const next = jest.fn();
      const middleware = createOAuthSessionStorePreflight(redis, logger);

      await middleware({ path } as Request, response, next);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^calassist:session:preflight:/),
        '1',
        { EX: 5 }
      );
      expect(redis.del).not.toHaveBeenCalled();
      expect(response.status).toHaveBeenCalledWith(503);
      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '5');
      expect(next).not.toHaveBeenCalled();
    }
  );

  it('does not probe Redis for routes that do not create or consume OAuth sessions', async () => {
    const redis: Pick<RedisClientType, 'set' | 'del'> = {
      set: jest.fn(),
      del: jest.fn(),
    };
    const response = {} as Response;
    const next = jest.fn();
    const middleware = createOAuthSessionStorePreflight(redis, {
      error: jest.fn(),
    } as unknown as Logger);

    await middleware({ path: '/api/status' } as Request, response, next);

    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('continues OAuth session requests after a successful Redis preflight', async () => {
    const redis: Pick<RedisClientType, 'set' | 'del'> = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const next = jest.fn();
    const middleware = createOAuthSessionStorePreflight(redis, {
      error: jest.fn(),
    } as unknown as Logger);

    await middleware({ path: '/auth/google' } as Request, {} as Response, next);

    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

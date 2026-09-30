import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from '../../metrics/metrics.service';
import { RequestLoggerMiddleware } from './request-logger.middleware';

describe('RequestLoggerMiddleware', () => {
  afterEach(() => jest.restoreAllMocks());

  const createMetrics = (): MetricsService =>
    ({
      incrementHttpRequests: jest.fn(),
      observeHttpDuration: jest.fn(),
    }) as unknown as MetricsService;

  it('does not log query strings, user-agent, cookies, or authorization headers', () => {
    const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    let finish: (() => void) | undefined;
    const metrics = createMetrics();
    const request = {
      method: 'GET',
      url: '/api/private?access_token=query-secret',
      headers: {
        authorization: '******',
        cookie: 'session=cookie-secret',
        'user-agent': 'agent-secret',
      },
      ip: '192.0.2.1',
      baseUrl: '/api',
      route: { path: '/private' },
      get: () => undefined,
    } as unknown as Request;
    const response = {
      on: (_event: string, listener: () => void) => {
        finish = listener;
      },
      get: () => undefined,
      setHeader: jest.fn(),
      locals: {},
      statusCode: 200,
    } as unknown as Response;

    const next = jest.fn() as NextFunction;
    new RequestLoggerMiddleware(metrics).use(request, response, next);
    finish?.();

    expect(next).toHaveBeenCalledTimes(1);
    expect(loggerSpy.mock.calls.flat().join(' ')).not.toMatch(
      /query-secret|bearer-secret|cookie-secret|agent-secret/
    );
    expect(loggerSpy.mock.calls.flat().join(' ')).toContain('/api/private');
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
    expect(metrics.incrementHttpRequests).toHaveBeenCalledWith('GET', '/api/private', 200);
    expect(metrics.observeHttpDuration).toHaveBeenCalledWith(
      'GET',
      '/api/private',
      expect.any(Number)
    );
  });

  it('replaces invalid inbound request IDs and emits structured production logs', () => {
    const originalEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const metrics = createMetrics();
    let finish: (() => void) | undefined;
    const headers: Record<string, string> = {
      'x-request-id': 'bad\nforged-log-line',
    };
    const request = {
      method: 'GET',
      headers,
      ip: '192.0.2.1',
      baseUrl: '',
      route: { path: '/status' },
      get: (name: string) => headers[name.toLowerCase()],
    } as unknown as Request;
    const response = {
      on: (_event: string, listener: () => void) => {
        finish = listener;
      },
      get: () => undefined,
      setHeader: jest.fn(),
      locals: {},
      statusCode: 200,
    } as unknown as Response;

    try {
      new RequestLoggerMiddleware(metrics).use(request, response, jest.fn() as NextFunction);
      finish?.();
    } finally {
      if (originalEnvironment === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalEnvironment;
      }
    }

    const loggedEvent = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(loggedEvent).toMatchObject({
      event: 'http_request',
      method: 'GET',
      route: '/status',
      statusCode: 200,
    });
    expect(loggedEvent.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', loggedEvent.requestId);
  });
});

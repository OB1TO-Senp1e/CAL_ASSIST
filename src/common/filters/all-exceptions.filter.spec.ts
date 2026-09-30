import { ArgumentsHost, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AiProviderError } from '../../integrations/ai-providers/ai-provider.error';

describe('AllExceptionsFilter', () => {
  it('omits query strings and credential headers from logs and error paths', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const request = {
      method: 'GET',
      path: '/api/private',
      url: '/api/private?access_token=query-secret',
      headers: {
        authorization: 'Bearer bearer-secret',
        cookie: 'session=cookie-secret',
      },
    } as Request;
    const response = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      json: jest.fn(),
      locals: { requestId: 'request-123' },
    } as unknown as Response;
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    new AllExceptionsFilter().catch(new Error('failure'), host);

    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).not.toMatch(/query-secret|bearer-secret|cookie-secret/);
    expect(logged).toContain('/api/private');
    expect(logged).toContain('requestId=request-123');
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/private' }));
  });

  it('returns retryable AI provider failures as 503 with a Retry-After header', () => {
    const request = {
      method: 'POST',
      path: '/api/ai/intent/parse',
      url: '/api/ai/intent/parse',
    } as Request;
    const response = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      json: jest.fn(),
      locals: {},
    } as unknown as Response;
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    new AllExceptionsFilter().catch(
      new AiProviderError('provider unavailable', {
        provider: 'OpenAI',
        kind: 'network',
        retryable: true,
        retryAfterSeconds: 7,
      }),
      host
    );

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '7');
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        error: 'AI providers are temporarily unavailable',
      })
    );
  });
});

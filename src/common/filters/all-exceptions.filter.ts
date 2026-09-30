import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AiProviderError } from '../../integrations/ai-providers/ai-provider.error';

/**
 * Flattens a ZodError into "path: message" strings so a validation failure reads
 * as an actionable 400 instead of an opaque 500.
 */
function describeZodError(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestPath = request.path || request.url.split('?')[0];
    const requestId = response.locals?.requestId;
    const logContext = requestId
      ? `${request.method} ${requestPath} requestId=${requestId}`
      : `${request.method} ${requestPath}`;

    // Domain services validate payloads with zod and let ZodError escape. Without
    // this branch those become 500s, which hides real client-contract mistakes.
    let normalised: unknown = exception;
    let retryAfterSeconds: number | undefined;
    if (exception instanceof ZodError) {
      normalised = new BadRequestException(describeZodError(exception));
    } else if (AiProviderError.is(exception)) {
      retryAfterSeconds = exception.retryable
        ? Math.max(1, exception.retryAfterSeconds ?? 30)
        : undefined;
      normalised = new HttpException(
        {
          statusCode: 503,
          message: 'AI providers are temporarily unavailable',
          retryable: exception.retryable,
          ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
        },
        503
      );
    }

    const status = normalised instanceof HttpException ? normalised.getStatus() : 500;

    const message =
      normalised instanceof HttpException ? normalised.getResponse() : 'Internal server error';

    if (status === 500) {
      this.logger.error(logContext, exception instanceof Error ? exception.stack : 'Unknown error');
    } else {
      this.logger.warn(logContext, `${status} - ${JSON.stringify(message)}`);
    }

    if (retryAfterSeconds) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: requestPath,
      error:
        typeof message === 'object' && message !== null
          ? (message as any).message || message
          : message,
    });
  }
}

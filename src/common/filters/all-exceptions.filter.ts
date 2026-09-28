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

    // Domain services validate payloads with zod and let ZodError escape. Without
    // this branch those become 500s, which hides real client-contract mistakes.
    let normalised: unknown = exception;
    if (exception instanceof ZodError) {
      normalised = new BadRequestException(describeZodError(exception));
    }

    const status = normalised instanceof HttpException ? normalised.getStatus() : 500;

    const message =
      normalised instanceof HttpException ? normalised.getResponse() : 'Internal server error';

    if (status === 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : 'Unknown error'
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url}`,
        `${status} - ${JSON.stringify(message)}`
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error:
        typeof message === 'object' && message !== null
          ? (message as any).message || message
          : message,
    });
  }
}

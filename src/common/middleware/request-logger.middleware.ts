import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RequestLogger');

  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const { method } = req;
    const suppliedRequestId = req.get('x-request-id');
    const requestId =
      suppliedRequestId && /^[A-Za-z0-9._-]{1,128}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    const startTime = Date.now();

    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');
      const responseTimeMs = Date.now() - startTime;
      const matchedRoute = req.route?.path;
      const route =
        typeof matchedRoute === 'string' ? `${req.baseUrl}${matchedRoute}` : 'unmatched';

      this.metrics.incrementHttpRequests(method, route, statusCode);
      this.metrics.observeHttpDuration(method, route, responseTimeMs / 1000);

      const event = {
        timestamp: new Date().toISOString(),
        level: 'info',
        event: 'http_request',
        requestId,
        method,
        route,
        statusCode,
        contentLength: contentLength ?? null,
        responseTimeMs,
        clientIp: req.ip ?? 'unknown',
      };

      if (process.env.NODE_ENV === 'production') {
        console.log(JSON.stringify(event));
      } else {
        this.logger.log(
          `${requestId} ${method} ${route} ${statusCode} ${contentLength ?? '-'} ${responseTimeMs}ms client=${req.ip}`
        );
      }
    });

    next();
  }
}

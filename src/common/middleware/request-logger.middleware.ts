import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RequestLogger');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, url, headers } = req;
    const userAgent = headers['user-agent'] || '';
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');
      const responseTime = Date.now() - startTime;
      this.logger.log(
        `${method} ${url} ${statusCode} ${contentLength} - ${userAgent} - ${responseTime}ms`
      );
    });

    next();
  }
}

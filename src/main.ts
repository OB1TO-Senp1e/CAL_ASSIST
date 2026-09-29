import { NestFactory } from '@nestjs/core';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import session from 'express-session';
import { NextFunction, Request, Response } from 'express';
import { RedisClientType } from 'redis';
import { RedisStore } from 'connect-redis';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { REDIS_CLIENT } from './common/redis/redis.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { configureProxyTrust } from './common/proxy';
import { parseCorsAllowlist } from './common/cors';
import { MetricsService } from './metrics/metrics.service';
import {
  createOAuthSessionMiddleware,
  createOAuthSessionStorePreflight,
  handleSessionStoreError,
} from './common/session/session-store-error';

function getSessionSameSite(): 'lax' | 'strict' | 'none' {
  const value = process.env.SESSION_COOKIE_SAME_SITE || 'lax';
  if (value === 'lax' || value === 'strict' || value === 'none') return value;
  throw new Error('SESSION_COOKIE_SAME_SITE must be lax, strict, or none');
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const redisClient = app.get<RedisClientType>(REDIS_CLIENT);

  configureProxyTrust(app);
  const requestLogger = new RequestLoggerMiddleware(app.get(MetricsService));
  app.use(requestLogger.use.bind(requestLogger));
  app.use((req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV !== 'production' && process.env.EXPOSE_INSTANCE_ID === 'true') {
      res.setHeader('X-Instance-Id', process.env.HOSTNAME || 'unknown');
    }
    next();
  });

  const secureCookieSetting = process.env.SESSION_COOKIE_SECURE;
  if (secureCookieSetting && secureCookieSetting !== 'true' && secureCookieSetting !== 'false') {
    throw new Error('SESSION_COOKIE_SECURE must be true or false');
  }

  app.use(createOAuthSessionStorePreflight(redisClient, logger));

  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'calassist-development-session',
    store: new RedisStore({ client: redisClient }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: getSessionSameSite(),
      secure: secureCookieSetting
        ? secureCookieSetting === 'true'
        : process.env.NODE_ENV === 'production',
    },
  });
  app.use(
    createOAuthSessionMiddleware((req: Request, res: Response, next: NextFunction): void => {
      sessionMiddleware(req, res, (error?: unknown): void => {
        if (error) {
          handleSessionStoreError(error, res, logger);
          return;
        }
        next();
      });
    })
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors): BadRequestException => {
        const messages = errors.map((err) => {
          const field = err.property;
          const constraints = err.constraints;
          return {
            field,
            errors: constraints ? Object.values(constraints) : [],
          };
        });
        return new BadRequestException({
          message: 'Validation failed',
          errors: messages,
        });
      },
    })
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: parseCorsAllowlist(process.env.CORS_ALLOWED_ORIGINS, process.env.FRONTEND_URL),
    credentials: true,
  });

  app.setGlobalPrefix('api', {
    exclude: [
      'auth/register',
      'auth/login',
      'auth/google',
      'auth/google/callback',
      'auth/test-user',
      'auth/test-user-direct',
      'auth/test-user-no-bcrypt',
      'health',
      'health/live',
      'health/ready',
      'health/deps',
      'metrics',
    ],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`CalAssist API is running on: http://localhost:${port}/api`);
  logger.log(`Instance: ${process.env.HOSTNAME || 'unknown'}; trust proxy hops: 1`);
  logger.log(
    `Frontend should connect from: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`
  );
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});

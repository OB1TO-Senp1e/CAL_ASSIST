import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import session from 'express-session';
import { ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'calassist-development-session',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  }));
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
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
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
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
    ],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`CalAssist API is running on: http://localhost:${port}/api`);
  logger.log(
    `Frontend should connect from: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`
  );
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});

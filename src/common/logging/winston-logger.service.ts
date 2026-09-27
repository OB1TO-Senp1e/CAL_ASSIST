import { Injectable, LoggerService, Scope } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

@Injectable({ scope: Scope.TRANSIENT })
export class WinstonLoggerService implements LoggerService {
  private readonly logger: winston.Logger;
  private context?: string;

  constructor() {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          winston.format.colorize({ all: true }),
          winston.format.printf(({ timestamp, level, message, context, trace, ...meta }) => {
            const ctx = context ? `[${context}] ` : '';
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} ${level}: ${ctx}${message}${metaStr}${trace ? `\n${trace}` : ''}`;
          })
        ),
      }),
    ];

    if (process.env.NODE_ENV === 'production') {
      transports.push(
        new DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.json()
          ),
        }),
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '30d',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.json()
          ),
        })
      );
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      transports,
      defaultMeta: { service: 'calassist' },
    });
  }

  setContext(context: string): void {
    this.context = context;
  }

  log(message: string, meta?: Record<string, any>): void {
    this.logger.info(message, { context: this.context, ...meta });
  }

  error(message: string, trace?: string, meta?: Record<string, any>): void {
    this.logger.error(message, { context: this.context, trace, ...meta });
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.logger.warn(message, { context: this.context, ...meta });
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.logger.debug(message, { context: this.context, ...meta });
  }

  verbose(message: string, meta?: Record<string, any>): void {
    this.logger.verbose(message, { context: this.context, ...meta });
  }

  getLogger(): winston.Logger {
    return this.logger;
  }
}

export const WinstonModule = {
  forRoot: () => ({
    module: class WinstonLoggerModule {},
    providers: [WinstonLoggerService],
    exports: [WinstonLoggerService],
  }),
};

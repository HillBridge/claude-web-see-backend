import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { DbLogTransport } from './db-transport';

@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      imports: [ConfigModule, PrismaModule],
      inject: [ConfigService, PrismaService],
      useFactory: (configService: ConfigService, prisma: PrismaService) => {
        const env = configService.get<string>('app.env');
        const logLevel = configService.get<string>('logger.level') || 'info';

        const consoleFormat = winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.colorize({ all: true }),
          winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
            const ctx = context ? `[${context}]` : '';
            const extra = Object.keys(meta).length
              ? ` ${JSON.stringify(meta)}`
              : '';
            return `${timestamp} ${level} ${ctx} ${message}${extra}`;
          }),
        );

        const fileFormat = winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json(),
        );

        const transports: winston.transport[] = [
          new winston.transports.Console({
            format: consoleFormat,
          }),
          // warn 及以上落库,供管理端 /api/logs 查看(dev/prod 都挂,dev 也能在 UI 看到)
          new DbLogTransport(prisma, { level: 'warn' }),
        ];

        // 生产环境写入日志文件
        if (env === 'production') {
          transports.push(
            new (winston.transports as any).DailyRotateFile({
              filename: 'logs/combined-%DATE%.log',
              datePattern: 'YYYY-MM-DD',
              maxFiles: '30d',
              maxSize: '50m',
              format: fileFormat,
              level: logLevel,
            }),
            new (winston.transports as any).DailyRotateFile({
              filename: 'logs/error-%DATE%.log',
              datePattern: 'YYYY-MM-DD',
              maxFiles: '30d',
              maxSize: '20m',
              format: fileFormat,
              level: 'error',
            }),
          );
        }

        return {
          level: logLevel,
          transports,
        };
      },
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}

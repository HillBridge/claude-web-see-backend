import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';

// 全局支持 BigInt JSON 序列化 (时间戳字段)
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // 关闭默认 body parser，手动配置以支持 sendBeacon 的 text/plain
    bodyParser: false,
  });

  const configService = app.get(ConfigService);

  // ── 使用 nest-winston 替换内置 logger ──────────────────────
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // ── Body Parser (支持 JSON + text/plain for sendBeacon) ────
  app.use(
    express.json({
      type: ['application/json', 'text/plain'],
      limit: '50mb',
    }),
  );
  app.use(
    express.urlencoded({
      extended: true,
      limit: '50mb',
      parameterLimit: 50000,
    }),
  );

  // ── CORS ───────────────────────────────────────────────────
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── 全局 API 前缀 ──────────────────────────────────────────
  app.setGlobalPrefix('api', {
    // 这些路径保持原有 server.js 接口兼容，不加 /api 前缀
    exclude: ['reportData', 'getErrorList', 'getRecordScreenId', 'getmap'],
  });

  // ── 全局 ValidationPipe ────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Swagger ────────────────────────────────────────────────
  if (configService.get('app.env') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Web-See 前端监控平台')
      .setDescription('NestJS + Prisma + MySQL 监控后端接口文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('swagger', app, document);
  }

  const port = configService.get<number>('app.port') ?? 8083;
  await app.listen(port);

  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  logger.log(`Server running on http://localhost:${port}`, 'Bootstrap');
  if (configService.get('app.env') !== 'production') {
    logger.log(`Swagger docs: http://localhost:${port}/swagger`, 'Bootstrap');
  }
}

bootstrap();

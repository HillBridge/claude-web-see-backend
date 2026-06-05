/**
 * E2E app 工厂：用真实 AppModule 启动 Nest 应用，并**复刻 main.ts 的 bootstrap**
 * (body parser / 全局前缀 exclude / ValidationPipe / BigInt 序列化补丁)。
 *
 * 关键：Test.createTestingModule 默认不应用 main.ts 里的这些全局配置，
 * 若不在此复刻，D 组(全局接线)的测试将形同虚设。
 * 全局 Guard / Interceptor / Filter 因在 AppModule 用 APP_GUARD 等装配，会自动生效。
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as express from 'express';
import { AppModule } from '../../src/app.module';

// 与 main.ts 一致：全局支持 BigInt JSON 序列化
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ bodyParser: false });
  // 测试期间静音框架日志，保留测试输出清爽
  app.useLogger(false);

  // ── Body Parser（支持 JSON + text/plain for sendBeacon）——与 main.ts 对齐 ──
  const bodyLimit = process.env.BODY_LIMIT || '10mb';
  app.use(
    express.json({ type: ['application/json', 'text/plain'], limit: bodyLimit }),
  );
  app.use(
    express.urlencoded({ extended: true, limit: bodyLimit, parameterLimit: 10000 }),
  );

  // ── 全局 API 前缀 + 旧接口 exclude 列表 ──
  app.setGlobalPrefix('api', {
    exclude: ['reportData', 'getErrorList', 'getRecordScreenId', 'getmap'],
  });

  // ── 全局 ValidationPipe ──
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();
  return app;
}

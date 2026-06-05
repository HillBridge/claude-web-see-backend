/**
 * C 组 · SDK 上报入口契约
 * 验证红线 report.controller.ts：唯一对外入口的 apikey 鉴权、静默丢脏数据、text/plain 兼容、
 * 以及 RateLimitGuard 对真实 Redis 计数的依赖。
 *
 * 注意响应形状：全局 TransformInterceptor 会把控制器返回再包一层，
 * 故上报成功的 { code:200, message:'上报成功' } 实际落在 res.body.data 内。
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup/app-factory';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { RedisService } from '../src/common/redis/redis.service';
import { resetState, registerUser, createProject } from './setup/seed';

describe('C · SDK 上报入口契约 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let http: any;
  let apikey: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetState(app, prisma); // 清 Redis(限流) + 清库
    const user = await registerUser(app);
    apikey = await createProject(prisma, user.id);
  });

  it('⑧ 错误/无效 apikey → ApiKeyAuthGuard 拦截 (body.code=401)', async () => {
    const res = await request(http)
      .post('/reportData')
      .send({ type: 'error', apikey: 'invalid-apikey', message: 'x' });
    expect(res.body.code).toBe(401);
  });

  it('⑧ 缺少 apikey → body.code=401', async () => {
    const res = await request(http).post('/reportData').send({ type: 'error', message: 'x' });
    expect(res.body.code).toBe(401);
  });

  it('⑨ 合法 apikey + 正常 body → 上报成功且落库', async () => {
    const res = await request(http)
      .post('/reportData')
      .send({ type: 'error', apikey, message: 'real-error' })
      .expect(200);
    expect(res.body.data.code).toBe(200);

    const count = await prisma.errorReport.count({ where: { apikey } });
    expect(count).toBe(1);
  });

  it('⑩ 脏数据（缺 type）→ HTTP 200 且静默丢弃，不写库', async () => {
    const res = await request(http)
      .post('/reportData')
      .send({ apikey, message: 'no-type' }) // 缺 type → isAcceptable=false
      .expect(200);
    expect(res.body.data.code).toBe(200);

    const count = await prisma.errorReport.count({ where: { apikey } });
    expect(count).toBe(0);
  });

  it('⑪ sendBeacon 的 text/plain body 被正确解析并入库', async () => {
    const payload = JSON.stringify({ type: 'error', apikey, message: 'beacon' });
    const res = await request(http)
      .post('/reportData')
      .set('Content-Type', 'text/plain')
      .send(payload)
      .expect(200);
    expect(res.body.data.code).toBe(200);

    const count = await prisma.errorReport.count({ where: { apikey } });
    expect(count).toBe(1);
  });

  it('⑫ 超频 → 429（预置 Redis 计数到阈值，不真打 500 次）', async () => {
    // RateLimitGuard 先按 apikey 计数（阈值 500/分钟）。预置到 500，下一次请求即超限。
    await redis.redisClient.set(`ratelimit:apikey:${apikey}`, '500');
    const res = await request(http)
      .post('/reportData')
      .send({ type: 'error', apikey, message: 'flood' });
    expect(res.body.code).toBe(429);
  });
});

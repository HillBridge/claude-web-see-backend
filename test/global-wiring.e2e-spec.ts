/**
 * D 组 · 全局接线 (main.ts)
 * 验证红线 main.ts：全局前缀 + 旧接口 exclude 列表、ValidationPipe(forbidNonWhitelisted)、
 * BigInt 序列化补丁。这些都在 bootstrap，单测不经过该路径。
 *
 * 注：全局 HttpExceptionFilter 把异常 HTTP 状态统一为 200，真实码在 body.code；
 * 未匹配路由的 404 也经 NotFoundException 走该过滤器，故同样体现在 body.code=404。
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup/app-factory';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { resetState, registerUser, createProject, seedError, SeededUser } from './setup/seed';

describe('D · 全局接线 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: any;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetState(app, prisma);
  });

  it('⑬ 旧接口不带 /api 前缀：/getErrorList 路由存在（body.code=401 来自 Guard，非 404）', async () => {
    // getErrorList 受 JWT 保护，未带 Token 应 401（证明路由存在于无前缀路径）
    const res = await request(http).get('/getErrorList');
    expect(res.body.code).toBe(401);
  });

  it('⑬ 旧接口被 exclude：带 /api 前缀的 /api/getErrorList → 404（该路径不存在）', async () => {
    const res = await request(http).get('/api/getErrorList');
    expect(res.body.code).toBe(404);
  });

  it('⑬ 普通接口带 /api 前缀：/api/errors 存在（body.code=401），/errors 不存在（404）', async () => {
    const withPrefix = await request(http).get('/api/errors');
    expect(withPrefix.body.code).toBe(401);
    const noPrefix = await request(http).get('/errors');
    expect(noPrefix.body.code).toBe(404);
  });

  it('⑭ forbidNonWhitelisted：注册时传未声明字段 → body.code=400', async () => {
    const res = await request(http)
      .post('/api/auth/register')
      .send({ username: 'abcde', email: 'abc@example.com', password: 'password123', hacker: true });
    expect(res.body.code).toBe(400);
  });

  it('⑮ BigInt 时间戳序列化为 number，不抛序列化错', async () => {
    const user: SeededUser = await registerUser(app);
    const apikey = await createProject(prisma, user.id);
    await seedError(prisma, apikey, 'with-time'); // seedError 写入 time = BigInt(Date.now())

    const res = await request(http)
      .get('/api/errors')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.body.code).toBe(200);

    const row = res.body.data.list[0];
    expect(row).toBeDefined();
    expect(typeof row.time).toBe('number'); // BigInt → number（main.ts 的 toJSON 补丁）
  });
});

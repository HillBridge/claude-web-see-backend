/**
 * A 组 · 鉴权装配 & 全局 Guard 顺序
 * 验证红线 app.module.ts：APP_GUARD 先 JwtAuthGuard 再 RolesGuard 的真实装配与顺序，
 * 以及 @Public 放行。单元测试各测各的 Guard，测不到「真实请求经过的 Guard 链」。
 *
 * 重要契约（E2E 才能暴露）：全局 HttpExceptionFilter 把所有异常的 HTTP 状态统一改写为 200，
 * 真实状态码放在响应体 body.code 里。故鉴权失败等用例断言 res.body.code，而非 HTTP status。
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { createTestApp } from './setup/app-factory';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { resetState, registerUser, makeAdmin, SeededUser } from './setup/seed';

describe('A · 鉴权装配 & Guard 顺序 (e2e)', () => {
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

  it('① 无 Token 打受保护接口 → 401（HTTP 200 + body.code=401）', async () => {
    const res = await request(http).get('/api/errors');
    expect(res.body.code).toBe(401);
  });

  it('② 伪造/非法 Token → 401', async () => {
    const res = await request(http)
      .get('/api/errors')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.body.code).toBe(401);
  });

  it('② 合法签名但不在 Redis 白名单的 Token → 401', async () => {
    const jwt = app.get(JwtService);
    // 用真实密钥签一个 payload，但从未 addToken → JwtStrategy 白名单校验应拒绝
    const token = jwt.sign({ sub: 999999, username: 'ghost', role: 'USER', jti: 'never-whitelisted' });
    const res = await request(http)
      .get('/api/errors')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(401);
  });

  it('③ 合法 Token 但角色不足打 @Roles(ADMIN) 接口 → 403（证明 JWT 先过、Roles 再拦）', async () => {
    const user: SeededUser = await registerUser(app); // 默认 USER
    const res = await request(http)
      .get('/api/users')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.body.code).toBe(403);
  });

  it('③ ADMIN Token 打同一 @Roles 接口 → 放行 (code=200)', async () => {
    let admin = await registerUser(app);
    admin = await makeAdmin(app, prisma, admin);
    const res = await request(http)
      .get('/api/users')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.body.code).toBe(200);
  });

  it('④ /getmap 改为需鉴权:无 Token → 401（M2 加固,源码还原走后台登录态，不再 @Public）', async () => {
    const res = await request(http).get('/getmap').query({ fileName: 'x', apikey: 'y' });
    expect(res.body.code).toBe(401);
  });

  it('④ @Public 接口 (POST /api/auth/login) 无 Token 可达（凭证错误来自 LocalStrategy 的 401，而非 JwtAuthGuard）', async () => {
    const res = await request(http)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'password123' });
    // 关键：请求到达了 auth 逻辑（@Public 生效）。不存在的用户 → LocalStrategy 抛 401。
    expect(res.body.code).toBe(401);
  });
});

/**
 * B 组 · 多租户越权
 * 验证红线 tenant-scope.ts 的**接线闭合**：单测只测 resolveTenantApikeyFilter/assertApikeyAccess
 * 函数本身，测不到「某查询接口是否真的调用了它」。这里走真实请求，确保跨租户隔离生效。
 *
 * 注：全局 HttpExceptionFilter 把异常 HTTP 状态统一为 200，真实码在 body.code（详见 A 组说明）。
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup/app-factory';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import {
  resetState,
  registerUser,
  createProject,
  seedError,
  seedRecordScreen,
  SeededUser,
} from './setup/seed';

describe('B · 多租户越权 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: any;

  let userA: SeededUser;
  let userB: SeededUser;
  let apikeyA: string;
  let apikeyB: string;

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
    userA = await registerUser(app);
    userB = await registerUser(app);
    apikeyA = await createProject(prisma, userA.id);
    apikeyB = await createProject(prisma, userB.id);
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('⑤ 错误列表：A 只看到自己 apikey 的数据，不含 B 的', async () => {
    await seedError(prisma, apikeyA, 'A-error');
    await seedError(prisma, apikeyB, 'B-error');

    const res = await request(http).get('/api/errors').set(auth(userA.token));
    expect(res.body.code).toBe(200);
    const list = res.body.data.list;
    expect(list.length).toBe(1);
    expect(list.every((row: any) => row.apikey === apikeyA)).toBe(true);
  });

  it('⑤ 录屏列表：A 只看到自己的记录', async () => {
    await seedRecordScreen(prisma, apikeyA);
    await seedRecordScreen(prisma, apikeyB);

    const res = await request(http).get('/api/record-screens').set(auth(userA.token));
    expect(res.body.code).toBe(200);
    const list = res.body.data.list;
    expect(list.length).toBe(1);
    expect(list[0].apikey).toBe(apikeyA);
  });

  it('⑤ sourcemap 列表：A 显式查 B 的 apikey → 403', async () => {
    // sourcemaps 接口要求传 apikey 并经 assertApikeyAccess
    const res = await request(http)
      .get('/api/sourcemaps')
      .query({ apikey: apikeyB })
      .set(auth(userA.token));
    expect(res.body.code).toBe(403);
  });

  it('⑥ 按 id 查 B 的错误详情 → 403', async () => {
    const { reportId } = await seedError(prisma, apikeyB, 'B-error');
    const res = await request(http).get(`/api/errors/${reportId}`).set(auth(userA.token));
    expect(res.body.code).toBe(403);
  });

  it('⑥ 按 id 查 B 的录屏详情 → 403', async () => {
    const recId = await seedRecordScreen(prisma, apikeyB);
    const res = await request(http).get(`/api/record-screens/${recId}`).set(auth(userA.token));
    expect(res.body.code).toBe(403);
  });

  it('⑦ A 删除 B 的错误分组 → 403，且该分组未被删除', async () => {
    const { groupId } = await seedError(prisma, apikeyB, 'B-error');
    const res = await request(http).delete(`/api/errorGroups/${groupId}`).set(auth(userA.token));
    expect(res.body.code).toBe(403);

    const still = await prisma.errorGroup.findUnique({ where: { id: groupId } });
    expect(still).not.toBeNull();
  });
});

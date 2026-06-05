/**
 * E2E 种子与数据助手：注册用户 / 提升管理员 / 登录取 token / 造项目与各类数据 / 清库。
 * 直接用真实 PrismaService 写库，HTTP 行为用 supertest。
 */
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { RedisService } from '../../src/common/redis/redis.service';

export interface SeededUser {
  id: number;
  username: string;
  email: string;
  password: string;
  token: string;
}

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}`;
}

/** 清空所有业务表（按外键依赖顺序），保证每个用例从干净状态开始。 */
export async function resetDb(prisma: PrismaService): Promise<void> {
  // 顺序：先删引用方，再删被引用方
  await prisma.breadcrumb.deleteMany();
  await prisma.errorReport.deleteMany();
  await prisma.errorGroup.deleteMany();
  await prisma.recordScreen.deleteMany();
  await prisma.performanceReport.deleteMany();
  await prisma.performanceDailyStat.deleteMany();
  await prisma.whiteScreen.deleteMany();
  await prisma.sourceMapFile.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * 每个用例前的统一复位：清 Redis + 清库。
 * 必须 flush Redis：限流计数(尤其 AuthRateLimitGuard 5次/分钟)与 token 白名单跨用例共享同一容器，
 * 不清会导致后续注册/登录被限流。flush 在 register/login 之前调用，故新建的 token 仍有效。
 */
export async function resetState(
  app: INestApplication,
  prisma: PrismaService,
): Promise<void> {
  await app.get(RedisService).redisClient.flushdb();
  await resetDb(prisma);
}

/** 走真实 /api/auth/register 注册一个普通用户并拿到 token。 */
export async function registerUser(app: INestApplication): Promise<SeededUser> {
  const username = unique('user_');
  const email = `${username}@example.com`;
  const password = 'password123';
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ username, email, password });
  const data = res.body.data; // TransformInterceptor 统一包了一层 data
  if (!data?.accessToken) {
    throw new Error(`注册失败，响应=${JSON.stringify(res.body)}`);
  }
  return { id: data.user.id, username, email, password, token: data.accessToken };
}

/**
 * 提升为管理员：直接改库 role=ADMIN，再重新登录拿带 ADMIN 的 token
 * (JWT payload 的 role 在登录时写入，故必须重新登录)。
 */
export async function makeAdmin(
  app: INestApplication,
  prisma: PrismaService,
  user: SeededUser,
): Promise<SeededUser> {
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  const token = await loginUser(app, user.username, user.password);
  return { ...user, token };
}

/** 走真实 /api/auth/login 取 token。 */
export async function loginUser(
  app: INestApplication,
  username: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password });
  if (!res.body.data?.accessToken) {
    throw new Error(`登录失败，响应=${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

/** 为某用户造一个项目，返回其 apikey（32 位无连字符，符合现有生成规则）。 */
export async function createProject(
  prisma: PrismaService,
  ownerId: number,
  allowedOrigins: string[] = [],
): Promise<string> {
  const apikey = randomUUID().replace(/-/g, '');
  await prisma.project.create({
    data: {
      name: unique('proj_'),
      apikey,
      ownerId,
      allowedOrigins: JSON.stringify(allowedOrigins),
    },
  });
  return apikey;
}

/** 直接造一条错误分组 + 一条明细，返回 { groupId, reportId }。 */
export async function seedError(
  prisma: PrismaService,
  apikey: string,
  message = 'boom',
): Promise<{ groupId: number; reportId: number }> {
  const group = await prisma.errorGroup.create({
    data: {
      apikey,
      fingerprint: randomUUID().replace(/-/g, ''),
      type: 'error',
      message,
    },
  });
  const report = await prisma.errorReport.create({
    data: {
      type: 'error',
      message,
      apikey,
      time: BigInt(Date.now()),
      errorGroupId: group.id,
    },
  });
  return { groupId: group.id, reportId: report.id };
}

/** 直接造一条录屏记录（eventsKey 指向 MinIO，但测越权时不需要真实对象）。 */
export async function seedRecordScreen(
  prisma: PrismaService,
  apikey: string,
): Promise<number> {
  const rec = await prisma.recordScreen.create({
    data: {
      recordScreenId: randomUUID().replace(/-/g, ''),
      apikey,
      eventsKey: null,
      eventsSize: 0,
    },
  });
  return rec.id;
}

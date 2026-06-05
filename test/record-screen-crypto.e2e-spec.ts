/**
 * E 组 · 录屏 events 静态加密往返
 * 验证红线 record-screen-crypto.ts + report/record-screen 加解密链路：
 *   写入端(report)加密 → MinIO 对象带 WSE1 头；读取端(record-screen)解密 → API 返回明文。
 *
 * 关键：encKey 在 Service 构造时读取，必须在 createTestApp() 之前设好 process.env。
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup/app-factory';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { MinioService } from '../src/shared/minio/minio.service';
import { resetState, registerUser, createProject, SeededUser } from './setup/seed';

const ENC_KEY_HEX = 'a'.repeat(64); // 32 字节 hex，parseEncKey 接受
const PLAINTEXT = 'rrweb-opaque-events-blob-含PII-payload';

describe('E · 录屏 events 静态加密往返 (e2e)', () => {
  describe('配置了 RECORD_SCREEN_ENC_KEY → 写入加密、读取返回明文', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let minio: MinioService;
    let http: any;
    let user: SeededUser;
    let apikey: string;
    const recordScreenId = 'rec-e2e-encrypted-001';

    beforeAll(async () => {
      process.env.RECORD_SCREEN_ENC_KEY = ENC_KEY_HEX;
      app = await createTestApp();
      prisma = app.get(PrismaService);
      minio = app.get(MinioService);
      http = app.getHttpServer();
    });

    afterAll(async () => {
      await app?.close();
      delete process.env.RECORD_SCREEN_ENC_KEY;
    });

    beforeEach(async () => {
      await resetState(app, prisma);
      user = await registerUser(app);
      apikey = await createProject(prisma, user.id);
    });

    it('⑯ 上报录屏 → 详情读回 events 明文一致，且 MinIO 对象为 WSE1 密文', async () => {
      // 1) 写入：POST /reportData (type=recordScreen)
      await request(http)
        .post('/reportData')
        .send({ type: 'recordScreen', apikey, recordScreenId, events: PLAINTEXT, time: Date.now() })
        .expect(200);

      // 2) 取回 DB 行拿 id 与 eventsKey
      const row = await prisma.recordScreen.findFirst({ where: { apikey, recordScreenId } });
      expect(row).not.toBeNull();
      expect(row!.eventsKey).toBeTruthy();

      // 3) MinIO 对象应以 WSE1 magic 开头（已加密）
      const obj = await minio.getObject(row!.eventsKey as string);
      expect(obj.subarray(0, 4).toString('ascii')).toBe('WSE1');

      // 4) 详情接口解密后返回明文
      const res = await request(http)
        .get(`/api/record-screens/${row!.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);
      expect(res.body.data.events).toBe(PLAINTEXT);
    });
  });

  describe('未配置密钥 → 明文存储、读取直通', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let minio: MinioService;
    let http: any;
    let user: SeededUser;
    let apikey: string;
    const recordScreenId = 'rec-e2e-plain-001';

    beforeAll(async () => {
      delete process.env.RECORD_SCREEN_ENC_KEY; // 确保未配置
      app = await createTestApp();
      prisma = app.get(PrismaService);
      minio = app.get(MinioService);
      http = app.getHttpServer();
    });

    afterAll(async () => {
      await app?.close();
    });

    beforeEach(async () => {
      await resetState(app, prisma);
      user = await registerUser(app);
      apikey = await createProject(prisma, user.id);
    });

    it('⑯ 上报录屏 → MinIO 对象为明文（无 WSE1 头），详情读回一致', async () => {
      await request(http)
        .post('/reportData')
        .send({ type: 'recordScreen', apikey, recordScreenId, events: PLAINTEXT, time: Date.now() })
        .expect(200);

      const row = await prisma.recordScreen.findFirst({ where: { apikey, recordScreenId } });
      expect(row).not.toBeNull();

      const obj = await minio.getObject(row!.eventsKey as string);
      expect(obj.subarray(0, 4).toString('ascii')).not.toBe('WSE1');
      expect(obj.toString('utf-8')).toBe(PLAINTEXT);

      const res = await request(http)
        .get(`/api/record-screens/${row!.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);
      expect(res.body.data.events).toBe(PLAINTEXT);
    });
  });
});

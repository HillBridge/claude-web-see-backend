/**
 * E2E 容器编排：用 testcontainers 起真实 MySQL / Redis / MinIO。
 * 仅供 E2E 全局 setup/teardown 使用；容器句柄挂在 globalThis 上跨 setup→teardown 复用
 * (Jest globalSetup 与 globalTeardown 在同一进程，可共享 global)。
 */
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import {
  GenericContainer,
  StartedTestContainer,
  Wait,
} from 'testcontainers';

export interface StartedInfra {
  mysql: StartedMySqlContainer;
  redis: StartedRedisContainer;
  minio: StartedTestContainer;
}

// 挂在 global 上，teardown 阶段取回销毁
const GLOBAL_KEY = '__WSE_E2E_INFRA__';

export async function startInfra(): Promise<StartedInfra> {
  // 并行启动三套依赖，缩短冷启动时间
  const [mysql, redis, minio] = await Promise.all([
    new MySqlContainer('mysql:8')
      .withDatabase('web_see_test')
      .withUsername('wse')
      .withUserPassword('wse_pass')
      .start(),
    new RedisContainer('redis:7').start(),
    new GenericContainer('minio/minio')
      .withEnvironment({
        MINIO_ROOT_USER: 'minioadmin',
        MINIO_ROOT_PASSWORD: 'minioadmin',
      })
      .withCommand(['server', '/data'])
      .withExposedPorts(9000)
      // 等 MinIO 健康检查就绪，避免 app 启动时 ensureBucket 连不上
      .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
      .start(),
  ]);

  const infra: StartedInfra = { mysql, redis, minio };
  (globalThis as any)[GLOBAL_KEY] = infra;
  return infra;
}

export async function stopInfra(): Promise<void> {
  const infra: StartedInfra | undefined = (globalThis as any)[GLOBAL_KEY];
  if (!infra) return;
  await Promise.allSettled([
    infra.mysql.stop(),
    infra.redis.stop(),
    infra.minio.stop(),
  ]);
}

/**
 * 把容器连接信息写入 process.env，供后续 app 启动时 configuration.ts 读取。
 * 注：在 Jest globalSetup 中设置的 env 会被后续 test 进程继承。
 */
export function exportInfraEnv(infra: StartedInfra): void {
  // ── MySQL → DATABASE_URL（Prisma 读取）──
  process.env.DATABASE_URL = infra.mysql.getConnectionUri();

  // ── Redis ──
  process.env.REDIS_HOST = infra.redis.getHost();
  process.env.REDIS_PORT = String(infra.redis.getMappedPort(6379));
  process.env.REDIS_PASSWORD = '';
  process.env.REDIS_DB = '0';

  // ── MinIO ──
  process.env.MINIO_ENDPOINT = infra.minio.getHost();
  process.env.MINIO_PORT = String(infra.minio.getMappedPort(9000));
  process.env.MINIO_USE_SSL = 'false';
  process.env.MINIO_ACCESS_KEY = 'minioadmin';
  process.env.MINIO_SECRET_KEY = 'minioadmin';
  process.env.MINIO_BUCKET = 'web-see-test';

  // ── 应用必需密钥（configuration.ts 的 requireEnv 强制）──
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'e2e-test-jwt-secret-please-not-for-prod';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.NODE_ENV = 'test';
  // sourcemap 上传密钥（uploadmap 接口校验用）
  process.env.SOURCEMAP_UPLOAD_SECRET =
    process.env.SOURCEMAP_UPLOAD_SECRET || 'e2e-upload-secret';
}

/**
 * Jest 全局 setup：起容器 → 注入 env → 跑真实 Prisma 迁移建表。
 * 只跑一次，全部 *.e2e-spec.ts 复用同一套容器。
 */
import { execSync } from 'child_process';
import { startInfra, exportInfraEnv } from './containers';

export default async function globalSetup(): Promise<void> {
  // 禁用 testcontainers 的 Ryuk 资源回收器：它偶发端口绑定超时，且我们已在
  // global-teardown 显式 stopInfra() 清理容器，无需 Ryuk 兜底（CI 常见做法）。
  process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

  // eslint-disable-next-line no-console
  console.log('\n[e2e] 启动 MySQL / Redis / MinIO 容器（首次拉取镜像较慢）...');
  const infra = await startInfra();
  exportInfraEnv(infra);

  // 用真实迁移建表（faithful：与生产同一套 migrations，不用 db push）
  // eslint-disable-next-line no-console
  console.log('[e2e] 执行 prisma migrate deploy ...');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env },
  });

  // eslint-disable-next-line no-console
  console.log('[e2e] 基础设施就绪。\n');
}

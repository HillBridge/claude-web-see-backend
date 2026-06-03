import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';

/** JWT 校验后挂在 request.user 上的最小用户结构 */
export interface TenantUser {
  id: number;
  role: string;
}

function isAdmin(user?: TenantUser): boolean {
  return user?.role === 'ADMIN';
}

/**
 * 根据当前登录用户解析「可访问 apikey」的 Prisma where 片段,用于按租户隔离数据查询。
 *
 * 规则:
 * - ADMIN:不限制;若显式传入 apikey/projectId,则按其精确过滤。
 * - 普通用户:只能访问自己拥有项目的 apikey。
 *   - 显式传入的 apikey/projectId 不属于自己 → 抛 403。
 *   - 未传任何过滤 → 自动限定为自己拥有的全部 apikey。
 *   - projectId 不存在 → 返回空集过滤(`{ apikey: { in: [] } }`),结果为空而非报错。
 *
 * 返回值是一个可直接展开进 where 的片段(可能为 `{}` 表示 ADMIN 不限制)。
 */
export async function resolveTenantApikeyFilter(
  prisma: PrismaService,
  user: TenantUser,
  opts: { apikey?: string; projectId?: number } = {},
): Promise<Record<string, any>> {
  const admin = isAdmin(user);
  let requestedApikey = opts.apikey;

  // projectId → apikey,并校验归属
  if (opts.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: Number(opts.projectId) },
      select: { apikey: true, ownerId: true },
    });
    if (!project) return { apikey: { in: [] } }; // 项目不存在 → 空集
    if (!admin && project.ownerId !== user.id) {
      throw new ForbiddenException('无权访问该项目数据');
    }
    requestedApikey = project.apikey;
  }

  if (admin) {
    return requestedApikey ? { apikey: requestedApikey } : {};
  }

  // 普通用户:取自己拥有的全部 apikey
  const owned = await prisma.project.findMany({
    where: { ownerId: user.id },
    select: { apikey: true },
  });
  const ownedKeys = owned.map((p) => p.apikey);

  if (requestedApikey) {
    if (!ownedKeys.includes(requestedApikey)) {
      throw new ForbiddenException('无权访问该项目数据');
    }
    return { apikey: requestedApikey };
  }
  // 仅限自己的项目;空数组时 Prisma 返回空结果
  return { apikey: { in: ownedKeys } };
}

/**
 * 校验当前用户是否有权访问某条数据(按其 apikey 判定归属)。
 * 用于按主键 id 查询单条记录的详情接口。ADMIN 放行;普通用户须拥有该 apikey 对应项目。
 */
export async function assertApikeyAccess(
  prisma: PrismaService,
  user: TenantUser,
  apikey: string | null | undefined,
): Promise<void> {
  if (isAdmin(user)) return;
  if (!apikey) throw new ForbiddenException('无权访问该数据');
  const project = await prisma.project.findFirst({
    where: { apikey, ownerId: user.id },
    select: { id: true },
  });
  if (!project) throw new ForbiddenException('无权访问该数据');
}

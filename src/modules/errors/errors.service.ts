import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IPageResult } from '@/common/interfaces/page-result.interface';
import { QueryErrorDto } from './dto/query-error.dto';
import {
  TenantUser,
  resolveTenantApikeyFilter,
  assertApikeyAccess,
} from '@/common/utils/tenant-scope';

@Injectable()
export class ErrorsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 错误列表(去重视图): 一个错误一行 + 发生次数。
   * 每行取该分组「最近一次发生」的完整明细(message/pageUrl/time/userId/行列/breadcrumb 都在),
   * 再叠加 count / firstSeen / lastSeen / groupId, 前端原有列零改动即可显示去重结果。
   */
  async findAll(query: QueryErrorDto, user: TenantUser): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20, apikey, projectId, type, userId, startTime, endTime } = query;
    const skip = (page - 1) * pageSize;

    // 按当前用户解析可访问的 apikey 范围(租户隔离)
    const where: any = await resolveTenantApikeyFilter(this.prisma, user, { apikey, projectId });

    if (type) where.type = type;
    // userId 不是分组列(已进指纹), 通过组内明细过滤
    if (userId) where.reports = { some: { monitorUserId: userId } };
    if (startTime || endTime) {
      where.lastSeen = {};
      if (startTime) where.lastSeen.gte = new Date(startTime);
      if (endTime) where.lastSeen.lte = new Date(endTime);
    }

    const [groups, total] = await Promise.all([
      this.prisma.errorGroup.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { lastSeen: 'desc' },
        include: {
          reports: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: { breadcrumbs: true },
          },
        },
      }),
      this.prisma.errorGroup.count({ where }),
    ]);

    return {
      list: groups.map((g) => this.mapGroupedRow(g)),
      total,
      page,
      pageSize,
    };
  }

  /** 分组 + 其最近一次明细 → 兼容旧列表结构的一行 */
  private mapGroupedRow(g: any) {
    const latest = g.reports?.[0];
    const base = latest ? this.mapErrorItem(latest) : this.mapGroupItem(g);
    return {
      ...base,
      id: latest?.id ?? base.id, // 保持「查看详情」按明细 id 跳转可用
      groupId: g.id,
      count: g.count,
      firstSeen: g.firstSeen,
      lastSeen: g.lastSeen,
    };
  }

  async findOne(id: number, user: TenantUser) {
    const item = await this.prisma.errorReport.findUnique({
      where: { id },
      include: { breadcrumbs: true, errorGroup: true },
    });
    if (!item) return null;
    // 校验该错误所属项目归当前用户所有
    await assertApikeyAccess(this.prisma, user, item.apikey);
    return this.mapErrorItem(item);
  }

  /** 错误分组列表(去重聚合视图: 一组一行, 含发生次数与首末时间) */
  async findGroups(query: QueryErrorDto, user: TenantUser): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20, apikey, projectId, type, startTime, endTime } = query;
    const skip = (page - 1) * pageSize;

    // 按当前用户解析可访问的 apikey 范围(租户隔离)
    const where: any = await resolveTenantApikeyFilter(this.prisma, user, { apikey, projectId });

    if (type) where.type = type;
    if (startTime || endTime) {
      where.lastSeen = {};
      if (startTime) where.lastSeen.gte = new Date(startTime);
      if (endTime) where.lastSeen.lte = new Date(endTime);
    }

    const [list, total] = await Promise.all([
      this.prisma.errorGroup.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { lastSeen: 'desc' },
      }),
      this.prisma.errorGroup.count({ where }),
    ]);

    return {
      list: list.map((g) => this.mapGroupItem(g)),
      total,
      page,
      pageSize,
    };
  }

  /** 某个错误分组下的发生明细(分页) */
  async findGroupReports(groupId: number, query: QueryErrorDto, user: TenantUser): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20 } = query;
    const skip = (page - 1) * pageSize;

    // 校验该分组所属项目归当前用户所有
    const group = await this.prisma.errorGroup.findUnique({
      where: { id: groupId },
      select: { apikey: true },
    });
    if (!group) return { list: [], total: 0, page, pageSize };
    await assertApikeyAccess(this.prisma, user, group.apikey);

    const [list, total] = await Promise.all([
      this.prisma.errorReport.findMany({
        where: { errorGroupId: groupId },
        skip,
        take: pageSize,
        include: { breadcrumbs: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.errorReport.count({ where: { errorGroupId: groupId } }),
    ]);

    return {
      list: list.map((item) => this.mapErrorItem(item)),
      total,
      page,
      pageSize,
    };
  }

  private mapGroupItem(g: any) {
    const { lineNo, colNo, ...rest } = g;
    return { ...rest, line: lineNo, column: colNo };
  }

  private mapErrorItem(item: any) {
    const { monitorUserId, lineNo, colNo, errorGroup, ...rest } = item;
    return {
      ...rest,
      userId: monitorUserId,
      line: lineNo,
      column: colNo,
      // 叠加所属错误分组的去重统计(详情接口用)
      ...(errorGroup && {
        count: errorGroup.count,
        firstSeen: errorGroup.firstSeen,
        lastSeen: errorGroup.lastSeen,
      }),
    };
  }
}

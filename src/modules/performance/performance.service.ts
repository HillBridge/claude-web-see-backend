import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IPageResult } from '@/common/interfaces/page-result.interface';
import { QueryPerformanceDto } from './dto/query-performance.dto';
import {
  TenantUser,
  resolveTenantApikeyFilter,
  assertApikeyAccess,
} from '@/common/utils/tenant-scope';

@Injectable()
export class PerformanceService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryPerformanceDto, user: TenantUser): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20, apikey, startTime, endTime } = query;
    const skip = (page - 1) * pageSize;

    // 按当前用户解析可访问的 apikey 范围(租户隔离)
    const where: any = await resolveTenantApikeyFilter(this.prisma, user, { apikey });
    if (startTime || endTime) {
      where.createdAt = {};
      if (startTime) where.createdAt.gte = new Date(startTime);
      if (endTime) where.createdAt.lte = new Date(endTime);
    }

    const [list, total] = await Promise.all([
      this.prisma.performanceReport.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.performanceReport.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number, user: TenantUser) {
    const item = await this.prisma.performanceReport.findUnique({ where: { id } });
    if (!item) return null;
    await assertApikeyAccess(this.prisma, user, item.apikey);
    return item;
  }

  async getAvgMetrics(apikey: string, user: TenantUser) {
    // 仅允许查询自己拥有项目的指标
    await assertApikeyAccess(this.prisma, user, apikey);
    // 长格式原始表按 name 分组求均值(覆盖未聚合的近 30 天数据)
    const groups = await this.prisma.performanceReport.groupBy({
      by: ['name'],
      where: { apikey, value: { not: null } },
      _avg: { value: true },
      _count: { _all: true },
    });
    // reshape 成 { 指标名: { avg, count } } + 总样本数
    const avg: Record<string, { avg: number | null; count: number }> = {};
    let total = 0;
    for (const g of groups) {
      avg[g.name] = {
        avg: g._avg.value != null ? Number(g._avg.value) : null,
        count: g._count._all,
      };
      total += g._count._all;
    }
    return { apikey, total, avg };
  }

  // 历史趋势: 读宽聚合表 performance_daily_stats(聚合服务层,覆盖 30~365 天)
  async getDailyStats(
    apikey: string,
    user: TenantUser,
    startTime?: number,
    endTime?: number,
  ) {
    await assertApikeyAccess(this.prisma, user, apikey);
    const where: any = { apikey };
    if (startTime || endTime) {
      where.statDate = {};
      if (startTime) where.statDate.gte = new Date(startTime);
      if (endTime) where.statDate.lte = new Date(endTime);
    }
    return this.prisma.performanceDailyStat.findMany({
      where,
      orderBy: { statDate: 'asc' },
    });
  }
}

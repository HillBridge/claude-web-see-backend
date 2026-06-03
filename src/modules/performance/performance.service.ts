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
    return this.prisma.performanceReport.aggregate({
      where: { apikey },
      _avg: { fp: true, fcp: true, lcp: true, fid: true, cls: true, ttfb: true, loadTime: true },
      _count: true,
    });
  }
}

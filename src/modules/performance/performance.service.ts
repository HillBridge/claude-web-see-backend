import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IPageResult } from '@/common/interfaces/page-result.interface';
import { QueryPerformanceDto } from './dto/query-performance.dto';

@Injectable()
export class PerformanceService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryPerformanceDto): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20, apikey, startTime, endTime } = query;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (apikey) where.apikey = apikey;
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

  async findOne(id: number) {
    return this.prisma.performanceReport.findUnique({ where: { id } });
  }

  async getAvgMetrics(apikey: string) {
    return this.prisma.performanceReport.aggregate({
      where: { apikey },
      _avg: { fp: true, fcp: true, lcp: true, fid: true, cls: true, ttfb: true, loadTime: true },
      _count: true,
    });
  }
}

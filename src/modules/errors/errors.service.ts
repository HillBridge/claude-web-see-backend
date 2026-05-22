import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { IPageResult } from '@/common/interfaces/page-result.interface';
import { QueryErrorDto } from './dto/query-error.dto';

@Injectable()
export class ErrorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryErrorDto): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20, apikey, type, startTime, endTime } = query;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (apikey) where.apikey = apikey;
    if (type) where.type = type;
    if (startTime || endTime) {
      where.createdAt = {};
      if (startTime) where.createdAt.gte = new Date(startTime);
      if (endTime) where.createdAt.lte = new Date(endTime);
    }

    const [list, total] = await Promise.all([
      this.prisma.errorReport.findMany({
        where,
        skip,
        take: pageSize,
        include: { breadcrumbs: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.errorReport.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    return this.prisma.errorReport.findUnique({
      where: { id },
      include: { breadcrumbs: true },
    });
  }
}

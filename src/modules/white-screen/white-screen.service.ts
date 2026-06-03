import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IPageResult } from '@/common/interfaces/page-result.interface';
import { QueryWhiteScreenDto } from './dto/query-white-screen.dto';
import {
  TenantUser,
  resolveTenantApikeyFilter,
  assertApikeyAccess,
} from '@/common/utils/tenant-scope';

@Injectable()
export class WhiteScreenService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryWhiteScreenDto, user: TenantUser): Promise<IPageResult<any>> {
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
      this.prisma.whiteScreen.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.whiteScreen.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number, user: TenantUser) {
    const item = await this.prisma.whiteScreen.findUnique({ where: { id } });
    if (!item) return null;
    await assertApikeyAccess(this.prisma, user, item.apikey);
    return item;
  }
}

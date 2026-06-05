import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IPageResult } from '@/common/interfaces/page-result.interface';
import { QueryRecordScreenDto } from './dto/query-record-screen.dto';
import {
  TenantUser,
  resolveTenantApikeyFilter,
  assertApikeyAccess,
} from '@/common/utils/tenant-scope';

@Injectable()
export class RecordScreenService {
  constructor(private prisma: PrismaService) {}

  /** 兼容旧接口: 按 recordScreenId 查询 */
  async findByRecordScreenId(recordScreenId: string, user: TenantUser) {
    // recordScreenId 不再全局唯一(跨租户可同名),故须按当前用户可访问的 apikey 范围过滤,
    // 只返回归属本租户的记录;否则外来同名行会混入并导致逐行鉴权抛 403、连带阻断本人查询。
    const scope = await resolveTenantApikeyFilter(this.prisma, user);
    return this.prisma.recordScreen.findMany({
      where: { ...scope, recordScreenId },
    });
  }

  async findAll(query: QueryRecordScreenDto, user: TenantUser): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20, apikey } = query;
    const skip = (page - 1) * pageSize;
    // 按当前用户解析可访问的 apikey 范围(租户隔离)
    const where: any = await resolveTenantApikeyFilter(this.prisma, user, { apikey });

    const [list, total] = await Promise.all([
      this.prisma.recordScreen.findMany({
        where,
        skip,
        take: pageSize,
        // 列表不返回 events 大字段，节省带宽
        select: {
          id: true, recordScreenId: true, apikey: true,
          monitorUserId: true, pageUrl: true, time: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.recordScreen.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number, user: TenantUser) {
    const record = await this.prisma.recordScreen.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('录屏记录不存在');
    await assertApikeyAccess(this.prisma, user, record.apikey);
    return record;
  }
}

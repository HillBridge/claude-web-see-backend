import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { IPageResult } from '@/common/interfaces/page-result.interface';
import { QueryRecordScreenDto } from './dto/query-record-screen.dto';

@Injectable()
export class RecordScreenService {
  constructor(private prisma: PrismaService) {}

  /** 兼容旧接口: 按 recordScreenId 查询 */
  async findByRecordScreenId(recordScreenId: string) {
    return this.prisma.recordScreen.findMany({ where: { recordScreenId } });
  }

  async findAll(query: QueryRecordScreenDto): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20, apikey } = query;
    const skip = (page - 1) * pageSize;
    const where: any = {};
    if (apikey) where.apikey = apikey;

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

  async findOne(id: number) {
    const record = await this.prisma.recordScreen.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('录屏记录不存在');
    return record;
  }
}

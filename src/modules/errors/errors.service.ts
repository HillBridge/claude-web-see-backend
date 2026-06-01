import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IPageResult } from '@/common/interfaces/page-result.interface';
import { QueryErrorDto } from './dto/query-error.dto';

@Injectable()
export class ErrorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryErrorDto): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20, apikey, projectId, type, userId, startTime, endTime } = query;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { apikey: true } });
      if (project) where.apikey = project.apikey;
      else return { list: [], total: 0, page, pageSize };
    } else if (apikey) {
      where.apikey = apikey;
    }

    if (type) where.type = type;
    if (userId) where.monitorUserId = userId;
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

    return {
      list: list.map((item) => this.mapErrorItem(item)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: number) {
    const item = await this.prisma.errorReport.findUnique({
      where: { id },
      include: { breadcrumbs: true },
    });
    if (!item) return null;
    return this.mapErrorItem(item);
  }

  /** 错误分组列表(去重聚合视图: 一组一行, 含发生次数与首末时间) */
  async findGroups(query: QueryErrorDto): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20, apikey, projectId, type, startTime, endTime } = query;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { apikey: true } });
      if (project) where.apikey = project.apikey;
      else return { list: [], total: 0, page, pageSize };
    } else if (apikey) {
      where.apikey = apikey;
    }

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
  async findGroupReports(groupId: number, query: QueryErrorDto): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20 } = query;
    const skip = (page - 1) * pageSize;

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
    const { monitorUserId, lineNo, colNo, ...rest } = item;
    return {
      ...rest,
      userId: monitorUserId,
      line: lineNo,
      column: colNo,
    };
  }
}

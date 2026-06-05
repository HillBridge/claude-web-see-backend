import { Injectable, NotFoundException } from "@nestjs/common";
import * as path from "path";
import { PrismaService } from "@shared/prisma/prisma.service";
import { SourceMapService } from "@/modules/source-map/source-map.service";
import { IPageResult } from "@/common/interfaces/page-result.interface";
import { QueryErrorDto } from "./dto/query-error.dto";
import {
  TenantUser,
  resolveTenantApikeyFilter,
  assertApikeyAccess,
} from "@/common/utils/tenant-scope";

@Injectable()
export class ErrorsService {
  constructor(
    private prisma: PrismaService,
    private sourceMapService: SourceMapService,
  ) {}

  /**
   * 错误列表(去重视图): 一个错误一行 + 发生次数。
   * 每行取该分组「最近一次发生」的完整明细(message/pageUrl/time/userId/行列/breadcrumb 都在),
   * 再叠加 count / firstSeen / lastSeen / groupId, 前端原有列零改动即可显示去重结果。
   */
  async findAll(
    query: QueryErrorDto,
    user: TenantUser,
  ): Promise<IPageResult<any>> {
    const {
      page = 1,
      pageSize = 20,
      apikey,
      projectId,
      type,
      userId,
      startTime,
      endTime,
    } = query;
    const skip = (page - 1) * pageSize;

    // 按当前用户解析可访问的 apikey 范围(租户隔离)
    const where: any = await resolveTenantApikeyFilter(this.prisma, user, {
      apikey,
      projectId,
    });

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
        orderBy: { lastSeen: "desc" },
        include: {
          reports: {
            take: 1,
            orderBy: { createdAt: "desc" },
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
    // 录屏保留期(30天)短于错误(90天):过期后该错误仍在但关联录屏已被清。
    // 返回 recordScreenAvailable 让前端区分「无录屏」与「录屏已过期」,优雅降级提示。
    const recordScreenAvailable = item.recordScreenId
      ? (await this.prisma.recordScreen.count({
          where: { recordScreenId: item.recordScreenId, apikey: item.apikey },
        })) > 0
      : false;
    return { ...this.mapErrorItem(item), recordScreenAvailable };
  }

  /**
   * 删除一个错误分组(列表中的一行)及其全部关联数据:
   *   - 该分组下所有 ErrorReport(用户行为 breadcrumbs 通过外键级联自动删除)
   *   - 分组本身 ErrorGroup
   *   - 关联录屏 RecordScreen: 仅当删除后已无任何错误再引用该 recordScreenId 时回收
   *   - 关联 SourceMap: 共享资源(按 文件名+项目 存储), 仅当该文件下已无任何错误引用时回收(DB 记录 + MinIO 对象)
   */
  async deleteGroup(groupId: number, user: TenantUser) {
    const group = await this.prisma.errorGroup.findUnique({
      where: { id: groupId },
      select: { id: true, apikey: true },
    });
    if (!group) {
      throw new NotFoundException("错误分组不存在");
    }
    // 校验该分组所属项目归当前用户所有(租户隔离, 防越权删除)
    await assertApikeyAccess(this.prisma, user, group.apikey);

    // 先取出分组下全部明细, 用于回收关联的录屏 / sourcemap
    const reports = await this.prisma.errorReport.findMany({
      where: { errorGroupId: groupId },
      select: { recordScreenId: true, fileName: true, apikey: true },
    });

    const recordScreenIds = [
      ...new Set(
        reports.map((r) => r.recordScreenId).filter((v): v is string => !!v),
      ),
    ];
    // sourcemap 以 basename 存储(见 source-map.service.objectKey 与前端 matchStr), 故按 basename 去重
    const mapTargets = [
      ...new Map(
        reports
          .filter((r) => r.fileName)
          .map((r) => {
            const fileName = path.basename(r.fileName as string);
            return [`${r.apikey}::${fileName}`, { apikey: r.apikey, fileName }];
          }),
      ).values(),
    ];

    // 1) 删除分组下全部 ErrorReport(breadcrumbs 级联删除) 再删分组, 单事务保证原子性
    await this.prisma.$transaction([
      this.prisma.errorReport.deleteMany({ where: { errorGroupId: groupId } }),
      this.prisma.errorGroup.delete({ where: { id: groupId } }),
    ]);

    // 2) 回收录屏: 仅当无其他错误再引用该 recordScreenId
    for (const recordScreenId of recordScreenIds) {
      const stillUsed = await this.prisma.errorReport.count({
        where: { recordScreenId },
      });
      if (stillUsed === 0) {
        await this.prisma.recordScreen.deleteMany({
          where: { recordScreenId },
        });
      }
    }

    // 3) 回收 sourcemap: 共享资源, 仅当该文件下已无任何错误引用时才删(report.fileName 可能为完整 URL, 用 contains 保守匹配)
    for (const target of mapTargets) {
      const stillUsed = await this.prisma.errorReport.count({
        where: {
          apikey: target.apikey,
          fileName: { contains: target.fileName },
        },
      });
      if (stillUsed > 0) continue;
      const map = await this.prisma.sourceMapFile.findUnique({
        where: {
          fileName_apikey: { fileName: target.fileName, apikey: target.apikey },
        },
      });
      if (map) {
        await this.sourceMapService.deleteMapFile(
          target.apikey,
          target.fileName,
        );
      }
    }

    return { message: "删除成功" };
  }

  /** 错误分组列表(去重聚合视图: 一组一行, 含发生次数与首末时间) */
  async findGroups(
    query: QueryErrorDto,
    user: TenantUser,
  ): Promise<IPageResult<any>> {
    const {
      page = 1,
      pageSize = 20,
      apikey,
      projectId,
      type,
      startTime,
      endTime,
    } = query;
    const skip = (page - 1) * pageSize;

    // 按当前用户解析可访问的 apikey 范围(租户隔离)
    const where: any = await resolveTenantApikeyFilter(this.prisma, user, {
      apikey,
      projectId,
    });

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
        orderBy: { lastSeen: "desc" },
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
  async findGroupReports(
    groupId: number,
    query: QueryErrorDto,
    user: TenantUser,
  ): Promise<IPageResult<any>> {
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
        orderBy: { createdAt: "desc" },
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

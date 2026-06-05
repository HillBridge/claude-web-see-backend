import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "@shared/prisma/prisma.service";
import { MinioService } from "@/shared/minio/minio.service";

// 保留策略（天）
const RETENTION = {
  errorReport: 90,
  recordScreen: 30,
  whiteScreen: 90,
  performanceRaw: 30,
  performanceStat: 365,
} as const;

interface DailyAggRow {
  stat_date: Date;
  apikey: string;
  sample_count: bigint;
  avg_fp: string | null;
  avg_fcp: string | null;
  avg_lcp: string | null;
  avg_fid: string | null;
  avg_cls: string | null;
  avg_ttfb: string | null;
  avg_dns: string | null;
  avg_tcp: string | null;
  avg_ssl: string | null;
  avg_load_time: string | null;
}

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  // 每天凌晨 3:17 执行（错开整点，减少与其他定时任务碰撞）
  @Cron("17 3 * * *")
  async runDailyCleanup() {
    this.logger.log("=== 开始数据清理 ===");
    await this.aggregatePerformance();
    await this.deleteOldPerformanceRaw();
    await this.deleteOldErrors();
    await this.deleteOldErrorGroups();
    await this.deleteOldRecordScreens();
    await this.deleteOldWhiteScreens();
    await this.deleteOldPerformanceStats();
    this.logger.log("=== 数据清理完成 ===");
  }

  // PerformanceReport: 将 30~365 天前的原始数据聚合为每日均值
  private async aggregatePerformance() {
    const cutoff = daysAgo(RETENTION.performanceRaw);
    const oldest = daysAgo(RETENTION.performanceStat);

    const rows = await this.prisma.$queryRaw<DailyAggRow[]>`
      SELECT
        DATE(created_at)   AS stat_date,
        apikey,
        COUNT(*)           AS sample_count,
        AVG(fp)            AS avg_fp,
        AVG(fcp)           AS avg_fcp,
        AVG(lcp)           AS avg_lcp,
        AVG(fid)           AS avg_fid,
        AVG(cls)           AS avg_cls,
        AVG(ttfb)          AS avg_ttfb,
        AVG(dns)           AS avg_dns,
        AVG(tcp)           AS avg_tcp,
        AVG(ssl)           AS avg_ssl,
        AVG(load_time)     AS avg_load_time
      FROM performance_reports
      WHERE created_at < ${cutoff}
        AND created_at >= ${oldest}
      GROUP BY DATE(created_at), apikey
    `;

    if (rows.length === 0) return;

    for (const row of rows) {
      await this.prisma.performanceDailyStat.upsert({
        where: {
          statDate_apikey: { statDate: row.stat_date, apikey: row.apikey },
        },
        create: {
          statDate: row.stat_date,
          apikey: row.apikey,
          sampleCount: Number(row.sample_count),
          avgFp: toDecimal(row.avg_fp),
          avgFcp: toDecimal(row.avg_fcp),
          avgLcp: toDecimal(row.avg_lcp),
          avgFid: toDecimal(row.avg_fid),
          avgCls: toDecimal(row.avg_cls),
          avgTtfb: toDecimal(row.avg_ttfb),
          avgDns: toDecimal(row.avg_dns),
          avgTcp: toDecimal(row.avg_tcp),
          avgSsl: toDecimal(row.avg_ssl),
          avgLoadTime: toDecimal(row.avg_load_time),
        },
        update: {
          sampleCount: Number(row.sample_count),
          avgFp: toDecimal(row.avg_fp),
          avgFcp: toDecimal(row.avg_fcp),
          avgLcp: toDecimal(row.avg_lcp),
          avgFid: toDecimal(row.avg_fid),
          avgCls: toDecimal(row.avg_cls),
          avgTtfb: toDecimal(row.avg_ttfb),
          avgDns: toDecimal(row.avg_dns),
          avgTcp: toDecimal(row.avg_tcp),
          avgSsl: toDecimal(row.avg_ssl),
          avgLoadTime: toDecimal(row.avg_load_time),
        },
      });
    }

    this.logger.log(`性能数据聚合: ${rows.length} 条日统计 upsert 完成`);
  }

  private async deleteOldPerformanceRaw() {
    const cutoff = daysAgo(RETENTION.performanceRaw);
    const { count } = await this.prisma.performanceReport.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.logger.log(
      `删除原始性能数据: ${count} 条（>${RETENTION.performanceRaw}天）`,
    );
  }

  private async deleteOldErrors() {
    const cutoff = daysAgo(RETENTION.errorReport);
    // Breadcrumb 通过外键 onDelete: Cascade 自动清理
    const { count } = await this.prisma.errorReport.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.logger.log(`删除错误上报: ${count} 条（>${RETENTION.errorReport}天）`);
  }

  // ErrorGroup: 删除最近一次发生已超过保留期的分组
  private async deleteOldErrorGroups() {
    const cutoff = daysAgo(RETENTION.errorReport);
    const { count } = await this.prisma.errorGroup.deleteMany({
      where: { lastSeen: { lt: cutoff } },
    });
    this.logger.log(
      `删除错误分组: ${count} 组（最近发生>${RETENTION.errorReport}天）`,
    );
  }

  private async deleteOldRecordScreens() {
    const cutoff = daysAgo(RETENTION.recordScreen);
    // events 已迁 MinIO:删 DB 行前先清对象,避免遗留孤儿对象。分批捞 key 后删除,
    // MinIO 删除失败仅告警不阻断(对象会被 bucket lifecycle 兜底过期)。
    const expired = await this.prisma.recordScreen.findMany({
      where: { createdAt: { lt: cutoff }, eventsKey: { not: null } },
      select: { eventsKey: true },
    });
    let objDeleted = 0;
    for (const r of expired) {
      try {
        await this.minio.removeObject(r.eventsKey);
        objDeleted++;
      } catch (e) {
        this.logger.warn(`录屏对象删除失败 key=${r.eventsKey}: ${e?.message}`);
      }
    }
    const { count } = await this.prisma.recordScreen.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.logger.log(
      `删除录屏数据: ${count} 条（>${RETENTION.recordScreen}天）, 清理 MinIO 对象 ${objDeleted}/${expired.length}`,
    );
  }

  private async deleteOldWhiteScreens() {
    const cutoff = daysAgo(RETENTION.whiteScreen);
    const { count } = await this.prisma.whiteScreen.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.logger.log(`删除白屏数据: ${count} 条（>${RETENTION.whiteScreen}天）`);
  }

  private async deleteOldPerformanceStats() {
    const cutoff = daysAgo(RETENTION.performanceStat);
    const { count } = await this.prisma.performanceDailyStat.deleteMany({
      where: { statDate: { lt: cutoff } },
    });
    this.logger.log(
      `删除日聚合统计: ${count} 条（>${RETENTION.performanceStat}天）`,
    );
  }
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function toDecimal(val: string | null): number | null {
  return val == null ? null : parseFloat(val);
}

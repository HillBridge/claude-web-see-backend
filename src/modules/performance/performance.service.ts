import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IPageResult } from '@/common/interfaces/page-result.interface';
import { QueryPerformanceDto } from './dto/query-performance.dto';
import {
  TenantUser,
  resolveTenantApikeyFilter,
  assertApikeyAccess,
} from '@/common/utils/tenant-scope';

// 页面归一化(与 cleanup 聚合保持一致): path+hash,去掉 query 串,截断 255,空值归 (unknown)。
// 不含用户输入,可安全内联进 SQL。
const PAGE_EXPR = `COALESCE(NULLIF(LEFT(REGEXP_REPLACE(page_url, '\\\\?[^#]*', ''), 255), ''), '(unknown)')`;

// 标量 Web Vitals 指标白名单(用于校验 trend 的 name 入参)
const METRICS = ['FCP', 'LCP', 'FID', 'CLS', 'TTFB', 'FSP'];

// 原始表保留窗口(天):近 30 天在 raw,>30 天在日聚合表。与 cleanup 的 RETENTION.performanceRaw 一致。
const RAW_DAYS = 30;

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function fmtDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function goodRate(good: number, ni: number, poor: number): number | null {
  const total = good + ni + poor;
  return total ? good / total : null;
}

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

  // 页面列表(归一化后)+ 样本数,供前端页面选择器使用。取自近 30 天原始表。
  async listPages(apikey: string, user: TenantUser) {
    await assertApikeyAccess(this.prisma, user, apikey);
    const sql = `
      SELECT page, COUNT(*) AS cnt
      FROM (SELECT ${PAGE_EXPR} AS page FROM performance_reports WHERE apikey = ?) t
      GROUP BY page ORDER BY cnt DESC LIMIT 200`;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(sql, apikey);
    return rows.map((r) => ({ page: r.page, count: Number(r.cnt) }));
  }

  // 实时分位/占比快照: 从近 30 天原始表按指标算 p75/p95 + good 占比。可选按页面过滤。
  async getSummary(apikey: string, user: TenantUser, page?: string) {
    await assertApikeyAccess(this.prisma, user, apikey);
    const params: any[] = [apikey];
    let pageFilter = '';
    if (page) {
      pageFilter = `AND ${PAGE_EXPR} = ?`;
      params.push(page);
    }
    const sql = `
      WITH base AS (
        SELECT name, value, rating FROM performance_reports
        WHERE apikey = ? AND value IS NOT NULL ${pageFilter}
      ),
      ranked AS (
        SELECT name, value, rating,
          ROW_NUMBER() OVER (PARTITION BY name ORDER BY value) AS rn,
          COUNT(*)     OVER (PARTITION BY name) AS cnt
        FROM base
      )
      SELECT name,
        MAX(cnt) AS sample_count,
        MAX(CASE WHEN rn = CEIL(0.75 * cnt) THEN value END) AS p75,
        MAX(CASE WHEN rn = CEIL(0.95 * cnt) THEN value END) AS p95,
        AVG(value) AS avg_value,
        CAST(SUM(rating = 'good') AS UNSIGNED) AS good_count,
        CAST(SUM(rating = 'needs-improvement') AS UNSIGNED) AS ni_count,
        CAST(SUM(rating = 'poor') AS UNSIGNED) AS poor_count
      FROM ranked GROUP BY name`;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);
    const metrics: Record<string, any> = {};
    for (const r of rows) {
      const good = Number(r.good_count);
      const ni = Number(r.ni_count);
      const poor = Number(r.poor_count);
      metrics[r.name] = {
        p75: r.p75 != null ? Number(r.p75) : null,
        p95: r.p95 != null ? Number(r.p95) : null,
        avg: r.avg_value != null ? Number(r.avg_value) : null,
        sampleCount: Number(r.sample_count),
        good,
        ni,
        poor,
        goodRate: goodRate(good, ni, poor),
      };
    }
    return { apikey, page: page || null, metrics };
  }

  // 按天趋势: 单指标(可选单页面)。近 30 天从原始表现算,>30 天读日聚合表,按日期合并。
  async getTrend(
    apikey: string,
    user: TenantUser,
    name: string,
    page?: string,
    startTime?: number,
    endTime?: number,
  ) {
    await assertApikeyAccess(this.prisma, user, apikey);
    const metric = METRICS.includes(name) ? name : 'LCP';
    const cutoff = daysAgo(RAW_DAYS);

    // 1) 近 30 天:原始表按天现算
    const recParams: any[] = [metric, apikey, cutoff];
    let recPageFilter = '';
    if (page) {
      recPageFilter = `AND ${PAGE_EXPR} = ?`;
      recParams.push(page);
    }
    if (endTime) recParams.push(new Date(endTime));
    const recentSql = `
      WITH base AS (
        SELECT DATE(created_at) AS d, value, rating FROM performance_reports
        WHERE name = ? AND apikey = ? AND value IS NOT NULL AND created_at >= ?
          ${recPageFilter} ${endTime ? 'AND created_at <= ?' : ''}
      ),
      ranked AS (
        SELECT d, value, rating,
          ROW_NUMBER() OVER (PARTITION BY d ORDER BY value) AS rn,
          COUNT(*)     OVER (PARTITION BY d) AS cnt
        FROM base
      )
      SELECT d AS date,
        MAX(cnt) AS sample_count,
        MAX(CASE WHEN rn = CEIL(0.75 * cnt) THEN value END) AS p75,
        MAX(CASE WHEN rn = CEIL(0.95 * cnt) THEN value END) AS p95,
        CAST(SUM(rating = 'good') AS UNSIGNED) AS good_count,
        CAST(SUM(rating = 'needs-improvement') AS UNSIGNED) AS ni_count,
        CAST(SUM(rating = 'poor') AS UNSIGNED) AS poor_count
      FROM ranked GROUP BY d ORDER BY d`;
    const recentRows = await this.prisma.$queryRawUnsafe<any[]>(recentSql, ...recParams);

    // 2) >30 天:日聚合表
    const statWhere: any = { apikey, name: metric, statDate: { lt: cutoff } };
    if (page) statWhere.page = page;
    if (startTime) statWhere.statDate.gte = new Date(startTime);
    if (endTime && new Date(endTime) < cutoff) statWhere.statDate.lte = new Date(endTime);

    let histPoints: any[] = [];
    if (page) {
      // 指定页面:直接读该(页面,指标)的每日行
      const hist = await this.prisma.performanceDailyStat.findMany({
        where: statWhere,
        orderBy: { statDate: 'asc' },
      });
      histPoints = hist.map((h) => ({
        date: fmtDate(h.statDate),
        p75: h.p75 != null ? Number(h.p75) : null,
        p95: h.p95 != null ? Number(h.p95) : null,
        sampleCount: h.sampleCount,
        goodRate: goodRate(h.goodCount, h.niCount, h.poorCount),
      }));
    } else {
      // 全部页面:按天合并计数算 good%(可合并);p75 跨页面不可合并 → 置 null
      const grouped = await this.prisma.performanceDailyStat.groupBy({
        by: ['statDate'],
        where: statWhere,
        _sum: { sampleCount: true, goodCount: true, niCount: true, poorCount: true },
        orderBy: { statDate: 'asc' },
      });
      histPoints = grouped.map((g) => ({
        date: fmtDate(g.statDate),
        p75: null,
        p95: null,
        sampleCount: g._sum.sampleCount || 0,
        goodRate: goodRate(g._sum.goodCount || 0, g._sum.niCount || 0, g._sum.poorCount || 0),
      }));
    }

    const recentPoints = recentRows.map((r) => ({
      date: fmtDate(r.date),
      p75: r.p75 != null ? Number(r.p75) : null,
      p95: r.p95 != null ? Number(r.p95) : null,
      sampleCount: Number(r.sample_count),
      goodRate: goodRate(Number(r.good_count), Number(r.ni_count), Number(r.poor_count)),
    }));

    // 合并(日聚合在前、原始在后),按日期排序
    const merged = [...histPoints, ...recentPoints].sort((a, b) => a.date.localeCompare(b.date));
    return { apikey, page: page || null, name: metric, points: merged };
  }
}

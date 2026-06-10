import { PerformanceService } from "./performance.service";

/**
 * PerformanceService 单元测试 —— 验证 p75/good 占比/按页面/按天 的服务层:
 * - getSummary: 从 raw 算 p75/p95 + good 占比并 reshape
 * - listPages: 归一化页面列表
 * - getTrend: 近 30 天(raw)+ 历史(日表)按日期合并
 * - 租户隔离: 普通用户访问非自己 apikey → 403,且不触达查询
 * mock PrismaService。ADMIN 短路租户校验。
 */
const ADMIN = { id: 1, role: "ADMIN" };
const USER = { id: 2, role: "USER" };

function makeService() {
  const prisma = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    performanceReport: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
    },
    performanceDailyStat: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    project: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  };
  return { service: new PerformanceService(prisma as any), prisma };
}

describe("PerformanceService.getSummary", () => {
  it("按指标算 p75/p95 + good 占比并 reshape", async () => {
    const { service, prisma } = makeService();
    prisma.$queryRawUnsafe.mockResolvedValue([
      { name: "FCP", sample_count: 3, p75: 1800, p95: 2400, avg_value: 1500, good_count: 2, ni_count: 1, poor_count: 0 },
    ]);
    const res = await service.getSummary("k", ADMIN as any);
    expect(res.metrics.FCP.p75).toBe(1800);
    expect(res.metrics.FCP.p95).toBe(2400);
    expect(res.metrics.FCP.sampleCount).toBe(3);
    expect(res.metrics.FCP.goodRate).toBeCloseTo(2 / 3);
  });

  it("普通用户查非自己 apikey → 403,且不触达查询", async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.getSummary("k", USER as any)).rejects.toThrow();
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("PerformanceService.listPages", () => {
  it("返回归一化页面 + 样本数", async () => {
    const { service, prisma } = makeService();
    prisma.$queryRawUnsafe.mockResolvedValue([
      { page: "/home", cnt: 5 },
      { page: "/detail", cnt: 2 },
    ]);
    const res = await service.listPages("k", ADMIN as any);
    expect(res).toEqual([
      { page: "/home", count: 5 },
      { page: "/detail", count: 2 },
    ]);
  });
});

describe("PerformanceService.getTrend", () => {
  it("指定页面:近 30 天(raw)+ 历史(日表)按日期合并", async () => {
    const { service, prisma } = makeService();
    // 近 30 天 raw
    prisma.$queryRawUnsafe.mockResolvedValue([
      { date: "2026-06-10", sample_count: 2, p75: 2000, p95: 2500, good_count: 1, ni_count: 1, poor_count: 0 },
    ]);
    // 历史日表(指定页面走 findMany)
    prisma.performanceDailyStat.findMany.mockResolvedValue([
      { statDate: new Date("2026-05-01T00:00:00Z"), p75: 1900, p95: 2300, sampleCount: 10, goodCount: 8, niCount: 2, poorCount: 0 },
    ]);
    const res = await service.getTrend("k", ADMIN as any, "LCP", "/home");
    expect(res.name).toBe("LCP");
    expect(res.points).toHaveLength(2);
    // 历史在前、近期在后,按日期升序
    expect(res.points[0].date).toBe("2026-05-01");
    expect(res.points[1].date).toBe("2026-06-10");
    expect(res.points[1].p75).toBe(2000);
    expect(res.points[1].goodRate).toBeCloseTo(0.5);
  });

  it("非法 name 回退为 LCP", async () => {
    const { service } = makeService();
    const res = await service.getTrend("k", ADMIN as any, "BOGUS", "/home");
    expect(res.name).toBe("LCP");
  });
});

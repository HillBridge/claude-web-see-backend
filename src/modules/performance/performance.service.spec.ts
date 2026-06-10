import { PerformanceService } from "./performance.service";

/**
 * PerformanceService 单元测试 —— 验证长格式适配后的服务层:
 * - getAvgMetrics 对长格式原始表按 name 分组求均值并 reshape
 * - 租户隔离: 普通用户访问非自己 apikey → 403(经 assertApikeyAccess)
 * - getDailyStats 读宽聚合表
 * mock PrismaService。ADMIN 用户可短路租户校验(无需 DB)。
 */
const ADMIN = { id: 1, role: "ADMIN" };
const USER = { id: 2, role: "USER" };

function makeService() {
  const prisma = {
    performanceReport: {
      groupBy: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
    },
    performanceDailyStat: { findMany: jest.fn().mockResolvedValue([]) },
    project: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  };
  return { service: new PerformanceService(prisma as any), prisma };
}

describe("PerformanceService.getAvgMetrics(长格式)", () => {
  it("按 name 分组求均值并 reshape 成 { avg, total }", async () => {
    const { service, prisma } = makeService();
    prisma.performanceReport.groupBy.mockResolvedValue([
      { name: "FCP", _avg: { value: 1000 }, _count: { _all: 3 } },
      { name: "LCP", _avg: { value: 2000 }, _count: { _all: 2 } },
    ]);
    const res = await service.getAvgMetrics("k", ADMIN as any);
    expect(prisma.performanceReport.groupBy).toHaveBeenCalled();
    expect(res.avg.FCP).toEqual({ avg: 1000, count: 3 });
    expect(res.avg.LCP).toEqual({ avg: 2000, count: 2 });
    expect(res.total).toBe(5);
  });

  it("普通用户查非自己拥有的 apikey → 403,且不触达聚合查询", async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue(null); // 不属于该用户
    await expect(service.getAvgMetrics("k", USER as any)).rejects.toThrow();
    expect(prisma.performanceReport.groupBy).not.toHaveBeenCalled();
  });
});

describe("PerformanceService.getDailyStats(宽聚合服务层)", () => {
  it("读 performanceDailyStat,带时间范围过滤", async () => {
    const { service, prisma } = makeService();
    await service.getDailyStats("k", ADMIN as any, 1000, 2000);
    const arg = prisma.performanceDailyStat.findMany.mock.calls[0][0];
    expect(arg.where.apikey).toBe("k");
    expect(arg.where.statDate.gte).toBeInstanceOf(Date);
    expect(arg.where.statDate.lte).toBeInstanceOf(Date);
    expect(arg.orderBy).toEqual({ statDate: "asc" });
  });
});

describe("PerformanceService.findAll 租户隔离", () => {
  it("ADMIN 无显式 apikey → 不加 apikey 限制,正常分页查询", async () => {
    const { service, prisma } = makeService();
    prisma.performanceReport.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.performanceReport.count.mockResolvedValue(1);
    const res = await service.findAll({ page: 1, pageSize: 20 } as any, ADMIN as any);
    expect(res.total).toBe(1);
    expect(prisma.performanceReport.findMany).toHaveBeenCalled();
  });
});

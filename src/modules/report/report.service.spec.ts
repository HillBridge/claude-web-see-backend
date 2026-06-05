import { ReportService } from "./report.service";

/**
 * ReportService 单元测试 —— 验证 handleReport 按 type 分发到正确落库方法,
 * 以及 saveRecordScreen 的写入守卫(缺 recordScreenId/events/apikey 时跳过,
 * 避免脏数据落库或绕过 (apikey, recordScreenId) 复合唯一去重)。
 * mock PrismaService / MinioService / ConfigService(未配置加密)。
 */
function makeService() {
  const prisma = {
    errorGroup: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
    errorReport: { create: jest.fn().mockResolvedValue({ id: 11 }) },
    breadcrumb: { createMany: jest.fn().mockResolvedValue({}) },
    performanceReport: { create: jest.fn().mockResolvedValue({}) },
    whiteScreen: { create: jest.fn().mockResolvedValue({}) },
    recordScreen: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const minio = { putObject: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue("") } as any; // 未配置加密
  return {
    service: new ReportService(prisma as any, minio as any, config),
    prisma,
    minio,
  };
}

describe("ReportService.handleReport 分发", () => {
  it("无 data/type → 直接 no-op", async () => {
    const { service, prisma } = makeService();
    await service.handleReport(undefined as any);
    await service.handleReport({} as any);
    expect(prisma.errorGroup.upsert).not.toHaveBeenCalled();
  });

  it("type=performance → 写 performanceReport", async () => {
    const { service, prisma } = makeService();
    await service.handleReport({ type: "performance", apikey: "k" } as any);
    expect(prisma.performanceReport.create).toHaveBeenCalled();
  });

  it("type=whiteScreen → 写 whiteScreen", async () => {
    const { service, prisma } = makeService();
    await service.handleReport({ type: "whiteScreen", apikey: "k" } as any);
    expect(prisma.whiteScreen.create).toHaveBeenCalled();
  });

  it("type=error(及其它)→ 归并到 errorGroup + errorReport", async () => {
    const { service, prisma } = makeService();
    await service.handleReport({
      type: "error",
      apikey: "k",
      message: "boom",
    } as any);
    expect(prisma.errorGroup.upsert).toHaveBeenCalled();
    expect(prisma.errorReport.create).toHaveBeenCalled();
  });

  it("未知 type 同样归入错误表(default 分支)", async () => {
    const { service, prisma } = makeService();
    await service.handleReport({ type: "httpError", apikey: "k" } as any);
    expect(prisma.errorGroup.upsert).toHaveBeenCalled();
  });
});

describe("ReportService.saveRecordScreen 写入守卫", () => {
  it("缺 events → 跳过(不写 MinIO/DB)", async () => {
    const { service, prisma, minio } = makeService();
    await service.handleReport({
      type: "recordScreen",
      apikey: "k",
      recordScreenId: "r1",
    } as any);
    expect(minio.putObject).not.toHaveBeenCalled();
    expect(prisma.recordScreen.upsert).not.toHaveBeenCalled();
  });

  it("缺 recordScreenId → 跳过", async () => {
    const { service, minio } = makeService();
    await service.handleReport({
      type: "recordScreen",
      apikey: "k",
      events: "x",
    } as any);
    expect(minio.putObject).not.toHaveBeenCalled();
  });

  it("缺 apikey → 跳过(防落 NULL 分区绕过复合唯一去重)", async () => {
    const { service, minio } = makeService();
    await service.handleReport({
      type: "recordScreen",
      recordScreenId: "r1",
      events: "x",
    } as any);
    expect(minio.putObject).not.toHaveBeenCalled();
  });

  it("完整录屏 → 落 MinIO(确定性 key)并 upsert DB", async () => {
    const { service, prisma, minio } = makeService();
    await service.handleReport({
      type: "recordScreen",
      apikey: "k",
      recordScreenId: "r1",
      events: "hello",
    } as any);
    expect(minio.putObject).toHaveBeenCalledWith(
      "record-screen/k/r1",
      expect.any(Buffer),
      "application/octet-stream",
    );
    expect(prisma.recordScreen.upsert).toHaveBeenCalled();
    // 未配置加密 → 落盘为明文,eventsSize 为原始字节数
    const upsertArg = prisma.recordScreen.upsert.mock.calls[0][0];
    expect(upsertArg.create.eventsKey).toBe("record-screen/k/r1");
    expect(upsertArg.create.eventsSize).toBe(Buffer.from("hello").length);
  });
});

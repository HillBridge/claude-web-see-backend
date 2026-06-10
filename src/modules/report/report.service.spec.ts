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

  it("type=performance(长格式)→ 写 performanceReport,映射 name/value", async () => {
    const { service, prisma } = makeService();
    await service.handleReport({
      type: "performance",
      apikey: "k",
      name: "FCP",
      value: 1234,
      rating: "good",
    } as any);
    expect(prisma.performanceReport.create).toHaveBeenCalled();
    const arg = prisma.performanceReport.create.mock.calls[0][0].data;
    expect(arg.name).toBe("FCP");
    expect(arg.value).toBe(1234);
    expect(arg.rating).toBe("good");
  });

  it("type=performance 缺 name → 静默丢弃(不落库)", async () => {
    const { service, prisma } = makeService();
    await service.handleReport({ type: "performance", apikey: "k" } as any);
    expect(prisma.performanceReport.create).not.toHaveBeenCalled();
  });

  it("type=performance 非标量事件(longTask/resourceList/memory)→ 不落库", async () => {
    const { service, prisma } = makeService();
    await service.handleReport({ type: "performance", apikey: "k", name: "longTask", longTask: {} } as any);
    await service.handleReport({ type: "performance", apikey: "k", name: "resourceList", resourceList: [] } as any);
    await service.handleReport({ type: "performance", apikey: "k", name: "memory", memory: {} } as any);
    expect(prisma.performanceReport.create).not.toHaveBeenCalled();
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

describe("ReportService.saveError 网络请求(httpError)字段提取", () => {
  it("xhr/httpError(@websee 上报结构)→ 提取请求方式/参数/响应到 errorReport", async () => {
    const { service, prisma } = makeService();
    await service.handleReport({
      type: "xhr",
      apikey: "k",
      message: "https://api.x/login; 请求失败，Status值为:500",
      url: "https://api.x/login",
      status: "error", // 顶层 status 是 'ok'/'error' 枚举, 不是 HTTP 码
      elapsedTime: 1234,
      requestData: {
        httpType: "xhr",
        method: "POST",
        data: { user: "u" },
      },
      response: { Status: 500, data: { msg: "boom" } }, // HTTP 码在 response.Status(大写)
    } as any);

    const arg = prisma.errorReport.create.mock.calls[0][0].data;
    expect(arg.requestUrl).toBe("https://api.x/login");
    expect(arg.requestMethod).toBe("POST");
    expect(arg.httpType).toBe("xhr");
    // 对象 body 字符串化后落库
    expect(arg.requestData).toBe(JSON.stringify({ user: "u" }));
    // HTTP 码取自 response.Status(数字), 不能取顶层 status('error' 字符串)
    expect(arg.responseStatus).toBe(500);
    expect(arg.responseData).toBe(JSON.stringify({ msg: "boom" }));
    expect(arg.elapsedTime).toBe(1234);
  });

  it("顶层 status='error' 不得写入 Int 列 responseStatus(防 Prisma 插入失败)", async () => {
    const { service, prisma } = makeService();
    await service.handleReport({
      type: "xhr",
      apikey: "k",
      status: "error",
      response: { data: "boom" }, // 无 Status
    } as any);

    const arg = prisma.errorReport.create.mock.calls[0][0].data;
    expect(arg.responseStatus).toBeNull();
    expect(arg.responseData).toBe("boom");
  });

  it("普通 error(无网络字段)→ 网络请求字段全部为 null", async () => {
    const { service, prisma } = makeService();
    await service.handleReport({
      type: "error",
      apikey: "k",
      message: "boom",
    } as any);

    const arg = prisma.errorReport.create.mock.calls[0][0].data;
    expect(arg.requestUrl).toBeNull();
    expect(arg.requestMethod).toBeNull();
    expect(arg.httpType).toBeNull();
    expect(arg.requestData).toBeNull();
    expect(arg.responseStatus).toBeNull();
    expect(arg.responseData).toBeNull();
    expect(arg.elapsedTime).toBeNull();
  });

  it("字符串形式的请求/响应体直接落库(不二次字符串化)", async () => {
    const { service, prisma } = makeService();
    await service.handleReport({
      type: "httpError",
      apikey: "k",
      requestData: { method: "GET", data: "a=1&b=2" },
      response: { status: 404, data: "Not Found" },
    } as any);

    const arg = prisma.errorReport.create.mock.calls[0][0].data;
    expect(arg.requestData).toBe("a=1&b=2");
    expect(arg.responseData).toBe("Not Found");
    expect(arg.responseStatus).toBe(404);
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

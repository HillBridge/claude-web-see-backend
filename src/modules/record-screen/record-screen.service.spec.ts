import { RecordScreenService } from "./record-screen.service";

/**
 * RecordScreenService.loadEvents 单元测试 —— 容错契约:对象缺失/读取/解密失败时返回 null,
 * 不阻断录屏详情返回(录屏可能已过保留期被清)。直接测私有方法,mock MinioService。
 * encKey 未配置(config 返回空)→ decryptEvents 对明文对象按 utf-8 直通。
 */
function makeService(getObject: jest.Mock) {
  const prisma = {} as any;
  const minio = { getObject } as any;
  const config = { get: jest.fn().mockReturnValue("") } as any; // 未配置加密
  return new RecordScreenService(prisma, minio, config);
}

describe("RecordScreenService.loadEvents", () => {
  it("eventsKey 为空 → 返回 null(不查 MinIO)", async () => {
    const getObject = jest.fn();
    const svc = makeService(getObject);
    expect(await (svc as any).loadEvents(null)).toBeNull();
    expect(getObject).not.toHaveBeenCalled();
  });

  it("MinIO 读取抛错 → 容错返回 null,不抛", async () => {
    const getObject = jest.fn().mockRejectedValue(new Error("NoSuchKey"));
    const svc = makeService(getObject);
    expect(await (svc as any).loadEvents("some/key")).toBeNull();
  });

  it("明文历史对象 → 按 utf-8 直读返回(无密钥也直通)", async () => {
    const getObject = jest
      .fn()
      .mockResolvedValue(Buffer.from("plain-events", "utf-8"));
    const svc = makeService(getObject);
    expect(await (svc as any).loadEvents("k")).toBe("plain-events");
  });
});

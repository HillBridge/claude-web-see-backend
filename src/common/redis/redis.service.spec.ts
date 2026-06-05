import { RedisService } from "./redis.service";

/**
 * RedisService 单元测试 —— token 白名单 key 方案必须在 add/has/remove 间保持一致,
 * 否则登出/失效校验会错位。mock ioredis 客户端。
 */
function makeService(clientOverrides: any = {}) {
  const client = {
    set: jest.fn().mockResolvedValue("OK"),
    exists: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    scan: jest.fn(),
    ...clientOverrides,
  };
  return { service: new RedisService(client as any), client };
}

describe("RedisService token 白名单", () => {
  it("addToken 使用 auth:token:{uid}:{jti} 且带 EX TTL", async () => {
    const { service, client } = makeService();
    await service.addToken(7, "jti-1", 3600);
    expect(client.set).toHaveBeenCalledWith(
      "auth:token:7:jti-1",
      "1",
      "EX",
      3600,
    );
  });

  it("hasToken 命中 → true,未命中 → false", async () => {
    const { service, client } = makeService();
    client.exists.mockResolvedValueOnce(1);
    expect(await service.hasToken(7, "jti-1")).toBe(true);
    client.exists.mockResolvedValueOnce(0);
    expect(await service.hasToken(7, "jti-1")).toBe(false);
    expect(client.exists).toHaveBeenCalledWith("auth:token:7:jti-1");
  });

  it("removeToken 删除对应 key", async () => {
    const { service, client } = makeService();
    await service.removeToken(7, "jti-1");
    expect(client.del).toHaveBeenCalledWith("auth:token:7:jti-1");
  });

  it("removeAllUserTokens 按 SCAN 游标分页删除该用户全部 token", async () => {
    const scan = jest
      .fn()
      // 第一页:游标非 0,返回两个 key
      .mockResolvedValueOnce(["10", ["auth:token:7:a", "auth:token:7:b"]])
      // 第二页:游标回 0,返回一个 key,循环结束
      .mockResolvedValueOnce(["0", ["auth:token:7:c"]]);
    const { service, client } = makeService({ scan });
    await service.removeAllUserTokens(7);
    expect(client.scan).toHaveBeenCalledTimes(2);
    expect(client.scan).toHaveBeenCalledWith(
      "0",
      "MATCH",
      "auth:token:7:*",
      "COUNT",
      100,
    );
    expect(client.del).toHaveBeenCalledWith("auth:token:7:a", "auth:token:7:b");
    expect(client.del).toHaveBeenCalledWith("auth:token:7:c");
  });

  it("removeAllUserTokens:某页无 key 时跳过 del", async () => {
    const scan = jest.fn().mockResolvedValueOnce(["0", []]);
    const { service, client } = makeService({ scan });
    await service.removeAllUserTokens(7);
    expect(client.del).not.toHaveBeenCalled();
  });
});

import { HttpException, ExecutionContext } from "@nestjs/common";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";

function ctx(req: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

function makeRedis() {
  const store = new Map<string, number>();
  const client = {
    incr: jest.fn(async (key: string) => {
      const n = (store.get(key) ?? 0) + 1;
      store.set(key, n);
      return n;
    }),
    expire: jest.fn(async () => 1),
  };
  return { redisClient: client } as any;
}

describe("AuthRateLimitGuard", () => {
  it("登录尝试 ≤ 5 → 放行", async () => {
    const guard = new AuthRateLimitGuard(makeRedis());
    const req = { headers: {}, socket: { remoteAddress: "1.2.3.4" } };
    for (let i = 0; i < 5; i++) {
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    }
  });

  it("第 6 次登录尝试 → 抛 429", async () => {
    const guard = new AuthRateLimitGuard(makeRedis());
    const req = { headers: {}, socket: { remoteAddress: "1.2.3.4" } };
    for (let i = 0; i < 5; i++) await guard.canActivate(ctx(req));
    let err: any;
    try {
      await guard.canActivate(ctx(req));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
  });

  it("按 IP 维度计数:不同 IP 互不影响", async () => {
    const redis = makeRedis();
    const guard = new AuthRateLimitGuard(redis);
    await guard.canActivate(
      ctx({ headers: {}, socket: { remoteAddress: "1.1.1.1" } }),
    );
    await guard.canActivate(
      ctx({ headers: {}, socket: { remoteAddress: "2.2.2.2" } }),
    );
    expect(redis.redisClient.incr).toHaveBeenCalledWith(
      "ratelimit:auth:1.1.1.1",
    );
    expect(redis.redisClient.incr).toHaveBeenCalledWith(
      "ratelimit:auth:2.2.2.2",
    );
  });

  it("默认不信任 X-Forwarded-For:伪造 XFF 无法绕过限流,按 TCP 来源 IP 计数", async () => {
    const redis = makeRedis();
    const guard = new AuthRateLimitGuard(redis);
    await guard.canActivate(
      ctx({
        headers: { "x-forwarded-for": "8.8.8.8, 7.7.7.7" },
        socket: { remoteAddress: "1.1.1.1" },
      }),
    );
    // 未设 TRUST_PROXY → 忽略 XFF,使用 socket.remoteAddress
    expect(redis.redisClient.incr).toHaveBeenCalledWith(
      "ratelimit:auth:1.1.1.1",
    );
    expect(redis.redisClient.incr).not.toHaveBeenCalledWith(
      "ratelimit:auth:8.8.8.8",
    );
  });

  it("仅当 TRUST_PROXY=true 时才采信 X-Forwarded-For 第一跳", async () => {
    const prev = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = "true";
    try {
      const redis = makeRedis();
      const guard = new AuthRateLimitGuard(redis);
      await guard.canActivate(
        ctx({
          headers: { "x-forwarded-for": "8.8.8.8, 7.7.7.7" },
          socket: { remoteAddress: "1.1.1.1" },
        }),
      );
      expect(redis.redisClient.incr).toHaveBeenCalledWith(
        "ratelimit:auth:8.8.8.8",
      );
    } finally {
      // 还原,避免污染其他用例
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });

  it("remoteAddress=::1 → 归一化为 127.0.0.1", async () => {
    const redis = makeRedis();
    const guard = new AuthRateLimitGuard(redis);
    await guard.canActivate(
      ctx({ headers: {}, socket: { remoteAddress: "::1" } }),
    );
    expect(redis.redisClient.incr).toHaveBeenCalledWith(
      "ratelimit:auth:127.0.0.1",
    );
  });

  it("无 XFF 且无 remoteAddress → IP 回退为 unknown", async () => {
    const redis = makeRedis();
    const guard = new AuthRateLimitGuard(redis);
    await guard.canActivate(ctx({ headers: {}, socket: {} }));
    expect(redis.redisClient.incr).toHaveBeenCalledWith(
      "ratelimit:auth:unknown",
    );
  });
});

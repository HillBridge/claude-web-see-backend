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
});

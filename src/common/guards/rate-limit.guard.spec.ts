import { HttpException, ExecutionContext } from "@nestjs/common";
import { RateLimitGuard } from "./rate-limit.guard";

function ctx(req: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

/** 内存版 redis 桩:模拟 incr/expire 计数行为 */
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

describe("RateLimitGuard", () => {
  const OLD_ENV = process.env.TRUST_PROXY;
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = OLD_ENV;
  });

  it("未超限 → 放行,首次计数设置 TTL", async () => {
    const redis = makeRedis();
    const guard = new RateLimitGuard(redis);
    const req = {
      body: { apikey: "k" },
      headers: {},
      socket: { remoteAddress: "1.2.3.4" },
    };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    // apikey 与 ip 各首次 incr → 各 expire 一次
    expect(redis.redisClient.expire).toHaveBeenCalledTimes(2);
  });

  it("超过 per-IP 上限(120)→ 抛 429", async () => {
    const redis = makeRedis();
    const guard = new RateLimitGuard(redis);
    const req = {
      body: { apikey: "k" },
      headers: {},
      socket: { remoteAddress: "9.9.9.9" },
    };
    // 第 121 次 IP 计数应触发(apikey 上限 500 更高,先撞 IP)
    let lastErr: any;
    for (let i = 0; i < 121; i++) {
      try {
        await guard.canActivate(ctx(req));
      } catch (e) {
        lastErr = e;
      }
    }
    expect(lastErr).toBeInstanceOf(HttpException);
    expect(lastErr.getStatus()).toBe(429);
  });

  it("默认忽略 X-Forwarded-For,用 socket 真实 IP 计数(防 XFF 伪造绕过)", async () => {
    delete process.env.TRUST_PROXY;
    const redis = makeRedis();
    const guard = new RateLimitGuard(redis);
    const req = {
      body: { apikey: "k" },
      headers: { "x-forwarded-for": "8.8.8.8" },
      socket: { remoteAddress: "1.1.1.1" },
    };
    await guard.canActivate(ctx(req));
    // 计数 key 应基于 socket IP 1.1.1.1,而非伪造的 8.8.8.8
    expect(redis.redisClient.incr).toHaveBeenCalledWith("ratelimit:ip:1.1.1.1");
    expect(redis.redisClient.incr).not.toHaveBeenCalledWith(
      "ratelimit:ip:8.8.8.8",
    );
  });

  it("TRUST_PROXY=true 时采信 XFF 第一跳", async () => {
    process.env.TRUST_PROXY = "true";
    const redis = makeRedis();
    const guard = new RateLimitGuard(redis);
    const req = {
      body: { apikey: "k" },
      headers: { "x-forwarded-for": "8.8.8.8, 7.7.7.7" },
      socket: { remoteAddress: "1.1.1.1" },
    };
    await guard.canActivate(ctx(req));
    expect(redis.redisClient.incr).toHaveBeenCalledWith("ratelimit:ip:8.8.8.8");
  });

  it("IPv6 本地/映射地址归一化为 IPv4", async () => {
    delete process.env.TRUST_PROXY;
    const redis = makeRedis();
    const guard = new RateLimitGuard(redis);
    const req = {
      body: { apikey: "k" },
      headers: {},
      socket: { remoteAddress: "::ffff:5.6.7.8" },
    };
    await guard.canActivate(ctx(req));
    expect(redis.redisClient.incr).toHaveBeenCalledWith("ratelimit:ip:5.6.7.8");
  });

  it('缺 apikey 时用 "unknown" 计数', async () => {
    const redis = makeRedis();
    const guard = new RateLimitGuard(redis);
    const req = { body: {}, headers: {}, socket: { remoteAddress: "1.2.3.4" } };
    await guard.canActivate(ctx(req));
    expect(redis.redisClient.incr).toHaveBeenCalledWith(
      "ratelimit:apikey:unknown",
    );
  });
});

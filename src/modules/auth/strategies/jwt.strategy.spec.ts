import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "./jwt.strategy";

/**
 * JwtStrategy.validate 单元测试 —— 登录态白名单校验是登出/强制下线安全模型的核心。
 * 仅测 validate 逻辑:用 mock 的 ConfigService / UsersService / RedisService 构造,
 * 不连真实 passport / Redis。
 */
function makeStrategy(opts: { user?: any; hasToken?: boolean }) {
  const config = { get: jest.fn().mockReturnValue("test-secret") } as any;
  const users = {
    findById: jest.fn().mockResolvedValue(opts.user),
  } as any;
  const redis = {
    hasToken: jest.fn().mockResolvedValue(opts.hasToken ?? false),
  } as any;
  return { strategy: new JwtStrategy(config, users, redis), users, redis };
}

const PAYLOAD = { sub: 7, username: "u", role: "USER", jti: "jti-1" } as any;

describe("JwtStrategy.validate", () => {
  it("用户不存在/已删除 → 401", async () => {
    const { strategy } = makeStrategy({ user: null });
    await expect(strategy.validate(PAYLOAD)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("jti 不在 Redis 白名单 → 401(Token 已失效)", async () => {
    const { strategy } = makeStrategy({
      user: { id: 7, username: "u", role: "USER" },
      hasToken: false,
    });
    await expect(strategy.validate(PAYLOAD)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("用户存在且 jti 在白名单 → 返回精简用户信息", async () => {
    const { strategy, redis } = makeStrategy({
      user: { id: 7, username: "alice", role: "ADMIN", password: "x" },
      hasToken: true,
    });
    await expect(strategy.validate(PAYLOAD)).resolves.toEqual({
      id: 7,
      username: "alice",
      role: "ADMIN",
      jti: "jti-1",
    });
    // 用 payload.sub 查用户、用 (user.id, jti) 查白名单
    expect(redis.hasToken).toHaveBeenCalledWith(7, "jti-1");
  });
});

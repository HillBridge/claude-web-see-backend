import { ConflictException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";

/**
 * AuthService 单元测试 —— 认证核心。用真实 bcrypt,mock UsersService / JwtService / RedisService。
 */
function makeService(overrides: any = {}) {
  const users = {
    findByUsername: jest.fn().mockResolvedValue(null),
    findByEmail: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    ...overrides.users,
  };
  const jwt = {
    sign: jest.fn().mockReturnValue("signed.jwt.token"),
    ...overrides.jwt,
  };
  const redis = {
    addToken: jest.fn().mockResolvedValue(undefined),
    removeToken: jest.fn().mockResolvedValue(undefined),
    removeAllUserTokens: jest.fn().mockResolvedValue(undefined),
    ...overrides.redis,
  };
  return {
    service: new AuthService(users as any, jwt as any, redis as any),
    users,
    jwt,
    redis,
  };
}

describe("AuthService.validateUser", () => {
  it("用户不存在 → null", async () => {
    const { service } = makeService();
    expect(await service.validateUser("nobody", "pw")).toBeNull();
  });

  it("密码错误 → null", async () => {
    const hash = await bcrypt.hash("correct", 10);
    const { service } = makeService({
      users: {
        findByUsername: jest.fn().mockResolvedValue({ id: 1, password: hash }),
      },
    });
    expect(await service.validateUser("u", "wrong")).toBeNull();
  });

  it("密码正确 → 返回用户", async () => {
    const hash = await bcrypt.hash("correct", 10);
    const user = { id: 1, username: "u", password: hash };
    const { service } = makeService({
      users: { findByUsername: jest.fn().mockResolvedValue(user) },
    });
    expect(await service.validateUser("u", "correct")).toBe(user);
  });
});

describe("AuthService.login", () => {
  it("颁发 JWT 且写入 Redis 白名单", async () => {
    const { service, jwt, redis } = makeService();
    const res = await service.login({ id: 5, username: "u", role: "USER" });
    expect(res.accessToken).toBe("signed.jwt.token");
    expect(res.user).toEqual({ id: 5, username: "u", role: "USER" });
    // payload 含随机 jti,且用同一 jti 写白名单
    const signedPayload = jwt.sign.mock.calls[0][0];
    expect(signedPayload.sub).toBe(5);
    expect(signedPayload.jti).toBeTruthy();
    expect(redis.addToken).toHaveBeenCalledWith(
      5,
      signedPayload.jti,
      expect.any(Number),
    );
  });
});

describe("AuthService.register", () => {
  const dto = { username: "new", email: "n@e.com", password: "pw" } as any;

  it("用户名已占用 → Conflict", async () => {
    const { service } = makeService({
      users: { findByUsername: jest.fn().mockResolvedValue({ id: 1 }) },
    });
    await expect(service.register(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("邮箱已注册 → Conflict", async () => {
    const { service } = makeService({
      users: {
        findByUsername: jest.fn().mockResolvedValue(null),
        findByEmail: jest.fn().mockResolvedValue({ id: 2 }),
      },
    });
    await expect(service.register(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("成功注册 → 密码经 bcrypt 哈希存储,颁发 token", async () => {
    const created = { id: 9, username: "new", email: "n@e.com", role: "USER" };
    const create = jest.fn().mockResolvedValue(created);
    const { service, redis } = makeService({
      users: {
        findByUsername: jest.fn().mockResolvedValue(null),
        findByEmail: jest.fn().mockResolvedValue(null),
        create,
      },
    });
    const res = await service.register(dto);
    const stored = create.mock.calls[0][0];
    expect(stored.password).not.toBe("pw"); // 不存明文
    expect(await bcrypt.compare("pw", stored.password)).toBe(true);
    expect(res.accessToken).toBe("signed.jwt.token");
    expect(redis.addToken).toHaveBeenCalled();
  });
});

describe("AuthService.logout / forceLogout", () => {
  it("logout 移除单个 token", async () => {
    const { service, redis } = makeService();
    await service.logout(3, "jti-x");
    expect(redis.removeToken).toHaveBeenCalledWith(3, "jti-x");
  });

  it("forceLogout 移除该用户全部 token", async () => {
    const { service, redis } = makeService();
    await service.forceLogout(3);
    expect(redis.removeAllUserTokens).toHaveBeenCalledWith(3);
  });
});

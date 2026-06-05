import { UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { JwtAuthGuard } from "./jwt-auth.guard";

/**
 * JwtAuthGuard 单元测试 —— 只测本 guard 自有逻辑:
 *   - @Public() 路由直接放行(不进入 passport);
 *   - handleRequest 对 err/无 user 抛 401,否则透传 user。
 * (非 public 分支会进入 passport super.canActivate,属集成层,不在单元范围。)
 */
function ctx(): any {
  return { getHandler: () => ({}), getClass: () => ({}) };
}

function makeGuard(isPublic: boolean) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as any;
  return new JwtAuthGuard(reflector);
}

describe("JwtAuthGuard", () => {
  it("@Public() 标记的路由 → 直接放行 true", () => {
    expect(makeGuard(true).canActivate(ctx())).toBe(true);
  });

  it("非 @Public() 路由 → 委派给 passport 的 super.canActivate", () => {
    // AuthGuard('jwt') 按 type 记忆化,父类即此;spy 其原型 canActivate 以隔离 passport
    const superSpy = jest
      .spyOn(AuthGuard("jwt").prototype as any, "canActivate")
      .mockReturnValue(true);
    try {
      const guard = makeGuard(false);
      expect(guard.canActivate(ctx())).toBe(true);
      expect(superSpy).toHaveBeenCalled();
    } finally {
      superSpy.mockRestore();
    }
  });

  describe("handleRequest", () => {
    it("有错误 → 抛该错误", () => {
      const err = new Error("boom");
      expect(() => makeGuard(false).handleRequest(err, null)).toThrow(err);
    });

    it("无 user → 抛 401", () => {
      expect(() => makeGuard(false).handleRequest(null, null)).toThrow(
        UnauthorizedException,
      );
    });

    it("有 user → 返回 user", () => {
      const user = { id: 1, role: "USER" };
      expect(makeGuard(false).handleRequest(null, user)).toBe(user);
    });
  });
});

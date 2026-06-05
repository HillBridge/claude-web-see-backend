import { ForbiddenException, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

function ctx(user: any): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

function makeGuard(requiredRoles: string[] | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe("RolesGuard", () => {
  it("路由未声明角色要求 → 放行", () => {
    expect(makeGuard(undefined).canActivate(ctx({ role: "USER" }))).toBe(true);
    expect(makeGuard([]).canActivate(ctx({ role: "USER" }))).toBe(true);
  });

  it("角色匹配 → 放行", () => {
    expect(makeGuard(["ADMIN"]).canActivate(ctx({ role: "ADMIN" }))).toBe(true);
  });

  it("角色不匹配 → 403", () => {
    expect(() =>
      makeGuard(["ADMIN"]).canActivate(ctx({ role: "USER" })),
    ).toThrow(ForbiddenException);
  });

  it("user 缺失 → 403", () => {
    expect(() => makeGuard(["ADMIN"]).canActivate(ctx(undefined))).toThrow(
      ForbiddenException,
    );
  });
});

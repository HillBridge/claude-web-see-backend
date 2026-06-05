import {
  UnauthorizedException,
  ForbiddenException,
  ExecutionContext,
} from "@nestjs/common";
import { ApiKeyAuthGuard } from "./apikey-auth.guard";

/** 构造仅含 body/headers 的假 ExecutionContext */
function ctx(req: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

function makeGuard(findByApikey: jest.Mock) {
  return new ApiKeyAuthGuard({ findByApikey } as any);
}

describe("ApiKeyAuthGuard", () => {
  it("缺少 apikey → 401", async () => {
    const guard = makeGuard(jest.fn());
    await expect(
      guard.canActivate(ctx({ body: {}, headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("无效 apikey(查不到项目)→ 401", async () => {
    const guard = makeGuard(jest.fn().mockResolvedValue(null));
    await expect(
      guard.canActivate(ctx({ body: { apikey: "bad" }, headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("项目无域名白名单 → 放行并挂载 req.project", async () => {
    const project = { id: 1, allowedOrigins: [] };
    const guard = makeGuard(jest.fn().mockResolvedValue(project));
    const req: any = { body: { apikey: "ok" }, headers: {} };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.project).toBe(project);
  });

  it("Origin 命中白名单(host 精确匹配)→ 放行", async () => {
    const guard = makeGuard(
      jest.fn().mockResolvedValue({
        id: 1,
        allowedOrigins: ["https://example.com"],
      }),
    );
    const req = {
      body: { apikey: "ok" },
      headers: { origin: "https://example.com" },
    };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
  });

  it("前缀绕过被拦截:白名单 example.com 不放行 example.com.evil.com → 403", async () => {
    const guard = makeGuard(
      jest.fn().mockResolvedValue({
        id: 1,
        allowedOrigins: ["https://example.com"],
      }),
    );
    const req = {
      body: { apikey: "ok" },
      headers: { origin: "https://example.com.evil.com" },
    };
    await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("Origin 缺失而有白名单 → 403", async () => {
    const guard = makeGuard(
      jest.fn().mockResolvedValue({
        id: 1,
        allowedOrigins: ["https://example.com"],
      }),
    );
    await expect(
      guard.canActivate(ctx({ body: { apikey: "ok" }, headers: {} })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("回退使用 Referer 做匹配", async () => {
    const guard = makeGuard(
      jest.fn().mockResolvedValue({
        id: 1,
        allowedOrigins: ["https://app.example.com"],
      }),
    );
    const req = {
      body: { apikey: "ok" },
      headers: { referer: "https://app.example.com/page?x=1" },
    };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
  });
});

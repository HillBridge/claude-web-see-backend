import { ProjectsService } from "./projects.service";

/**
 * ProjectsService.findByApikey 单元测试 —— 重点验证 allowedOrigins 的反序列化兜底:
 * DB 里存的是 JSON 字符串,坏数据不应让上报鉴权(ApiKeyAuthGuard 依赖它)整体崩溃。
 */
function makeService(findUnique: jest.Mock) {
  const prisma = { project: { findUnique } } as any;
  return new ProjectsService(prisma);
}

describe("ProjectsService.findByApikey", () => {
  it("allowedOrigins JSON 字符串 → 还原为数组", async () => {
    const svc = makeService(
      jest.fn().mockResolvedValue({
        id: 1,
        apikey: "k",
        allowedOrigins: '["https://a.com","https://b.com"]',
      }),
    );
    const p = await svc.findByApikey("k");
    expect(p.allowedOrigins).toEqual(["https://a.com", "https://b.com"]);
  });

  it("allowedOrigins 为坏 JSON → 兜底为空数组(不抛错)", async () => {
    const svc = makeService(
      jest.fn().mockResolvedValue({
        id: 1,
        apikey: "k",
        allowedOrigins: "not-json{",
      }),
    );
    const p = await svc.findByApikey("k");
    expect(p.allowedOrigins).toEqual([]);
  });

  it("allowedOrigins 为 null → 空数组", async () => {
    const svc = makeService(
      jest.fn().mockResolvedValue({ id: 1, apikey: "k", allowedOrigins: null }),
    );
    const p = await svc.findByApikey("k");
    expect(p.allowedOrigins).toEqual([]);
  });

  it("项目不存在 → 返回 null", async () => {
    const svc = makeService(jest.fn().mockResolvedValue(null));
    expect(await svc.findByApikey("nope")).toBeNull();
  });
});

import { ForbiddenException } from "@nestjs/common";
import {
  resolveTenantApikeyFilter,
  assertApikeyAccess,
  TenantUser,
} from "./tenant-scope";

/**
 * 最小化的 PrismaService 桩:只实现 tenant-scope 用到的 project 查询方法。
 * 不连真实 DB —— 纯逻辑单元测试。
 */
function makePrisma(overrides: any = {}) {
  return {
    project: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      ...overrides.project,
    },
  } as any;
}

const ADMIN: TenantUser = { id: 1, role: "ADMIN" };
const USER: TenantUser = { id: 42, role: "USER" };

describe("resolveTenantApikeyFilter", () => {
  describe("ADMIN", () => {
    it("无任何过滤参数 → 返回空对象(不限制)", async () => {
      const prisma = makePrisma();
      await expect(resolveTenantApikeyFilter(prisma, ADMIN)).resolves.toEqual(
        {},
      );
      expect(prisma.project.findMany).not.toHaveBeenCalled();
    });

    it("显式 apikey → 精确过滤", async () => {
      const prisma = makePrisma();
      await expect(
        resolveTenantApikeyFilter(prisma, ADMIN, { apikey: "k1" }),
      ).resolves.toEqual({ apikey: "k1" });
    });

    it("projectId 即使不属于自己也放行(ADMIN 不校验归属)", async () => {
      const prisma = makePrisma({
        project: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ apikey: "kX", ownerId: 999 }),
        },
      });
      await expect(
        resolveTenantApikeyFilter(prisma, ADMIN, { projectId: 7 }),
      ).resolves.toEqual({ apikey: "kX" });
    });
  });

  describe("普通用户", () => {
    it("无过滤参数 → 限定为自己拥有的全部 apikey", async () => {
      const prisma = makePrisma({
        project: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ apikey: "a" }, { apikey: "b" }]),
        },
      });
      await expect(resolveTenantApikeyFilter(prisma, USER)).resolves.toEqual({
        apikey: { in: ["a", "b"] },
      });
    });

    it("无任何项目 → 空集过滤(结果为空而非报错)", async () => {
      const prisma = makePrisma({
        project: { findMany: jest.fn().mockResolvedValue([]) },
      });
      await expect(resolveTenantApikeyFilter(prisma, USER)).resolves.toEqual({
        apikey: { in: [] },
      });
    });

    it("请求自己拥有的 apikey → 精确过滤", async () => {
      const prisma = makePrisma({
        project: {
          findMany: jest.fn().mockResolvedValue([{ apikey: "mine" }]),
        },
      });
      await expect(
        resolveTenantApikeyFilter(prisma, USER, { apikey: "mine" }),
      ).resolves.toEqual({ apikey: "mine" });
    });

    it("请求他人的 apikey → 抛 403(越权防护)", async () => {
      const prisma = makePrisma({
        project: {
          findMany: jest.fn().mockResolvedValue([{ apikey: "mine" }]),
        },
      });
      await expect(
        resolveTenantApikeyFilter(prisma, USER, { apikey: "foreign" }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("projectId 不存在 → 空集过滤(不报错)", async () => {
      const prisma = makePrisma({
        project: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        resolveTenantApikeyFilter(prisma, USER, { projectId: 123 }),
      ).resolves.toEqual({ apikey: { in: [] } });
    });

    it("projectId 属于他人 → 抛 403", async () => {
      const prisma = makePrisma({
        project: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ apikey: "kX", ownerId: 999 }),
        },
      });
      await expect(
        resolveTenantApikeyFilter(prisma, USER, { projectId: 7 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("projectId 属于自己 → 解析为该项目 apikey 精确过滤", async () => {
      const prisma = makePrisma({
        project: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ apikey: "kOwn", ownerId: USER.id }),
          findMany: jest.fn().mockResolvedValue([{ apikey: "kOwn" }]),
        },
      });
      await expect(
        resolveTenantApikeyFilter(prisma, USER, { projectId: 7 }),
      ).resolves.toEqual({ apikey: "kOwn" });
    });
  });
});

describe("assertApikeyAccess", () => {
  it("ADMIN 放行(不查库)", async () => {
    const prisma = makePrisma();
    await expect(
      assertApikeyAccess(prisma, ADMIN, "any"),
    ).resolves.toBeUndefined();
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });

  it("apikey 为空 → 抛 403", async () => {
    const prisma = makePrisma();
    await expect(assertApikeyAccess(prisma, USER, null)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("普通用户拥有该 apikey → 放行", async () => {
    const prisma = makePrisma({
      project: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    });
    await expect(
      assertApikeyAccess(prisma, USER, "mine"),
    ).resolves.toBeUndefined();
  });

  it("普通用户不拥有该 apikey → 抛 403", async () => {
    const prisma = makePrisma({
      project: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      assertApikeyAccess(prisma, USER, "foreign"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

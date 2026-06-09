import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { UsersService } from "./users.service";

/**
 * UsersService.update —— 重点覆盖改密的安全逻辑:
 * 本人改密必须校验旧密码(防 session 劫持后静默改密接管);Admin 重置他人不需旧密码。
 */
function makeService(user: any) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: user.id, ...data }),
      ),
    },
  };
  return { service: new UsersService(prisma as any), prisma };
}

describe("UsersService.update 改密", () => {
  const SELF_ID = 1;
  let oldHash: string;

  beforeAll(async () => {
    oldHash = await bcrypt.hash("oldpass123", 10);
  });

  function seedUser() {
    return { id: SELF_ID, username: "u", email: "u@e.com", role: "USER", password: oldHash };
  }

  it("本人改密未提供原密码 → 400", async () => {
    const { service } = makeService(seedUser());
    await expect(
      service.update(SELF_ID, { newPassword: "newpass123" } as any, {
        id: SELF_ID,
        role: "USER",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("本人改密原密码错误 → 401", async () => {
    const { service } = makeService(seedUser());
    await expect(
      service.update(
        SELF_ID,
        { oldPassword: "wrongpass", newPassword: "newpass123" } as any,
        { id: SELF_ID, role: "USER" },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("本人改密原密码正确 → 写入新哈希(且非明文)", async () => {
    const { service, prisma } = makeService(seedUser());
    await service.update(
      SELF_ID,
      { oldPassword: "oldpass123", newPassword: "newpass123" } as any,
      { id: SELF_ID, role: "USER" },
    );
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.password).toBeDefined();
    expect(data.password).not.toBe("newpass123");
    expect(await bcrypt.compare("newpass123", data.password)).toBe(true);
  });

  it("Admin 重置他人密码无需旧密码 → 直接写入新哈希", async () => {
    const target = { id: 2, username: "t", email: "t@e.com", role: "USER", password: oldHash };
    const { service, prisma } = makeService(target);
    await service.update(2, { newPassword: "resetpass123" } as any, {
      id: 99,
      role: "ADMIN",
    });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(await bcrypt.compare("resetpass123", data.password)).toBe(true);
  });

  it("普通用户改他人信息 → 403(改密逻辑之前就被拦)", async () => {
    const { service } = makeService(seedUser());
    await expect(
      service.update(2, { newPassword: "x" } as any, { id: SELF_ID, role: "USER" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

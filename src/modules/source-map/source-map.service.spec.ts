import { BadRequestException, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import { SourceMapService } from "./source-map.service";

jest.mock("fs");

/**
 * SourceMapService.readMapFile 单元测试 —— 重点:path.basename 防路径穿越;
 * 参数/缺失分支。mock fs / MinioService / PrismaService。
 */
function makeService(minioOverrides: any = {}) {
  const minio = {
    putObject: jest.fn(),
    getObject: jest.fn(),
    objectExists: jest.fn().mockResolvedValue(false),
    removeObject: jest.fn(),
    ...minioOverrides,
  };
  const prisma = { sourceMapFile: {} } as any;
  const config = { get: jest.fn().mockReturnValue("../dist") } as any;
  return {
    service: new SourceMapService(minio as any, prisma, config),
    minio,
  };
}

describe("SourceMapService.readMapFile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fileName 为空 → 400", async () => {
    const { service } = makeService();
    await expect(service.readMapFile("")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("路径穿越被 basename 剥离:../../etc/passwd 只取 passwd,查询的 MinIO key 不含穿越路径", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    const { service, minio } = makeService({
      objectExists: jest.fn().mockResolvedValue(true),
      getObject: jest.fn().mockResolvedValue(Buffer.from("map-content")),
    });
    await service.readMapFile("../../../etc/passwd", "apikey1");
    // key 应为 apikey1/passwd.map,而非含 ../ 的穿越路径
    expect(minio.objectExists).toHaveBeenCalledWith("apikey1/passwd.map");
    expect(minio.getObject).toHaveBeenCalledWith("apikey1/passwd.map");
  });

  it("本地 dist 存在 → 直接读本地文件(开发环境)", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from("local-map"));
    const { service, minio } = makeService();
    const out = await service.readMapFile("app.js");
    expect(out.toString()).toBe("local-map");
    expect(minio.objectExists).not.toHaveBeenCalled();
  });

  it("本地无、未传 apikey → 404", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    const { service } = makeService();
    await expect(service.readMapFile("app.js")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("本地无、MinIO 也不存在 → 404", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    const { service } = makeService({
      objectExists: jest.fn().mockResolvedValue(false),
    });
    await expect(
      service.readMapFile("app.js", "apikey1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

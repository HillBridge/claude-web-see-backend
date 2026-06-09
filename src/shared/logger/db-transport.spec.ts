import { DbLogTransport } from "./db-transport";

describe("DbLogTransport", () => {
  it("写入 systemLog.create,字段映射正确并回调", () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { systemLog: { create } } as any;
    const t = new DbLogTransport(prisma);
    const cb = jest.fn();
    t.log({ level: "warn", context: "Ctx", message: "hello" }, cb);
    expect(create).toHaveBeenCalledWith({
      data: { level: "warn", context: "Ctx", message: "hello" },
    });
    expect(cb).toHaveBeenCalled();
  });

  it("写库失败不抛、不阻塞(走 console 兜底,防递归)", async () => {
    const create = jest.fn().mockRejectedValue(new Error("db down"));
    const prisma = { systemLog: { create } } as any;
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const t = new DbLogTransport(prisma);
    const cb = jest.fn();
    expect(() => t.log({ level: "error", message: "x" }, cb)).not.toThrow();
    expect(cb).toHaveBeenCalled();
    // 等微任务,确保 .catch 执行
    await Promise.resolve();
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("非字符串 message → JSON 序列化;无 context → null", () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { systemLog: { create } } as any;
    const t = new DbLogTransport(prisma);
    t.log({ level: "warn", message: { a: 1 } }, jest.fn());
    expect(create).toHaveBeenCalledWith({
      data: { level: "warn", context: null, message: JSON.stringify({ a: 1 }) },
    });
  });
});

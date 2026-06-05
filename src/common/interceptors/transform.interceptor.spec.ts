import { of } from "rxjs";
import { lastValueFrom } from "rxjs";
import { TransformInterceptor } from "./transform.interceptor";

/**
 * TransformInterceptor 单元测试 —— 统一响应契约 { code, message, data, timestamp }。
 */
function run(returned: any) {
  const interceptor = new TransformInterceptor();
  const next = { handle: () => of(returned) } as any;
  return lastValueFrom(interceptor.intercept({} as any, next));
}

describe("TransformInterceptor", () => {
  it("包装业务数据为标准响应结构", async () => {
    const res = await run({ id: 1 });
    expect(res.code).toBe(200);
    expect(res.message).toBe("success");
    expect(res.data).toEqual({ id: 1 });
    expect(typeof res.timestamp).toBe("string");
  });

  it("undefined 返回值归一化为 data: null", async () => {
    const res = await run(undefined);
    expect(res.data).toBeNull();
  });

  it("保留 falsy 但有意义的值(0 / 空字符串 / false)", async () => {
    expect((await run(0)).data).toBe(0);
    expect((await run("")).data).toBe("");
    expect((await run(false)).data).toBe(false);
  });
});

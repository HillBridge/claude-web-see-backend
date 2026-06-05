import { normalizeMessage, buildFingerprint, truncate } from "./fingerprint";

describe("normalizeMessage", () => {
  it("空/null/undefined 归一化为空串", () => {
    expect(normalizeMessage(undefined)).toBe("");
    expect(normalizeMessage(null)).toBe("");
    expect(normalizeMessage("")).toBe("");
  });

  it("数字替换为 {n}", () => {
    expect(normalizeMessage("用户123不存在")).toBe("用户{n}不存在");
    expect(normalizeMessage("用户456不存在")).toBe("用户{n}不存在");
  });

  it("UUID 替换为 {uuid}", () => {
    expect(
      normalizeMessage("id=550e8400-e29b-41d4-a716-446655440000 失败"),
    ).toBe("id={uuid} 失败");
  });

  it("十六进制地址 0x.. 替换为 {hex}", () => {
    // 注:UUID 与 0x 先于纯数字替换,避免被 \d+ 提前吃掉
    expect(normalizeMessage("addr 0xAB12cd")).toBe("addr {hex}");
  });

  it("连续空白折叠为单个空格并 trim", () => {
    expect(normalizeMessage("  a    b\t\nc  ")).toBe("a b c");
  });

  it("同类不同参数归一化后一致", () => {
    expect(normalizeMessage("订单9999超时")).toBe(
      normalizeMessage("订单1超时"),
    );
  });
});

describe("buildFingerprint", () => {
  it("返回 40 位 sha1 十六进制", () => {
    const fp = buildFingerprint({ type: "error", message: "boom" });
    expect(fp).toMatch(/^[0-9a-f]{40}$/);
  });

  it("同类但参数不同的错误得到相同指纹", () => {
    const a = buildFingerprint({ type: "jsError", message: "用户123不存在" });
    const b = buildFingerprint({ type: "jsError", message: "用户789不存在" });
    expect(a).toBe(b);
  });

  it("type 不同 → 指纹不同", () => {
    const a = buildFingerprint({ type: "jsError", message: "x" });
    const b = buildFingerprint({ type: "resourceError", message: "x" });
    expect(a).not.toBe(b);
  });

  it("userId 不同 → 指纹不同", () => {
    const a = buildFingerprint({ type: "e", message: "x", userId: "u1" });
    const b = buildFingerprint({ type: "e", message: "x", userId: "u2" });
    expect(a).not.toBe(b);
  });

  it("message 缺省与空串等价", () => {
    expect(buildFingerprint({ type: "e" })).toBe(
      buildFingerprint({ type: "e", message: "" }),
    );
  });

  it("对同一输入稳定(纯函数)", () => {
    const input = { type: "e", message: "m", userId: "u" };
    expect(buildFingerprint(input)).toBe(buildFingerprint(input));
  });
});

describe("truncate", () => {
  it("null/undefined 透传为 null", () => {
    expect(truncate(null, 10)).toBeNull();
    expect(truncate(undefined, 10)).toBeNull();
  });

  it("短于上限原样返回", () => {
    expect(truncate("abc", 10)).toBe("abc");
  });

  it("等长不截断(边界)", () => {
    expect(truncate("abcde", 5)).toBe("abcde");
  });

  it("超长截断到 max", () => {
    expect(truncate("abcdef", 5)).toBe("abcde");
  });
});

import { recordScreenObjectKey, isValidRecordScreenId } from "./record-screen.util";

describe("recordScreenObjectKey", () => {
  it("按 record-screen/{apikey}/{recordScreenId} 拼接", () => {
    expect(recordScreenObjectKey("apikey-abc", "rs-123")).toBe(
      "record-screen/apikey-abc/rs-123",
    );
  });

  it("同一 (apikey, recordScreenId) 得到确定且一致的 key(幂等覆盖语义)", () => {
    const a = recordScreenObjectKey("k", "id");
    const b = recordScreenObjectKey("k", "id");
    expect(a).toBe(b);
  });

  it("不同租户(apikey)产生不同 key,避免跨租户覆盖", () => {
    expect(recordScreenObjectKey("k1", "id")).not.toBe(
      recordScreenObjectKey("k2", "id"),
    );
  });
});

describe("isValidRecordScreenId", () => {
  it("接受字母/数字/下划线/连字符", () => {
    expect(isValidRecordScreenId("rs-123")).toBe(true);
    expect(isValidRecordScreenId("abcDEF_0-9")).toBe(true);
    expect(isValidRecordScreenId("a".repeat(128))).toBe(true);
  });

  it("拒绝含路径/特殊字符的 id(防异常对象 key)", () => {
    expect(isValidRecordScreenId("../other/x")).toBe(false);
    expect(isValidRecordScreenId("a/b")).toBe(false);
    expect(isValidRecordScreenId("a b")).toBe(false);
    expect(isValidRecordScreenId("a.b")).toBe(false);
  });

  it("拒绝空串、超长、非字符串", () => {
    expect(isValidRecordScreenId("")).toBe(false);
    expect(isValidRecordScreenId("a".repeat(129))).toBe(false);
    expect(isValidRecordScreenId(undefined)).toBe(false);
    expect(isValidRecordScreenId(123 as any)).toBe(false);
  });
});

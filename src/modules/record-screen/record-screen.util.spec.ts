import { recordScreenObjectKey } from "./record-screen.util";

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

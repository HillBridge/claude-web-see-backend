import * as crypto from "crypto";
import {
  parseEncKey,
  encryptEvents,
  decryptEvents,
} from "./record-screen-crypto";

// 固定 32 字节密钥(hex 64 字符)
const KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const KEY = Buffer.from(KEY_HEX, "hex");
const MAGIC = Buffer.from("WSE1", "ascii");

describe("parseEncKey", () => {
  it("未配置(undefined/空)返回 null", () => {
    expect(parseEncKey(undefined)).toBeNull();
    expect(parseEncKey("")).toBeNull();
  });

  it("hex(64 字符)解析为 32 字节", () => {
    const key = parseEncKey(KEY_HEX);
    expect(key).not.toBeNull();
    expect(key.length).toBe(32);
    expect(key.equals(KEY)).toBe(true);
  });

  it("base64(44 字符)解析为 32 字节", () => {
    const b64 = KEY.toString("base64");
    const key = parseEncKey(b64);
    expect(key.length).toBe(32);
    expect(key.equals(KEY)).toBe(true);
  });

  it("长度非法(非 32 字节)抛错", () => {
    expect(() => parseEncKey(Buffer.alloc(16).toString("base64"))).toThrow();
    expect(() => parseEncKey("abcd")).toThrow();
  });
});

describe("encryptEvents / decryptEvents 往返", () => {
  it("加密后解密还原原文", () => {
    const plain = Buffer.from("rrweb-events-blob-含PII", "utf-8");
    const enc = encryptEvents(plain, KEY);
    expect(decryptEvents(enc, KEY)).toBe(plain.toString("utf-8"));
  });

  it("密文带 WSE1 版本头", () => {
    const enc = encryptEvents(Buffer.from("x"), KEY);
    expect(enc.subarray(0, 4).equals(MAGIC)).toBe(true);
  });

  it("每次加密 IV 随机 → 密文不同,但都能解出同一明文", () => {
    const plain = Buffer.from("same-content");
    const a = encryptEvents(plain, KEY);
    const b = encryptEvents(plain, KEY);
    expect(a.equals(b)).toBe(false);
    expect(decryptEvents(a, KEY)).toBe("same-content");
    expect(decryptEvents(b, KEY)).toBe("same-content");
  });
});

describe("密钥可选 / 向后兼容", () => {
  it("key 为 null 时加密直接返回明文(不加密)", () => {
    const plain = Buffer.from("plaintext");
    const out = encryptEvents(plain, null);
    expect(out.equals(plain)).toBe(true);
    // 无头 → 视为历史明文,直读
    expect(decryptEvents(out, null)).toBe("plaintext");
  });

  it("历史明文对象(无 MAGIC 头)按 utf-8 直读(零迁移兼容)", () => {
    const legacy = Buffer.from("legacy-plain-events", "utf-8");
    expect(decryptEvents(legacy, KEY)).toBe("legacy-plain-events");
    expect(decryptEvents(legacy, null)).toBe("legacy-plain-events");
  });
});

describe("安全性", () => {
  it("加密对象但未配置 key 解密 → 抛明确错误(不静默返回乱码)", () => {
    const enc = encryptEvents(Buffer.from("secret"), KEY);
    expect(() => decryptEvents(enc, null)).toThrow();
  });

  it("篡改 ciphertext → GCM 校验失败抛错", () => {
    const enc = encryptEvents(Buffer.from("secret"), KEY);
    const tampered = Buffer.from(enc);
    tampered[tampered.length - 1] ^= 0xff; // 翻转最后一字节
    expect(() => decryptEvents(tampered, KEY)).toThrow();
  });

  it("篡改 auth tag → 解密抛错", () => {
    const enc = encryptEvents(Buffer.from("secret"), KEY);
    const tampered = Buffer.from(enc);
    tampered[4 + 12] ^= 0xff; // MAGIC(4)+IV(12) 之后的第一个 tag 字节
    expect(() => decryptEvents(tampered, KEY)).toThrow();
  });

  it("错误密钥无法解密", () => {
    const enc = encryptEvents(Buffer.from("secret"), KEY);
    const wrong = crypto.createHash("sha256").update("wrong").digest(); // 32 字节但不同
    expect(() => decryptEvents(enc, wrong)).toThrow();
  });
});

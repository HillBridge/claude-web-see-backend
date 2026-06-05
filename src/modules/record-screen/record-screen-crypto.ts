import * as crypto from "crypto";

/**
 * 录屏 events 静态加密(AES-256-GCM)。events 是 rrweb 录屏的不透明 blob,可能含 PII,
 * 落 MinIO 前加密、读取时解密,作为对象存储层的纵深防御(防 bucket/备份泄露)。
 *
 * 加密对象字节布局: [MAGIC(4) | IV(12) | TAG(16) | CIPHERTEXT]
 *   MAGIC = "WSE1" 版本头,用于读取时区分「新密文」与「历史明文对象」——
 *   不以该头开头的旧对象按明文直接返回,实现零迁移的向后兼容。
 *
 * 密钥可选: parseEncKey 返回 null 表示未配置加密,此时写入保持明文(沿用旧行为)。
 */
const MAGIC = Buffer.from("WSE1", "ascii");
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * 解析环境变量里的 32 字节密钥,支持 base64 / hex;未配置返回 null;长度非法抛错(尽早暴露配置错误)。
 */
export function parseEncKey(raw?: string): Buffer | null {
  if (!raw) return null;
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error(
      `RECORD_SCREEN_ENC_KEY 必须为 32 字节(AES-256),当前解析得 ${key.length} 字节;请用 base64(44字符) 或 hex(64字符)`,
    );
  }
  return key;
}

/** 加密 events:输出 [MAGIC|IV|TAG|CIPHERTEXT]。key 为 null 时直接返回明文(不加密)。 */
export function encryptEvents(plain: Buffer, key: Buffer | null): Buffer {
  if (!key) return plain;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

/** 是否为本方案加密对象(带 MAGIC 版本头)。 */
function isEncrypted(obj: Buffer): boolean {
  return (
    obj.length >= MAGIC.length + IV_LEN + TAG_LEN &&
    obj.subarray(0, MAGIC.length).equals(MAGIC)
  );
}

/**
 * 读取时还原 events 字符串:
 *   - 带 MAGIC 头 → 解密(无密钥则抛错,避免静默返回乱码);
 *   - 不带头 → 历史明文对象,直接按 utf-8 返回。
 */
export function decryptEvents(obj: Buffer, key: Buffer | null): string {
  if (!isEncrypted(obj)) {
    // 历史明文对象(加密启用前写入),向后兼容直接返回
    return obj.toString("utf-8");
  }
  if (!key) {
    throw new Error("录屏对象已加密,但未配置 RECORD_SCREEN_ENC_KEY,无法解密");
  }
  const iv = obj.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = obj.subarray(
    MAGIC.length + IV_LEN,
    MAGIC.length + IV_LEN + TAG_LEN,
  );
  const ciphertext = obj.subarray(MAGIC.length + IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf-8");
}

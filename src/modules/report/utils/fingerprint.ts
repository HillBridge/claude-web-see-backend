import { createHash } from 'crypto';

/**
 * 归一化错误 message: 把动态内容(数字、UUID、十六进制地址、引号内容)
 * 替换为占位符, 让「同类但参数不同」的错误算出同一个 fingerprint。
 * 例如: "用户123不存在" 与 "用户456不存在" -> "用户{n}不存在"
 */
export function normalizeMessage(message?: string | null): string {
  if (!message) return '';
  return message
    .replace(
      /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
      '{uuid}',
    )
    .replace(/0x[0-9a-fA-F]+/g, '{hex}')
    .replace(/\d+/g, '{n}')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FingerprintInput {
  type: string;
  message?: string | null;
  fileName?: string | null;
  lineNo?: number | null;
  colNo?: number | null;
}

/**
 * 根据错误关键特征计算 sha1 指纹, 同 apikey 下同指纹的错误归为一组。
 */
export function buildFingerprint(input: FingerprintInput): string {
  const raw = [
    input.type ?? '',
    normalizeMessage(input.message),
    input.fileName ?? '',
    input.lineNo ?? '',
    input.colNo ?? '',
  ].join('|');
  return createHash('sha1').update(raw).digest('hex');
}

/**
 * 把字符串截断到列宽以内, 避免超长值导致 P2000 (value too long) 丢失整条上报。
 */
export function truncate(
  val: string | null | undefined,
  max: number,
): string | null {
  if (val == null) return null;
  return val.length > max ? val.slice(0, max) : val;
}

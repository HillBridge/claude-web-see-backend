/**
 * 录屏 events 在 MinIO 的对象 key 方案,集中一处定义,供写入(report)、读取(record-screen)、
 * 清理(cleanup)共用,避免各处拼接不一致。
 *
 * 采用 (apikey, recordScreenId) 确定性命名:同一 recordScreenId 重复投递覆盖同一对象,
 * 与 DB 的 @@unique([apikey, recordScreenId]) upsert 覆盖语义一致(幂等)。
 */
export function recordScreenObjectKey(
  apikey: string,
  recordScreenId: string,
): string {
  return `record-screen/${apikey}/${recordScreenId}`;
}

/**
 * recordScreenId 由 SDK 上报、且会拼进 MinIO 对象 key,限定字符集(字母数字 + _- ,1~128 位)
 * 作为纵深防御,避免异常字符进入对象 key。
 * (跨租户覆盖已由 DB 的 @@unique([apikey, recordScreenId]) upsert 在租户内定位阻断,此处为额外加固。)
 */
const RECORD_SCREEN_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
export function isValidRecordScreenId(id: unknown): boolean {
  return typeof id === 'string' && RECORD_SCREEN_ID_RE.test(id);
}

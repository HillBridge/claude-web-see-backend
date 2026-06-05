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

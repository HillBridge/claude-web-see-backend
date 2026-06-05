/**
 * 一次性回填脚本: 把存量 record_screens.events(LongText) 迁移到 MinIO。
 *
 *   只处理 events_key IS NULL 且 events 非空的历史行,可重复执行(幂等)。
 *   对象 key 与运行时一致: record-screen/{apikey}/{recordScreenId}。
 *   写对象成功后回填 events_key / events_size。
 *
 * 用原生 SQL 读写 events 列(不经 Prisma 类型),以便在 events 列已从 schema 移除、
 * 但物理列尚存的过渡期(迁移A之后、迁移B之前)仍可编译并运行。
 *
 * 多环境部署顺序(关键!): 迁移A → 本回填 → 迁移B。
 *   prisma migrate deploy 会一次性应用所有未决迁移,若库中已有存量录屏数据,
 *   切勿 A、B 一起 deploy,须在 A 之后、B 之前插入本回填,否则 B 删列将丢历史录屏。
 *   全新无数据环境无需回填,可直接 deploy。
 *
 * 运行: npx ts-node scripts/backfill-record-screen-minio.ts
 *   依赖与服务端相同的 MINIO_* 环境变量(由 .env 提供)。
 */
import { PrismaClient } from "@prisma/client";
import * as Minio from "minio";
import { recordScreenObjectKey } from "../src/modules/record-screen/record-screen.util";

const prisma = new PrismaClient();
const BATCH = 200;

const minio = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: parseInt(process.env.MINIO_PORT, 10) || 9000,
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});
const BUCKET = process.env.MINIO_BUCKET || "sourcemaps";

interface Row {
  id: number;
  apikey: string | null;
  recordScreenId: string;
  events: string | null;
}

async function main() {
  const exists = await minio.bucketExists(BUCKET);
  if (!exists) {
    console.error(
      `MinIO bucket "${BUCKET}" 不存在,请先启动 MinIO 并确保服务端已初始化`,
    );
    process.exit(1);
  }

  let cursor = 0;
  let migrated = 0;
  let skipped = 0;

  for (;;) {
    // 原生 SQL: 只取尚未迁移(events_key 空)且 events 非空、apikey 非空的历史行
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT id, apikey, record_screen_id AS recordScreenId, events
      FROM record_screens
      WHERE events_key IS NULL AND events IS NOT NULL AND apikey IS NOT NULL AND id > ${cursor}
      ORDER BY id ASC
      LIMIT ${BATCH}`;
    if (rows.length === 0) break;

    for (const r of rows) {
      cursor = Number(r.id);
      if (!r.apikey || !r.events) {
        skipped++;
        continue;
      }
      const key = recordScreenObjectKey(r.apikey, r.recordScreenId);
      const buf = Buffer.from(r.events, "utf-8");
      await minio.putObject(BUCKET, key, buf, buf.length, {
        "Content-Type": "text/plain",
      });
      await prisma.$executeRaw`
        UPDATE record_screens SET events_key = ${key}, events_size = ${buf.length} WHERE id = ${r.id}`;
      migrated++;
    }
    console.log(
      `已处理至 id=${cursor},累计迁移 ${migrated} 条,跳过 ${skipped} 条`,
    );
  }

  console.log(
    `完成:迁移 ${migrated} 条录屏 events 到 MinIO,跳过 ${skipped} 条`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

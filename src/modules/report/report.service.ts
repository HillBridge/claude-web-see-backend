import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@shared/prisma/prisma.service";
import { MinioService } from "@/shared/minio/minio.service";
import { ReportDataDto } from "./dto/report-data.dto";
import { buildFingerprint, truncate } from "./utils/fingerprint";
import { recordScreenObjectKey } from "@/modules/record-screen/record-screen.util";
import {
  parseEncKey,
  encryptEvents,
} from "@/modules/record-screen/record-screen-crypto";

@Injectable()
export class ReportService {
  // 录屏加密密钥(可选):配置则新写入加密,未配置则明文。启动时解析一次,非法长度即暴露。
  private readonly recordScreenEncKey: Buffer | null;

  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
    private config: ConfigService,
  ) {
    this.recordScreenEncKey = parseEncKey(
      this.config.get<string>("recordScreen.encKey"),
    );
  }

  async handleReport(data: ReportDataDto): Promise<void> {
    if (!data || !data.type) return;

    switch (data.type) {
      case "performance":
        await this.savePerformance(data);
        break;
      case "recordScreen":
        await this.saveRecordScreen(data);
        break;
      case "whiteScreen":
        await this.saveWhiteScreen(data);
        break;
      default:
        // error | unhandledrejection | resourceError | httpError 等都归入错误表
        await this.saveError(data);
        break;
    }
  }

  private async saveError(data: ReportDataDto) {
    const apikey = data.apikey || "unknown";
    const fileName = truncate(
      (data as any).fileName ?? (data as any).filename ?? null,
      500,
    );
    const pageUrl = truncate(data.pageUrl, 500);
    const lineNo = (data as any).lineNo ?? (data as any).line ?? null;
    const colNo = (data as any).colNo ?? (data as any).column ?? null;

    // 1) 先按指纹归并到错误分组(去重 + 累计次数)
    const fingerprint = buildFingerprint({
      type: data.type,
      message: data.message,
      userId: data.userId,
    });

    const group = await this.prisma.errorGroup.upsert({
      where: { apikey_fingerprint: { apikey, fingerprint } },
      create: {
        apikey,
        fingerprint,
        type: data.type,
        message: data.message ?? null,
        fileName,
        lineNo,
        colNo,
      },
      update: {
        count: { increment: 1 },
        lastSeen: new Date(),
      },
    });

    // 2) 仍保留每次发生的明细, 挂到对应分组下
    const errorReport = await this.prisma.errorReport.create({
      data: {
        type: data.type,
        message: data.message,
        pageUrl,
        time: data.time ? BigInt(data.time) : null,
        apikey,
        monitorUserId: data.userId,
        sdkVersion: data.sdkVersion,
        deviceInfo: data.deviceInfo ?? undefined,
        recordScreenId: data.recordScreenId,
        fileName,
        lineNo,
        colNo,
        errorGroupId: group.id,
      },
    });

    // 保存用户行为轨迹
    if (Array.isArray(data.breadcrumb) && data.breadcrumb.length > 0) {
      await this.prisma.breadcrumb.createMany({
        data: data.breadcrumb.map((b) => ({
          errorReportId: errorReport.id,
          category: b.category,
          data: b.data ?? undefined,
          status: b.status,
          time: b.time ? BigInt(b.time) : null,
          message: b.message,
        })),
      });
    }
  }

  private async savePerformance(data: ReportDataDto) {
    await this.prisma.performanceReport.create({
      data: {
        pageUrl: data.pageUrl,
        time: data.time ? BigInt(data.time) : null,
        apikey: data.apikey || "unknown",
        monitorUserId: data.userId,
        sdkVersion: data.sdkVersion,
        deviceInfo: data.deviceInfo ?? undefined,
        fp: data.fp ?? null,
        fcp: data.fcp ?? null,
        lcp: data.lcp ?? null,
        fid: data.fid ?? null,
        cls: data.cls ?? null,
        ttfb: data.ttfb ?? null,
        dns: data.dns ?? null,
        tcp: data.tcp ?? null,
        ssl: data.ssl ?? null,
        loadTime: data.loadTime ?? null,
      },
    });
  }

  private async saveRecordScreen(data: ReportDataDto) {
    if (!data.recordScreenId || !data.events) return;
    // apikey 已由 ApiKeyAuthGuard 校验;无 apikey 不落库,避免落到 NULL 分区绕过复合唯一去重
    if (!data.apikey) return;

    // events 大字段落 MinIO,DB 只存对象 key + 字节数。key 按 (apikey, recordScreenId) 确定性命名,
    // 重复投递覆盖同一对象,与下方 upsert 的覆盖语义一致(幂等)。
    // 配置了密钥则静态加密后再落库(events 含 PII,作对象存储层纵深防御)。
    const key = recordScreenObjectKey(data.apikey, data.recordScreenId);
    const plain = Buffer.from(data.events, "utf-8");
    const blob = encryptEvents(plain, this.recordScreenEncKey);
    await this.minio.putObject(key, blob, "application/octet-stream");

    // eventsSize 记录原始(明文)字节数,作为前端展示的录屏体积,不受加密膨胀影响
    const eventsSize = plain.length;

    // upsert: 按 (apikey, recordScreenId) 复合唯一去重。仅在“当前 apikey 名下”定位记录,
    // 故攻击者用自己 apikey + 他人 recordScreenId 时不会命中他人行,只会新建自己名下的行。
    await this.prisma.recordScreen.upsert({
      where: {
        apikey_recordScreenId: {
          apikey: data.apikey,
          recordScreenId: data.recordScreenId,
        },
      },
      update: {
        eventsKey: key,
        eventsSize,
        time: data.time ? BigInt(data.time) : null,
      },
      create: {
        recordScreenId: data.recordScreenId,
        eventsKey: key,
        eventsSize,
        apikey: data.apikey,
        monitorUserId: data.userId,
        pageUrl: data.pageUrl,
        time: data.time ? BigInt(data.time) : null,
      },
    });
  }

  private async saveWhiteScreen(data: ReportDataDto) {
    await this.prisma.whiteScreen.create({
      data: {
        pageUrl: data.pageUrl,
        time: data.time ? BigInt(data.time) : null,
        apikey: data.apikey,
        monitorUserId: data.userId,
        sdkVersion: data.sdkVersion,
        deviceInfo: data.deviceInfo ?? undefined,
      },
    });
  }
}

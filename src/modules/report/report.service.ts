import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@shared/prisma/prisma.service";
import { MinioService } from "@/shared/minio/minio.service";
import { ReportDataDto } from "./dto/report-data.dto";
import { buildFingerprint, truncate } from "./utils/fingerprint";

// 网络请求(httpError)的请求/响应体落库上限。超出即截断,防超长 Text 撑大库(同 truncate 防 P2000 思路)。
const MAX_HTTP_BODY_LEN = 20_000;

// 只落库的标量 Web Vitals(参与 p75/good 分析);longTask/resourceList/memory 等非标量事件丢弃。
const SCALAR_PERF_METRICS = new Set(["FCP", "LCP", "FID", "CLS", "TTFB", "FSP"]);

// 请求参数/响应体可能是对象或字符串,统一字符串化后落 Text 列;null/undefined 直通。
function stringifyHttpBody(v: any): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}
import { recordScreenObjectKey, isValidRecordScreenId } from "@/modules/record-screen/record-screen.util";
import {
  parseEncKey,
  encryptEvents,
} from "@/modules/record-screen/record-screen-crypto";

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);
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

    // 网络请求错误的请求/响应信息(@websee/core httpTransform 上报结构):
    //   顶层: url / elapsedTime / status(注意是 'ok'|'error' 枚举,非 HTTP 码)
    //   requestData: { httpType, method, data(请求参数/body) }
    //   response:    { Status(HTTP 状态码,大写 S), data(响应体) }
    // 非网络错误上报这些路径为 undefined → 全部落 null,无副作用。
    const req = (data as any).requestData ?? {};
    const res = (data as any).response ?? {};
    // HTTP 状态码在 response.Status(大写)且为数字; 顶层 status 是 'ok'/'error' 枚举,
    // 不能落进 Int 列(否则 Prisma 抛错使整条上报插入失败)。仅接受数字,其余记 null。
    const rawStatus = res.Status ?? res.status;
    const responseStatus = typeof rawStatus === "number" ? rawStatus : null;

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
        // 网络请求错误专用字段(仅网络错误落值,其它类型为 null)
        requestUrl: truncate((data as any).url ?? null, 500),
        requestMethod: truncate(req.method ?? null, 10),
        httpType: truncate(req.httpType ?? null, 10),
        requestData: truncate(stringifyHttpBody(req.data), MAX_HTTP_BODY_LEN),
        responseStatus,
        responseData: truncate(stringifyHttpBody(res.data), MAX_HTTP_BODY_LEN),
        elapsedTime:
          typeof (data as any).elapsedTime === "number"
            ? (data as any).elapsedTime
            : null,
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
    // SDK(@websee/performance) 按"一指标一条"上报: 标量 Web Vitals {name,value,rating},
    // 外加 longTask/resourceList/memory 等非标量事件。只保留标量指标(参与 p75/good 分析),
    // 非标量事件不落库(避免 71% 噪声行膨胀表与样本计数)。
    const name = typeof data.name === "string" ? data.name : null;
    if (!name || !SCALAR_PERF_METRICS.has(name)) return; // 无 name 或非标量事件 → 静默丢弃
    await this.prisma.performanceReport.create({
      data: {
        apikey: data.apikey || "unknown",
        name,
        value: typeof data.value === "number" ? data.value : null,
        rating: data.rating ?? null,
        pageUrl: data.pageUrl,
      },
    });
  }

  private async saveRecordScreen(data: ReportDataDto) {
    if (!data.recordScreenId || !data.events) {
      this.logger.warn(
        `录屏丢弃: 缺少 ${!data.recordScreenId ? "recordScreenId" : "events"} (recordScreenId=${data.recordScreenId})`,
      );
      return;
    }
    // apikey 已由 ApiKeyAuthGuard 校验;无 apikey 不落库,避免落到 NULL 分区绕过复合唯一去重
    if (!data.apikey) {
      this.logger.warn(`录屏丢弃: 缺少 apikey (recordScreenId=${data.recordScreenId})`);
      return;
    }
    // recordScreenId 会拼进 MinIO 对象 key,格式非法则静默丢弃(纵深防御,见 record-screen.util)
    if (!isValidRecordScreenId(data.recordScreenId)) {
      this.logger.warn(`录屏丢弃: recordScreenId 格式非法 (${data.recordScreenId})`);
      return;
    }

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

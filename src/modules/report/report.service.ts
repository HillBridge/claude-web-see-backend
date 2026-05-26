import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { ReportDataDto } from './dto/report-data.dto';

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

  async handleReport(data: ReportDataDto): Promise<void> {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'performance':
        await this.savePerformance(data);
        break;
      case 'recordScreen':
        await this.saveRecordScreen(data);
        break;
      case 'whiteScreen':
        await this.saveWhiteScreen(data);
        break;
      default:
        // error | unhandledrejection | resourceError | httpError 等都归入错误表
        await this.saveError(data);
        break;
    }
  }

  private async saveError(data: ReportDataDto) {
    const errorReport = await this.prisma.errorReport.create({
      data: {
        type: data.type,
        message: data.message,
        pageUrl: data.pageUrl,
        time: data.time ? BigInt(data.time) : null,
        apikey: data.apikey || 'unknown',
        monitorUserId: data.userId,
        sdkVersion: data.sdkVersion,
        deviceInfo: data.deviceInfo ?? undefined,
        recordScreenId: data.recordScreenId,
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
        apikey: data.apikey || 'unknown',
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

    // upsert: 同一 recordScreenId 只保存一条
    await this.prisma.recordScreen.upsert({
      where: { recordScreenId: data.recordScreenId },
      update: {
        events: data.events,
        time: data.time ? BigInt(data.time) : null,
      },
      create: {
        recordScreenId: data.recordScreenId,
        events: data.events,
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

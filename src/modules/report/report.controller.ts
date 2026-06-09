import { Controller, Post, Req, Body, HttpCode, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { ReportService } from './report.service';
import { ReportDataDto } from './dto/report-data.dto';
import { Public } from '../../common/decorators/public.decorator';
import { ApiKeyAuthGuard } from '../../common/guards/apikey-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

// 上报字段体积上限(防滥用 / DoS)。SDK 字段名不固定(filename/line 等别名),
// 故不套严格 DTO,改为这里做必填 + 体积兜底校验。
const MAX_EVENTS_LEN = 8 * 1024 * 1024; // 录屏 events 字符串 ~8MB
const MAX_MESSAGE_LEN = 10_000;
const MAX_BREADCRUMB_LEN = 500;
const MAX_HTTP_BODY_LEN = 64 * 1024; // 网络请求(httpError)请求/响应体 ~64KB(内存放大兜底)

@ApiTags('数据上报')
@Controller()
export class ReportController {
  private readonly logger = new Logger(ReportController.name);
  constructor(private reportService: ReportService) {}

  @Public()
  @UseGuards(RateLimitGuard, ApiKeyAuthGuard)
  @ApiOperation({ summary: '数据上报 (SDK → 服务端)' })
  @Post('reportData')
  @HttpCode(200)
  async reportData(@Body() body: any, @Req() req: Request): Promise<any> {
    let data: ReportDataDto = body;

    if (!data || Object.keys(data).length === 0) {
      const raw = (req as any).rawBody;
      if (raw) {
        try {
          data = JSON.parse(raw.toString());
        } catch {
          return { code: 200, message: '上报成功' };
        }
      }
    }

    // ── 轻量校验 + 体积兜底(无效/超限静默丢弃,不写库,避免脏数据与内存放大)──
    const dropReason = this.rejectReason(data);
    if (dropReason) {
      // 录屏被丢弃是真实数据丢失(常见 events 超 8MB),用 warn 便于排查;其余脏数据用 debug 防噪音
      if (data?.type === 'recordScreen') {
        this.logger.warn(
          `录屏上报被丢弃: reason=${dropReason} apikey=${data?.apikey} recordScreenId=${data?.recordScreenId}`,
        );
      } else {
        this.logger.debug(`上报被丢弃: reason=${dropReason} type=${data?.type}`);
      }
      return { code: 200, message: '上报成功' };
    }

    try {
      await this.reportService.handleReport(data);
      return { code: 200, message: '上报成功' };
    } catch (err) {
      return { code: 500, message: '上报失败', error: err?.message };
    }
  }

  /** 返回丢弃原因(null = 可接受);任一必填缺失或体积超限即视为无效上报 */
  private rejectReason(data: any): string | null {
    if (!data || typeof data !== 'object') return 'empty';
    if (typeof data.type !== 'string' || !data.type) return 'missing-type';
    if (typeof data.apikey !== 'string' || !data.apikey) return 'missing-apikey';
    if (typeof data.events === 'string' && data.events.length > MAX_EVENTS_LEN)
      return `events-too-large(${data.events.length}>${MAX_EVENTS_LEN})`;
    if (typeof data.message === 'string' && data.message.length > MAX_MESSAGE_LEN)
      return 'message-too-large';
    if (Array.isArray(data.breadcrumb) && data.breadcrumb.length > MAX_BREADCRUMB_LEN)
      return 'breadcrumb-too-large';
    // 网络请求(httpError)请求参数 / 响应体兜底:字符串化后超限即丢弃(防内存放大)。
    if (this.httpBodyTooLarge(data.requestData?.data)) return 'requestData-too-large';
    if (this.httpBodyTooLarge(data.response?.data)) return 'response-too-large';
    return null;
  }

  /** httpError 请求/响应体字符串化后是否超限(对象/字符串统一估算) */
  private httpBodyTooLarge(body: any): boolean {
    if (body == null) return false;
    const len = typeof body === 'string' ? body.length : JSON.stringify(body).length;
    return len > MAX_HTTP_BODY_LEN;
  }
}

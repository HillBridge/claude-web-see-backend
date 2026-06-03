import { Controller, Post, Req, Body, HttpCode, UseGuards } from '@nestjs/common';
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

@ApiTags('数据上报')
@Controller()
export class ReportController {
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
    if (!this.isAcceptable(data)) {
      return { code: 200, message: '上报成功' };
    }

    try {
      await this.reportService.handleReport(data);
      return { code: 200, message: '上报成功' };
    } catch (err) {
      return { code: 500, message: '上报失败', error: err?.message };
    }
  }

  /** 必填字段与体积约束;任一不满足则视为无效上报 */
  private isAcceptable(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.type !== 'string' || !data.type) return false;
    if (typeof data.apikey !== 'string' || !data.apikey) return false;
    if (typeof data.events === 'string' && data.events.length > MAX_EVENTS_LEN) return false;
    if (typeof data.message === 'string' && data.message.length > MAX_MESSAGE_LEN) return false;
    if (Array.isArray(data.breadcrumb) && data.breadcrumb.length > MAX_BREADCRUMB_LEN) return false;
    return true;
  }
}

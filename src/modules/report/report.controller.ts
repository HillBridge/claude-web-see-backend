import { Controller, Post, Req, Body, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { ReportService } from './report.service';
import { ReportDataDto } from './dto/report-data.dto';
import { Public } from '../../common/decorators/public.decorator';
import { ApiKeyAuthGuard } from '../../common/guards/apikey-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

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

    try {
      await this.reportService.handleReport(data);
      return { code: 200, message: '上报成功' };
    } catch (err) {
      return { code: 500, message: '上报失败', error: err?.message };
    }
  }
}

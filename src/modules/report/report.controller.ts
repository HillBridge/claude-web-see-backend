import { Controller, Post, Req, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { ReportService } from './report.service';
import { ReportDataDto } from './dto/report-data.dto';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('数据上报')
@Controller()
export class ReportController {
  constructor(private reportService: ReportService) {}

  /**
   * SDK 数据上报入口
   *
   * 兼容两种上报方式：
   * 1. 普通 JSON POST (录屏/大数据)
   * 2. navigator.sendBeacon 发出的 text/plain 流 (性能/错误/白屏)
   *    — main.ts 已配置 express.json 接受 text/plain Content-Type，
   *      所以 sendBeacon 数据同样通过 @Body() 可以获取
   */
  @ApiOperation({ summary: '数据上报 (SDK → 服务端)' })
  @Public()
  @Post('reportData')
  @HttpCode(200)
  async reportData(@Body() body: any, @Req() req: Request): Promise<any> {
    let data: ReportDataDto = body;

    // body 为空时尝试从 rawBody 读取 (理论上 main.ts 的配置已覆盖此路径)
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

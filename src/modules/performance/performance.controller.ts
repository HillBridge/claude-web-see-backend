import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PerformanceService } from './performance.service';
import { QueryPerformanceDto } from './dto/query-performance.dto';

@ApiTags('性能数据')
@ApiBearerAuth()
@Controller('performance')
export class PerformanceController {
  constructor(private performanceService: PerformanceService) {}

  @ApiOperation({ summary: '性能数据列表' })
  @Get()
  findAll(@Query() query: QueryPerformanceDto) {
    return this.performanceService.findAll(query);
  }

  @ApiOperation({ summary: '某项目性能指标均值' })
  @Get('avg/:apikey')
  getAvg(@Param('apikey') apikey: string) {
    return this.performanceService.getAvgMetrics(apikey);
  }

  @ApiOperation({ summary: '性能数据详情' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.performanceService.findOne(id);
  }
}

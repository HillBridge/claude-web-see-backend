import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PerformanceService } from './performance.service';
import { QueryPerformanceDto } from './dto/query-performance.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { TenantUser } from '@/common/utils/tenant-scope';

@ApiTags('性能数据')
@ApiBearerAuth()
@Controller('performance')
export class PerformanceController {
  constructor(private performanceService: PerformanceService) {}

  @ApiOperation({ summary: '性能数据列表' })
  @Get()
  findAll(@Query() query: QueryPerformanceDto, @CurrentUser() user: TenantUser) {
    return this.performanceService.findAll(query, user);
  }

  @ApiOperation({ summary: '某项目性能指标均值' })
  @Get('avg/:apikey')
  getAvg(@Param('apikey') apikey: string, @CurrentUser() user: TenantUser) {
    return this.performanceService.getAvgMetrics(apikey, user);
  }

  @ApiOperation({ summary: '性能数据详情' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantUser) {
    return this.performanceService.findOne(id, user);
  }
}

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

  @ApiOperation({ summary: '某项目的页面列表(归一化,供选择器)' })
  @Get('pages/:apikey')
  listPages(@Param('apikey') apikey: string, @CurrentUser() user: TenantUser) {
    return this.performanceService.listPages(apikey, user);
  }

  @ApiOperation({ summary: '某项目性能快照(p75/p95 + good 占比,可选按页面)' })
  @Get('summary/:apikey')
  getSummary(
    @Param('apikey') apikey: string,
    @Query('pageUrl') pageUrl: string,
    @CurrentUser() user: TenantUser,
  ) {
    return this.performanceService.getSummary(apikey, user, pageUrl);
  }

  @ApiOperation({ summary: '某指标按天趋势(p75 + good 占比,可选按页面)' })
  @Get('trend/:apikey')
  getTrend(
    @Param('apikey') apikey: string,
    @Query() query: QueryPerformanceDto,
    @CurrentUser() user: TenantUser,
  ) {
    return this.performanceService.getTrend(
      apikey,
      user,
      query.name,
      query.pageUrl,
      query.startTime,
      query.endTime,
    );
  }

  @ApiOperation({ summary: '性能数据详情' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantUser) {
    return this.performanceService.findOne(id, user);
  }
}

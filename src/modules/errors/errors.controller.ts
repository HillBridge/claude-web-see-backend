import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ErrorsService } from './errors.service';
import { QueryErrorDto } from './dto/query-error.dto';
import { Public } from '@common/decorators/public.decorator';

@ApiTags('错误数据')
@Controller()
export class ErrorsController {
  constructor(private errorsService: ErrorsService) {}

  /** 兼容旧接口 /getErrorList — 前端 HomeView.vue 直接调用 */
  @ApiOperation({ summary: '获取错误列表 (兼容旧接口，Public)' })
  @Public()
  @Get('getErrorList')
  getErrorListLegacy(@Query() query: QueryErrorDto) {
    return this.errorsService.findAll(query);
  }

  @ApiOperation({ summary: '错误列表（分页 + 过滤）' })
  @ApiBearerAuth()
  @Get('errors')
  findAll(@Query() query: QueryErrorDto) {
    return this.errorsService.findAll(query);
  }

  @ApiOperation({ summary: '错误详情（含用户行为轨迹）' })
  @ApiBearerAuth()
  @Get('errors/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.errorsService.findOne(id);
  }
}

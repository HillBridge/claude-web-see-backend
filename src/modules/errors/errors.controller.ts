import { Controller, Get, Delete, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ErrorsService } from './errors.service';
import { QueryErrorDto } from './dto/query-error.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { TenantUser } from '@/common/utils/tenant-scope';

@ApiTags('错误数据')
@ApiBearerAuth()
@Controller()
export class ErrorsController {
  constructor(private errorsService: ErrorsService) {}

  @ApiOperation({ summary: '获取错误列表 (兼容旧接口)' })
  @Get('getErrorList')
  getErrorListLegacy(@Query() query: QueryErrorDto, @CurrentUser() user: TenantUser) {
    return this.errorsService.findAll(query, user);
  }

  @ApiOperation({ summary: '错误列表（分页 + 过滤）' })
  @ApiBearerAuth()
  @Get('errors')
  findAll(@Query() query: QueryErrorDto, @CurrentUser() user: TenantUser) {
    return this.errorsService.findAll(query, user);
  }

  @ApiOperation({ summary: '错误分组列表（去重聚合 + 分页）' })
  @ApiBearerAuth()
  @Get('errorGroups')
  findGroups(@Query() query: QueryErrorDto, @CurrentUser() user: TenantUser) {
    return this.errorsService.findGroups(query, user);
  }

  @ApiOperation({ summary: '某错误分组下的发生明细（分页）' })
  @ApiBearerAuth()
  @Get('errorGroups/:id/reports')
  findGroupReports(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryErrorDto,
    @CurrentUser() user: TenantUser,
  ) {
    return this.errorsService.findGroupReports(id, query, user);
  }

  @ApiOperation({ summary: '错误详情（含用户行为轨迹）' })
  @ApiBearerAuth()
  @Get('errors/:id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantUser) {
    return this.errorsService.findOne(id, user);
  }

  @ApiOperation({ summary: '删除错误分组及其全部关联数据（录屏 / 用户行为 / sourcemap）' })
  @ApiBearerAuth()
  @Delete('errorGroups/:id')
  removeGroup(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantUser) {
    return this.errorsService.deleteGroup(id, user);
  }
}

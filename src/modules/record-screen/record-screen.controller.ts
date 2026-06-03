import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RecordScreenService } from './record-screen.service';
import { QueryRecordScreenDto } from './dto/query-record-screen.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { TenantUser } from '@/common/utils/tenant-scope';

@ApiTags('录屏数据')
@ApiBearerAuth()
@Controller()
export class RecordScreenController {
  constructor(private recordScreenService: RecordScreenService) {}

  @ApiOperation({ summary: '按 recordScreenId 查询录屏（兼容旧接口）' })
  @Get('getRecordScreenId')
  getByRecordScreenId(@Query('id') id: string, @CurrentUser() user: TenantUser) {
    return this.recordScreenService.findByRecordScreenId(id, user);
  }

  @ApiOperation({ summary: '录屏列表（列表不含 events 大字段）' })
  @ApiBearerAuth()
  @Get('record-screens')
  findAll(@Query() query: QueryRecordScreenDto, @CurrentUser() user: TenantUser) {
    return this.recordScreenService.findAll(query, user);
  }

  @ApiOperation({ summary: '录屏详情（含 events）' })
  @ApiBearerAuth()
  @Get('record-screens/:id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantUser) {
    return this.recordScreenService.findOne(id, user);
  }
}


import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RecordScreenService } from './record-screen.service';
import { QueryRecordScreenDto } from './dto/query-record-screen.dto';

@ApiTags('录屏数据')
@ApiBearerAuth()
@Controller()
export class RecordScreenController {
  constructor(private recordScreenService: RecordScreenService) {}

  @ApiOperation({ summary: '按 recordScreenId 查询录屏（兼容旧接口）' })
  @Get('getRecordScreenId')
  getByRecordScreenId(@Query('id') id: string) {
    return this.recordScreenService.findByRecordScreenId(id);
  }

  @ApiOperation({ summary: '录屏列表（列表不含 events 大字段）' })
  @ApiBearerAuth()
  @Get('record-screens')
  findAll(@Query() query: QueryRecordScreenDto) {
    return this.recordScreenService.findAll(query);
  }

  @ApiOperation({ summary: '录屏详情（含 events）' })
  @ApiBearerAuth()
  @Get('record-screens/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recordScreenService.findOne(id);
  }
}


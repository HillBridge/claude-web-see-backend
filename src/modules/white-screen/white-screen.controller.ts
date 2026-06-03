import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WhiteScreenService } from './white-screen.service';
import { QueryWhiteScreenDto } from './dto/query-white-screen.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { TenantUser } from '@/common/utils/tenant-scope';

@ApiTags('白屏检测')
@ApiBearerAuth()
@Controller('white-screens')
export class WhiteScreenController {
  constructor(private whiteScreenService: WhiteScreenService) {}

  @ApiOperation({ summary: '白屏检测记录列表' })
  @Get()
  findAll(@Query() query: QueryWhiteScreenDto, @CurrentUser() user: TenantUser) {
    return this.whiteScreenService.findAll(query, user);
  }

  @ApiOperation({ summary: '白屏检测记录详情' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantUser) {
    return this.whiteScreenService.findOne(id, user);
  }
}

